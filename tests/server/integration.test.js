import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare} from 'miniflare';
import {newToken} from '../../live/client.js';
const origin='http://127.0.0.1:8080';
const directory=await mkdtemp(join(tmpdir(),'omok-do-test-'));
const options={modules:true,scriptPath:new URL('../../server/dist/worker.mjs',import.meta.url).pathname,compatibilityDate:'2026-07-30',
  durableObjects:{ROOMS:{className:'Room',useSQLite:true},REGISTRY:{className:'Registry',useSQLite:true}},durableObjectsPersist:directory,
  bindings:{ALLOWED_ORIGINS:origin}};
let mf=new Miniflare(options);
const sockets=[];
let testIp=0;test.beforeEach(()=>{testIp++;});
test.after(async()=>{for(const ws of sockets)try{ws.close();}catch{}await mf.dispose();await rm(directory,{recursive:true,force:true});});
async function request(path,data,token,extra={}){
  const res=await mf.dispatchFetch('https://backend.test'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'CF-Connecting-IP':`192.0.2.${testIp}`,...(token?{Authorization:`Bearer ${token}`}:{}) ,...extra},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:res.status,data:await res.json()};
}
async function setup(){const token=newToken();const created=await request('/rooms',{token,rounds:3});assert.equal(created.status,201);return {...created.data,token};}
async function student(teacher,name){const token=newToken();const response=await request('/join',{code:teacher.code,nickname:name,token});assert.equal(response.status,201);return {...response.data,token};}
async function socket(person){
  const issued=await request(`/rooms/${person.roomId}/ticket`,{},person.token);assert.equal(issued.status,200);
  const path=`/rooms/${person.roomId}/ws?ticket=${issued.data.ticket}`;
  const response=await mf.dispatchFetch('https://backend.test'+path,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(response.status,101);
  const ws=response.webSocket,events=[];ws.addEventListener('message',e=>events.push(JSON.parse(e.data)));ws.accept();sockets.push(ws);
  async function wait(fn){const limit=Date.now()+6000;while(Date.now()<limit){const event=events.find(fn);if(event)return event;await new Promise(r=>setTimeout(r,10));}assert.fail('No expected WebSocket event');}
  return {ws,events,wait,ticket:issued.data.ticket,send(action,data={},requestId=crypto.randomUUID()){ws.send(JSON.stringify({action,data,requestId}));return requestId;}};
}

test('origin checks, input size, missing auth and private init routes',async()=>{
  assert.equal((await request('/rooms',{token:newToken(),rounds:3},null,{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await request('/rooms',{token:newToken(),rounds:4})).status,400);
  assert.equal((await request('/rooms',{token:newToken(),rounds:3,padding:'x'.repeat(5000)})).status,413);
  assert.equal((await request('/rooms/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/init',{})).status,404);
  const t=await setup();assert.equal((await request(`/rooms/${t.roomId}/state`)).status,401);
  assert.equal((await request(`/rooms/${t.roomId}/state`,undefined,newToken())).status,401);
});
test('create and join retries are idempotent; ticket is single-use; old socket replaced',async()=>{
  const t=await setup(),again=await request('/rooms',{token:t.token,rounds:3});assert.equal(again.data.roomId,t.roomId);
  const s=await student(t,'바다친구');const retry=await request('/join',{code:t.code,nickname:'바다친구',token:s.token});assert.equal(retry.status,200);
  const first=await socket(s);await first.wait(e=>e.type==='snapshot');
  const replay=await mf.dispatchFetch(`https://backend.test/rooms/${s.roomId}/ws?ticket=${first.ticket}`,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(replay.status,401);
  const second=await socket(s);await second.wait(e=>e.type==='snapshot');
  const state=await request(`/rooms/${t.roomId}/state`,undefined,t.token);assert.equal(state.data.count,1);
});
test('real sockets coordinate play, hide names, reject privilege escalation and deduplicate a move',async()=>{
  const t=await setup(),a=await student(t,'비밀고래'),b=await student(t,'비밀토끼');
  assert.equal((await request('/join',{code:t.code,nickname:'세번째',token:newToken()})).status,201);
  const tw=await socket(t),aw=await socket(a),bw=await socket(b);
  await tw.wait(e=>e.state?.onlineCount===2);
  const forbidden=aw.send('start');await aw.wait(e=>e.requestId===forbidden&&e.type==='error');
  tw.send('start');const aState=(await aw.wait(e=>e.state?.phase==='playing')).state;const bState=(await bw.wait(e=>e.state?.phase==='playing')).state;
  assert.equal(JSON.stringify(aState).includes('비밀토끼'),false);assert.equal(JSON.stringify(bState).includes('비밀고래'),false);
  const black=aState.match.myColor===1?aw:bw,white=black===aw?bw:aw;
  const requestId=black.send('move',{matchId:aState.match.id,r:7,c:7,ply:0});await white.wait(e=>e.state?.match?.ply===1);
  black.send('move',{matchId:aState.match.id,r:7,c:7,ply:0},requestId);await black.wait(e=>e.type==='ack'&&e.requestId===requestId&&black.events.filter(v=>v.type==='ack'&&v.requestId===requestId).length>=2);
  const unauthorized=tw.send('move',{matchId:aState.match.id,r:0,c:0,ply:1});await tw.wait(e=>e.requestId===unauthorized&&e.type==='error');
  const state=await request(`/rooms/${t.roomId}/state`,undefined,t.token);assert.equal(state.data.match.ply,1);
  tw.send('draw');const end=(await aw.wait(e=>e.state?.match?.status==='draw')).state;assert.deepEqual(new Set(end.match.names),new Set(['비밀고래','비밀토끼']));assert.equal(end.me.points,1);
});
test('teacher lock, rename, revocation and closed-room rejection',async()=>{
  const t=await setup(),a=await student(t,'이름친구'),tw=await socket(t),aw=await socket(a);
  const initial=(await tw.wait(e=>e.state?.count===1)).state,id=initial.participants[0].id;
  tw.send('lock',{locked:true});await tw.wait(e=>e.state?.locked===true);
  assert.equal((await request('/join',{code:t.code,nickname:'새친구',token:newToken()})).status,403);
  tw.send('rename',{id,nickname:'바뀐이름'});await aw.wait(e=>e.state?.me?.nickname==='바뀐이름');
  tw.send('kick',{id});await tw.wait(e=>e.state?.count===0);
  assert.equal((await request(`/rooms/${t.roomId}/state`,undefined,a.token)).status,401);
  tw.send('close');await tw.wait(e=>e.state?.phase==='closed');assert.equal((await request('/join',{code:t.code,nickname:'다시참가',token:newToken()})).status,410);
});
test('durable state survives full runtime restart and participants reclaim the same match',async()=>{
  const t=await setup(),a=await student(t,'복귀친구'),b=await student(t,'기다린친구');
  const tw=await socket(t),aw=await socket(a),bw=await socket(b);await tw.wait(e=>e.state?.onlineCount===2);tw.send('start');
  const before=(await aw.wait(e=>e.state?.phase==='playing')).state;
  const black=before.match.myColor===1?aw:bw;black.send('move',{matchId:before.match.id,r:7,c:7,ply:0});await aw.wait(e=>e.state?.match?.ply===1);
  for(const ws of sockets)try{ws.close();}catch{}await mf.dispose();mf=new Miniflare(options);
  const restored=await request(`/rooms/${a.roomId}/state`,undefined,a.token);
  assert.equal(restored.status,200);assert.equal(restored.data.match.id,before.match.id);assert.equal(restored.data.match.board[7][7],1);assert.equal(restored.data.match.ply,1);assert.equal(restored.data.match.deadlineAt,before.match.deadlineAt);
  const back=await socket(a);assert.equal((await back.wait(e=>e.state?.match?.ply===1)).state.me.id,restored.data.me.id);
});

test('six students have independent real sockets and cannot act in another game',async()=>{
 const t=await setup(),people=[];for(let i=0;i<6;i++)people.push(await student(t,`여럿친구${i}`));
 const tw=await socket(t),ws=[];for(const p of people)ws.push(await socket(p));await tw.wait(e=>e.state?.onlineCount===6);tw.send('start');
 const snapshots=await Promise.all(ws.map(w=>w.wait(e=>e.state?.phase==='playing'))),states=snapshots.map(e=>e.state);
 assert.equal(new Set(states.map(s=>s.match.id)).size,3);
 for(let i=0;i<states.length;i++){assert.equal(states[i].participants,undefined);assert.equal(states[i].matches.length,3);for(let j=0;j<people.length;j++)if(i!==j)assert.equal(JSON.stringify(states[i]).includes(`여럿친구${j}`),false);}
 const first=states[0].match.id,blackIndex=states.findIndex(s=>s.match.id===first&&s.match.myColor===1),otherIndex=states.findIndex(s=>s.match.id!==first),opponentIndex=states.findIndex((s,i)=>s.match.id===first&&i!==blackIndex);
 const denied=ws[otherIndex].send('move',{matchId:first,ply:0,r:7,c:7});await ws[otherIndex].wait(e=>e.requestId===denied&&e.type==='error');
 ws[blackIndex].send('move',{matchId:first,ply:0,r:7,c:7});await ws[opponentIndex].wait(e=>e.state?.match?.ply===1);
 const unchanged=await request(`/rooms/${t.roomId}/state`,undefined,people[otherIndex].token);assert.equal(unchanged.data.match.ply,0);
 tw.send('draw',{matchId:first});await ws[opponentIndex].wait(e=>e.state?.match?.status==='draw');const mid=await request(`/rooms/${t.roomId}/state`,undefined,t.token);assert.equal(mid.data.phase,'playing');assert.equal(mid.data.completed,2);
 const tooSoon=tw.send('start');await tw.wait(e=>e.requestId===tooSoon&&e.type==='error');
 // Terminate and rebuild the runtime with all games persisted, including a completed one.
 for(const w of [tw,...ws])w.ws.close();await mf.dispose();mf=new Miniflare(options);
 const restored=await request(`/rooms/${t.roomId}/state`,undefined,people[otherIndex].token);assert.equal(restored.data.match.id,states[otherIndex].match.id);assert.equal(restored.data.match.ply,0);assert.equal(restored.data.completed,2);
 const backTeacher=await socket(t);backTeacher.send('draw');await backTeacher.wait(e=>e.state?.phase==='between');backTeacher.send('close');await backTeacher.wait(e=>e.state?.phase==='closed');
});
test('five students get one bye; new arrival waits for next round; full class capacity is enforced',async()=>{
 const t=await setup(),people=[];for(let i=0;i<5;i++)people.push(await student(t,`홀수친구${i}`));
 const tw=await socket(t),ws=[];for(const p of people)ws.push(await socket(p));await tw.wait(e=>e.state?.onlineCount===5);tw.send('start');
 const first=(await tw.wait(e=>e.state?.phase==='playing')).state;assert.equal(first.matches.length,3);assert.equal(first.completed,1);assert.equal(first.total,5);
 const byeIndex=(await Promise.all(people.map(p=>request(`/rooms/${t.roomId}/state`,undefined,p.token)))).findIndex(r=>r.data.bye);assert(byeIndex>=0);
 const late=await student(t,'나중친구');const lw=await socket(late);const waiting=(await lw.wait(e=>e.type==='snapshot')).state;assert.equal(waiting.waitingForNextRound,true);assert.equal(waiting.match,undefined);
 tw.send('draw');await tw.wait(e=>e.state?.phase==='between');tw.send('start');const second=(await tw.wait(e=>e.state?.round===2)).state;assert.equal(second.total,6);assert.equal(second.matches.filter(m=>m.status==='bye').length,0);await lw.wait(e=>e.state?.match?.status==='active');
 tw.send('close');await tw.wait(e=>e.state?.phase==='closed');
 const full=await setup(),classmates=[];for(let i=0;i<40;i++)classmates.push(await student(full,`정원학생${i}`));
 const extra=await request('/join',{code:full.code,nickname:'정원초과',token:newToken()});assert.equal(extra.status,409);
 const state=await request(`/rooms/${full.roomId}/state`,undefined,full.token);assert.equal(state.data.count,40);
 const fullTeacher=await socket(full),classSockets=[];for(const p of classmates)classSockets.push(await socket(p));
 await fullTeacher.wait(e=>e.state?.onlineCount===40);fullTeacher.send('start');
 const classStates=await Promise.all(classSockets.map(w=>w.wait(e=>e.state?.phase==='playing')));
 assert.equal(new Set(classStates.map(e=>e.state.match.id)).size,20);
 assert(classStates.every(e=>e.state.total===40&&e.state.matches.length===20));
 for(let i=0;i<classStates.length;i++)if(classStates[i].state.match.myColor===1)classSockets[i].send('move',{matchId:classStates[i].state.match.id,ply:0,r:7,c:7});
 await Promise.all(classSockets.map(w=>w.wait(e=>e.state?.match?.ply===1)));
 fullTeacher.send('close');await fullTeacher.wait(e=>e.state?.phase==='closed');
});

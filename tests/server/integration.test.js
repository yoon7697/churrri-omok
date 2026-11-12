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
test.after(async()=>{for(const ws of sockets)try{ws.close();}catch{}await mf.dispose();await rm(directory,{recursive:true,force:true});});
async function request(path,data,token,extra={}){
  const res=await mf.dispatchFetch('https://backend.test'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{}) ,...extra},body:data===undefined?undefined:JSON.stringify(data)});
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
  assert.equal((await request('/join',{code:t.code,nickname:'세번째',token:newToken()})).status,409);
  const tw=await socket(t),aw=await socket(a),bw=await socket(b);
  await tw.wait(e=>e.state?.onlineCount===2);
  const forbidden=aw.send('start');await aw.wait(e=>e.requestId===forbidden&&e.type==='error');
  tw.send('start');const aState=(await aw.wait(e=>e.state?.phase==='playing')).state;const bState=(await bw.wait(e=>e.state?.phase==='playing')).state;
  assert.equal(JSON.stringify(aState).includes('비밀토끼'),false);assert.equal(JSON.stringify(bState).includes('비밀고래'),false);
  const black=aState.match.myColor===1?aw:bw,white=black===aw?bw:aw;
  const requestId=black.send('move',{matchId:aState.match.id,r:7,c:7,ply:0});await white.wait(e=>e.state?.match?.ply===1);
  black.send('move',{matchId:aState.match.id,r:7,c:7,ply:0},requestId);await black.wait(e=>e.type==='ack'&&e.requestId===requestId);
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

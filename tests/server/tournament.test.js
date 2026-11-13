import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,command,expire,view,pairing,GAME_MS,ROOM_MS} from '../../server/src/model.js';
function fixture(count=6,rounds=7){const r=newRoom('room','1234',rounds,'secret',1000);r.participants=Array.from({length:count},(_,i)=>({id:`p${i}`,nickname:`학생${i}`,hash:`secret-${i}`,epoch:0,points:0,black:0,games:0}));return r;}
const ids=r=>r.participants.filter(p=>!p.removed).map(p=>p.id);
const current=r=>r.matches.filter(m=>m.round===r.round);
const start=(r,online=ids(r),now=1000)=>command(r,'teacher','start',{},online,now,()=>.9);
const move=(r,m,id=m.players[0],row=7,col=7)=>command(r,id,'move',{matchId:m.id,ply:m.ply,r:row,c:col},ids(r),1001);
function win(r,m){for(let c=3;c<7;c++)m.board[7][c]=1;move(r,m,m.players[0],7,7);}

test('six students get three independent games; finishing one cannot unlock next round',()=>{
 const r=fixture();start(r);const [a,b,c]=current(r);
 assert.equal(current(r).length,3);assert.equal(new Set(current(r).flatMap(m=>m.players)).size,6);
 move(r,a);assert.equal(a.ply,1);assert.equal(b.ply,0);assert.equal(c.board[7][7],0);
 assert.throws(()=>move(r,b,a.players[1]),/내 경기/);
 for(let x=3;x<7;x++)b.board[7][x]=1;move(r,b,b.players[0],7,7);
 assert.equal(r.phase,'playing');assert.equal(view(r,'teacher',ids(r),1001).completed,2);
 assert.throws(()=>start(r),/모든 경기/);assert.equal(r.round,1);
 command(r,'teacher','draw',{matchId:a.id},ids(r),1002);assert.equal(c.status,'active');
 command(r,'teacher','draw',{matchId:c.id},ids(r),1002);assert.equal(r.phase,'between');
 assert.equal(view(r,'teacher',ids(r),1002).completed,6);
});
test('score groups take precedence, rematches avoided within equal scores, colors balanced',()=>{
 const r=fixture(8);r.participants.forEach((p,i)=>p.points=i<4?2:0);
 const plan=pairing(r,ids(r),()=>.9);assert(plan.pairs.every(([a,b])=>a.points===b.points));
 start(r);const first=current(r).map(m=>m.players.slice());command(r,'teacher','draw',{},ids(r),1002);start(r);
 for(const m of current(r))assert(!first.some(players=>players.every(id=>m.players.includes(id))));
 assert.equal(r.participants.reduce((n,p)=>n+p.black,0),8);
 for(const p of r.participants){assert.equal(p.games,2);assert(Math.abs(2*p.black-p.games)<=2);}
});
test('odd fields award exactly one two-point bye, no repeats until eligible peers have had one',()=>{
 const r=fixture(5);const seen=new Set();
 for(let round=0;round<5;round++){
  start(r);const matches=current(r),bye=matches.find(m=>m.status==='bye');
  assert.equal(matches.length,3);assert.equal(matches.filter(m=>m.status==='bye').length,1);
  assert(!seen.has(bye.winner));seen.add(bye.winner);
  const state=view(r,bye.winner,ids(r),1001);assert.equal(state.bye,true);assert.equal(state.match,undefined);assert.equal(state.completed,1);assert.equal(state.total,5);
  command(r,'teacher','draw',{},ids(r),1002);
 }
 assert.equal(seen.size,5);assert(r.participants.every(p=>p.points===6));
});
test('bye ties prefer lowest points; offline participants never get paired or a bye',()=>{
 const r=fixture(6);r.participants.forEach((p,i)=>p.points=i);start(r,ids(r).slice(1));
 const bye=current(r).find(m=>m.status==='bye');assert.equal(bye.winner,'p1');assert(!current(r).some(m=>m.players.includes('p0')));
 assert.equal(r.participants[0].points,0);assert.equal(view(r,'p0',ids(r),1001).waitingForNextRound,true);
});
test('finished students cannot see identities or boards of still-active matches',()=>{
 const r=fixture();start(r);const [a,b]=current(r);win(r,a);
 const state=view(r,a.players[0],ids(r),1001);assert.equal(state.participants,undefined);
 assert.equal(state.match.result,'win');assert.equal(state.match.names.length,2);
 for(const m of state.matches.filter(m=>m.status==='active')){assert.equal(m.names,undefined);assert.equal(m.board,undefined);assert.equal(m.players,undefined);}
 const serialized=JSON.stringify(state);for(const id of b.players){const p=r.participants.find(p=>p.id===id);assert(!serialized.includes(p.nickname));assert(!serialized.includes(p.hash));assert(!serialized.includes(`"${id}"`));}
 const teacher=view(r,'teacher',ids(r),1001);assert.equal(teacher.matches.length,3);assert(teacher.matches.every(m=>m.names.length===2));assert.equal(teacher.match,undefined);
});
test('late/rejoining students wait until next round, assigned students restore only their match',()=>{
 const r=fixture(6);start(r,ids(r).slice(0,4));
 const wait=view(r,'p4',ids(r),1001);assert.equal(wait.waitingForNextRound,true);assert.equal(wait.match,undefined);
 const m=current(r)[0];move(r,m);const restored=view(r,m.players[0],ids(r),1002);assert.equal(restored.match.id,m.id);assert.equal(restored.match.ply,1);
 command(r,'teacher','draw',{},ids(r),1003);start(r);assert.equal(view(r,'p4',ids(r),1004).waitingForNextRound,false);assert.equal(current(r).flatMap(m=>m.players).length,6);
});
test('all deadlines expire independently and delayed alarm cannot score twice',()=>{
 const r=fixture();start(r);const [a,b,c]=current(r);a.deadlineAt=1500;b.deadlineAt=2500;c.deadlineAt=3500;
 assert.equal(expire(r,1500),true);assert.equal(a.status,'draw');assert.equal(b.status,'active');assert.equal(r.phase,'playing');
 assert.equal(expire(r,2500),true);assert.equal(c.status,'active');expire(r,3500);assert.equal(r.phase,'between');
 assert(r.participants.every(p=>p.points===1));assert.equal(expire(r,1000+GAME_MS),false);assert(r.participants.every(p=>p.points===1));
});
test('kicking one player draws only that game; close draws all remaining games',()=>{
 const r=fixture();start(r);const [a,b,c]=current(r);command(r,'teacher','kick',{id:a.players[0]},ids(r),1001);
 assert.equal(a.status,'draw');assert.equal(b.status,'active');assert.equal(c.status,'active');assert.equal(r.phase,'playing');
 command(r,'teacher','close',{},ids(r),1002);assert.equal(r.phase,'closed');assert(current(r).every(m=>m.status==='draw'));assert(r.participants.every(p=>p.points===1));
});
test('all 3/5/7-round tournaments finish only after last game and equal scores share ranks',()=>{
 for(const rounds of [3,5,7]){const r=fixture(4,rounds);for(let i=0;i<rounds;i++){start(r);const [a,b]=current(r);command(r,'teacher','draw',{matchId:a.id},ids(r),1001);assert.equal(r.phase,'playing');command(r,'teacher','draw',{matchId:b.id},ids(r),1001);}
 assert.equal(r.phase,'finished');assert.throws(()=>start(r));assert.deepEqual(view(r,'p0',ids(r),1002).standings.map(p=>p.rank),[1,1,1,1]);}
});
test('existing two-student saved room needs no destructive migration; room expiry settles every game',()=>{
 const r=fixture(2);start(r);delete r.matches[0].number;const restored=structuredClone(r);assert.equal(view(restored,'p0',ids(r),1001).match.number,1);assert.equal(view(restored,'teacher',ids(r),1001).match.id,r.matches[0].id);
 const many=fixture(7);start(many);expire(many,1000+ROOM_MS);assert.equal(many.phase,'closed');assert(current(many).every(m=>m.status!=='active'));
});
test('40 students and randomized smaller fields never duplicate or omit an eligible student',()=>{
 let seed=17;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(let n=2;n<=40;n++){const r=fixture(n);r.participants.forEach(p=>p.points=Math.floor(random()*5));for(let round=0;round<3;round++){
 command(r,'teacher','start',{},ids(r),1000,random);const all=current(r).flatMap(m=>m.players);assert.equal(all.length,n);assert.equal(new Set(all).size,n);assert.equal(current(r).filter(m=>m.status==='bye').length,n%2);command(r,'teacher','draw',{},ids(r),1001);
 }}
});

test('an offline student excluded from the final round sees final standings, never a nonexistent next round',()=>{
 const r=fixture(5,3);for(let i=0;i<3;i++){start(r,ids(r).slice(0,4));command(r,'teacher','draw',{},ids(r),1001);}
 const s=view(r,'p4',ids(r),1002);assert.equal(s.phase,'finished');assert.equal(s.waitingForNextRound,false);assert.equal(s.match,undefined);assert.equal(s.standings.length,5);assert.equal(s.standings.at(-1).rank,5);
});

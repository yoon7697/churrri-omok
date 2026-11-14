import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,command,view,expire,GAME_MS} from '../../server/src/model.js';
function setup(n=5){const r=newRoom('room','1234',3,'teacher-secret',1000);r.participants=Array.from({length:n},(_,i)=>({id:`p${i}`,nickname:`관전학생${i}`,hash:`student-secret-${i}`,epoch:0,points:0,black:0,games:0}));command(r,'teacher','start',{},r.participants.map(p=>p.id),1000,()=>.9);return r;}
const ids=r=>r.participants.map(p=>p.id);
const matches=r=>r.matches.filter(m=>m.round===r.round);
const watch=(r,id,m)=>command(r,id,'watch',{matchId:m.id},ids(r),1001);

test('bye students watch a live board without opponent identities and cannot play',()=>{
 const r=setup(),m=matches(r)[0],bye=matches(r).find(m=>m.status==='bye').winner;
 watch(r,bye,m);const s=view(r,bye,ids(r),1001);assert.equal(s.bye,true);assert.equal(s.spectating.id,m.id);assert.equal(s.spectating.myColor,0);assert.equal(s.spectating.readOnly,true);assert.equal(s.spectating.names,undefined);
 for(const id of m.players){assert(!JSON.stringify(s.spectating).includes(r.participants.find(p=>p.id===id).nickname));assert(!JSON.stringify(s).includes(`student-secret-${id.slice(1)}`));}
 const before=JSON.stringify(r);assert.throws(()=>command(r,bye,'move',{matchId:m.id,ply:0,r:7,c:7,myColor:1},ids(r),1001),/내 경기/);assert.equal(JSON.stringify(r),before);
 command(r,m.players[0],'move',{matchId:m.id,ply:0,r:7,c:7},ids(r),1002);assert.equal(view(r,bye,ids(r),1002).spectating.board[7][7],1);
});
test('players still competing cannot select another board, even through forged commands',()=>{
 const r=setup(4),[a,b]=matches(r);assert.equal(view(r,a.players[0],ids(r),1001).canWatch,false);
 assert.throws(()=>watch(r,a.players[0],b),/내 경기가 끝난 뒤/);assert.equal(view(r,a.players[0],ids(r),1001).spectating,undefined);
});
test('finished students retain own result and points while watching another match',()=>{
 const r=setup(4),[a,b]=matches(r);command(r,'teacher','draw',{matchId:a.id},ids(r),1001);watch(r,a.players[0],b);
 const s=view(r,a.players[0],ids(r),1002);assert.equal(s.match.id,a.id);assert.equal(s.match.result,'draw');assert.equal(s.me.points,1);assert.equal(s.spectating.id,b.id);assert.equal(s.participants,undefined);
 command(r,'teacher','draw',{matchId:b.id},ids(r),1003);const end=view(r,a.players[0],ids(r),1003);assert.equal(end.spectating.result,'draw');assert.equal(end.spectating.names.length,2);assert.equal(end.me.points,1);
});
test('teacher can select any current game; unwatch changes neither board nor scores',()=>{
 const r=setup(4),[a,b]=matches(r);watch(r,'teacher',b);const s=view(r,'teacher',ids(r),1001);assert.equal(s.spectating.id,b.id);assert.equal(s.spectating.names.length,2);assert.equal(s.spectating.result,null);
 const before=JSON.stringify(r.matches);command(r,'teacher','unwatch',{},ids(r),1002);assert.equal(view(r,'teacher',ids(r),1002).spectating,undefined);assert.equal(JSON.stringify(r.matches),before);assert(r.participants.every(p=>p.points===0));
});
test('next round clears watching for every role and restores the viewer to their own game',()=>{
 const r=setup(),bye=matches(r).find(m=>m.status==='bye').winner,m=matches(r)[0];watch(r,bye,m);watch(r,'teacher',m);
 command(r,'teacher','draw',{},ids(r),1002);command(r,'teacher','start',{},ids(r),1003,()=>.9);
 const s=view(r,bye,ids(r),1003);assert.equal(s.round,2);assert.equal(s.spectating,undefined);assert.equal(s.match.status,'active');assert.equal(s.canWatch,false);assert.equal(r.teacher.watching,undefined);
});
test('late arrivals can observe; unknown, own, bye and previous-round selections are rejected',()=>{
 const r=setup(4),m=matches(r)[0];r.participants.push({id:'late',nickname:'나중친구',hash:'late-secret',epoch:0,points:0,black:0,games:0});
 watch(r,'late',m);assert.equal(view(r,'late',ids(r),1001).waitingForNextRound,true);assert.equal(view(r,'late',ids(r),1001).spectating.id,m.id);
 assert.throws(()=>watch(r,'late',{id:'another-room-match'}));command(r,'teacher','draw',{},ids(r),1002);assert.throws(()=>watch(r,m.players[0],m));command(r,'teacher','start',{},ids(r),1003,()=>.9);assert.throws(()=>watch(r,'teacher',m));
 const bye=matches(r).find(m=>m.status==='bye');assert.throws(()=>watch(r,'teacher',bye));
});
test('observed wins and timeout reveal names with a neutral result, never a spectator win or loss',()=>{
 const r=setup(),m=matches(r)[0],bye=matches(r).find(m=>m.status==='bye').winner;watch(r,bye,m);
 for(let c=3;c<7;c++)m.board[7][c]=1;command(r,m.players[0],'move',{matchId:m.id,ply:0,r:7,c:7},ids(r),1002);
 const s=view(r,bye,ids(r),1002);assert.equal(s.spectating.result,'decided');assert.equal(s.spectating.winnerColor,1);assert.equal(s.spectating.names.length,2);assert.equal(s.me.points,2);
 const other=matches(r).find(m=>m.status==='active');watch(r,bye,other);expire(r,1000+GAME_MS);assert.equal(view(r,bye,ids(r),1000+GAME_MS).spectating.result,'draw');
});
test('removed students and closed rooms cannot retain access to a watched board',()=>{
 const r=setup(),m=matches(r)[0],bye=matches(r).find(m=>m.status==='bye').winner;watch(r,bye,m);command(r,'teacher','kick',{id:bye},ids(r),1002);assert.throws(()=>view(r,bye,ids(r),1003));assert.throws(()=>watch(r,bye,m));
 watch(r,'teacher',m);command(r,'teacher','close',{},ids(r),1004);assert.equal(view(r,'teacher',ids(r),1004).spectating,undefined);assert.throws(()=>watch(r,'teacher',m));
});

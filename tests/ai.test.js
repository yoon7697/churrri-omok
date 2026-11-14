import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseMove, legalMoves, LEVELS} from '../ai.js';
import {emptyBoard, tryMove, isDoubleThree} from '../rules.js';
const levels=Object.keys(LEVELS);
const frozenTime={random:()=>0.9};
const make=(points,color)=>{const b=emptyBoard();for(const [r,c] of points)b[r][c]=color;return b;};
for(const level of levels)for(const color of [1,2]){
  test(`${level}/${color}: center opening and input unchanged`,()=>{
    const b=emptyBoard(),before=JSON.stringify(b);
    assert.deepEqual(chooseMove(b,color,level,frozenTime),{r:7,c:7});assert.equal(JSON.stringify(b),before);
  });
  test(`${level}/${color}: wins before defending`,()=>{
    const b=make([[7,3],[7,4],[7,5],[7,6]],color);b[7][2]=3-color;
    for(const c of [3,4,5,6])b[3][c]=3-color;
    assert.deepEqual(chooseMove(b,color,level),{r:7,c:7});
  });
  for(const [name,points,end,block] of [
    ['horizontal',[[7,3],[7,4],[7,5],[7,6]],[7,7],[7,2]],
    ['vertical',[[3,7],[4,7],[5,7],[6,7]],[7,7],[2,7]],
    ['diagonal',[[3,3],[4,4],[5,5],[6,6]],[7,7],[2,2]],
    ['anti diagonal',[[3,11],[4,10],[5,9],[6,8]],[7,7],[2,12]],
    ['edge',[[0,0],[0,1],[0,2],[0,3]],[0,4],null],
    ['broken four',[[7,3],[7,4],[7,6],[7,7]],[7,5],null]
  ])test(`${level}/${color}: blocks ${name}`,()=>{
    const b=make(points,3-color);if(block)b[block[0]][block[1]]=color;
    const before=JSON.stringify(b),m=chooseMove(b,color,level,frozenTime);
    assert.deepEqual(m,{r:end[0],c:end[1]});assert.equal(JSON.stringify(b),before);assert.equal(tryMove(b,m.r,m.c,color).ok,true);
  });
  test(`${level}/${color}: avoids cross double three`,()=>{
    const b=make([[7,6],[7,8],[6,7],[8,7]],color),before=JSON.stringify(b);
    const m=chooseMove(b,color,level,frozenTime);
    assert.notDeepEqual(m,{r:7,c:7});assert.equal(isDoubleThree(b,m.r,m.c,color),false);assert.equal(JSON.stringify(b),before);
  });
  test(`${level}/${color}: five overrides double three`,()=>{
    const b=make([[7,3],[7,4],[7,5],[7,6],[6,7],[8,7]],color);b[7][2]=3-color;
    const m=chooseMove(b,color,level);assert.deepEqual(m,{r:7,c:7});assert.equal(tryMove(b,m.r,m.c,color).win,true);
  });
  test(`${level}/${color}: creates an open four`,()=>{
    const b=make([[7,5],[7,6],[7,7]],color);b[3][3]=3-color;
    const m=chooseMove(b,color,level,frozenTime);assert.equal(m.r,7);assert.ok([4,8].includes(m.c));
  });
  test(`${level}/${color}: defends open three`,()=>{
    const b=make([[7,5],[7,6],[7,7]],3-color);b[3][3]=color;
    const m=chooseMove(b,color,level,frozenTime);assert.equal(m.r,7);assert.ok([4,8].includes(m.c));
  });
}
test('full board returns null for every level',()=>{const b=Array.from({length:15},()=>Array(15).fill(1));for(const level of levels)assert.equal(chooseMove(b,2,level),null);});
test('one remaining legal point is played',()=>{const b=Array.from({length:15},(_,r)=>Array.from({length:15},(_,c)=>(Math.floor(c/2)+r)%2+1));b[14][14]=0;assert.deepEqual(chooseMove(b,1),{r:14,c:14});});
test('easy mistakes vary legal nonurgent choices',()=>{const b=emptyBoard();b[7][7]=1;const best=chooseMove(b,2,'easy',{random:()=>0.9});const other=chooseMove(b,2,'easy',{random:()=>0});assert.notDeepEqual(other,best);assert.equal(tryMove(b,other.r,other.c,2).ok,true);});
test('budget expiry returns a legal move without changing input',()=>{const b=emptyBoard();b[7][7]=1;let clock=0;const before=JSON.stringify(b);const m=chooseMove(b,2,'hard',{now:()=>clock+=1000});assert.equal(JSON.stringify(b),before);assert.equal(tryMove(b,m.r,m.c,2).ok,true);});
test('legal enumeration excludes both-color forbidden and occupied points',()=>{for(const p of [1,2]){const b=make([[7,6],[7,8],[6,7],[8,7]],p);assert.ok(!legalMoves(b,p).some(m=>m.r===7&&m.c===7));assert.ok(!legalMoves(b,p).some(m=>m.r===7&&m.c===6));}});
test('seeded legal playout across all levels',()=>{
  let seed=17;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
  for(const level of levels){const b=emptyBoard();for(let i=0;i<30;i++){
    const p=i%2+1, snapshot=JSON.stringify(b),m=chooseMove(b,p,level,{random});if(!m)break;
    assert.equal(JSON.stringify(b),snapshot);const result=tryMove(b,m.r,m.c,p);assert.ok(result.ok);if(result.win||result.draw)break;
  }}
});
test('final legal move produces draw, never a false win',()=>{
  const b=Array.from({length:15},(_,r)=>Array.from({length:15},(_,c)=>(Math.floor(c/2)+r)%2+1));
  b[14][12]=0;
  assert.deepEqual(tryMove(b,14,12,1),{ok:true,win:false,draw:true});
});


test('normal also offers weaker legal choices between tactical emergencies',()=>{
  const board=emptyBoard();board[7][7]=1;
  const best=chooseMove(board,2,'normal',{random:()=>0.9}),other=chooseMove(board,2,'normal',{random:()=>0});
  assert.notDeepEqual(other,best);assert.equal(tryMove(board,other.r,other.c,2).ok,true);
});
test('easy relaxes more often than normal, while both always finish or block an immediate five',()=>{
  const board=emptyBoard();board[7][7]=1;
  const best=chooseMove(board,2,'normal',{random:()=>0.9});
  let easyChoices=0,normalChoices=0;
  for(const level of ['easy','normal'])for(const roll of [0.1,0.4,0.8]){
    let calls=0;const move=chooseMove(board,2,level,{random:()=>calls++===0?roll:0});
    if(JSON.stringify(move)!==JSON.stringify(best)){if(level==='easy')easyChoices++;else normalChoices++;}
  }
  assert.ok(easyChoices>normalChoices);
  for(const level of ['easy','normal'])for(const color of [1,2]){
    const blocked=make([[7,3],[7,4],[7,5],[7,6]],3-color);blocked[7][2]=color;
    assert.deepEqual(chooseMove(blocked,color,level,{random:()=>0}),{r:7,c:7});
    const winning=make([[7,3],[7,4],[7,5],[7,6]],color);winning[7][2]=3-color;
    assert.deepEqual(chooseMove(winning,color,level,{random:()=>0}),{r:7,c:7});
  }
});

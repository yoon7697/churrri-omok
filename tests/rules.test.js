import test from 'node:test';
import assert from 'node:assert/strict';
import {SIZE, emptyBoard, inBounds, countLine, isBoardFull, isFive, isDoubleThree, tryMove} from '../rules.js';
const make=(points, color=1)=>{const b=emptyBoard();for(const [r,c] of points)b[r][c]=color;return b;};
const snapshot=b=>JSON.stringify(b);

test('empty board is 15x15 with all zeros',()=>{const b=emptyBoard();assert.equal(b.length,SIZE);assert.ok(b.every(row=>row.length===SIZE&&row.every(v=>v===0)));assert.equal(isBoardFull(b),false);});
test('black starts on empty board',()=>{const b=emptyBoard();assert.equal(tryMove(b,7,7,1).ok,true);assert.equal(b[7][7],1);});
test('invalid color, fractional and outside coordinates are rejected without mutations',()=>{const b=emptyBoard(),before=snapshot(b);for(const args of [[7,7,0],[7,7,3],[-1,7,1],[15,7,1],[7,15,2],[7.5,7,1],[NaN,7,1]])assert.equal(tryMove(b,...args).ok,false);assert.equal(snapshot(b),before);assert.equal(inBounds(0,0),true);assert.equal(inBounds(15,1),false);});
test('occupied point cannot be overwritten',()=>{const b=emptyBoard();tryMove(b,7,7,1);assert.equal(tryMove(b,7,7,2).ok,false);assert.equal(b[7][7],1);});
for(const [title, coords, dest] of [
  ['horizontal five',[[7,3],[7,4],[7,5],[7,6]],[7,7]],
  ['vertical five',[[3,7],[4,7],[5,7],[6,7]],[7,7]],
  ['main diagonal five',[[3,3],[4,4],[5,5],[6,6]],[7,7]],
  ['other diagonal five',[[3,11],[4,10],[5,9],[6,8]],[7,7]],
  ['five on upper edge',[[0,0],[0,1],[0,2],[0,3]],[0,4]],
])test(title,()=>{for(const color of [1,2]){const b=make(coords,color);const m=tryMove(b,...dest,color);assert.deepEqual([m.ok,m.win,m.draw],[true,true,false]);assert.equal(isFive(b,...dest,color),true);}});
test('six in a row wins under classroom house rule',()=>{const b=make([[7,3],[7,4],[7,5],[7,6],[7,7]]);assert.equal(tryMove(b,7,8,1).win,true);assert.equal(countLine(b,7,8,0,1,1),6);});
test('isFive requires a stone at target',()=>{assert.equal(isFive(emptyBoard(),7,7,1),false);});
for(const color of [1,2]) {
  test(`${color===1?'black':'white'} cross 3·3 forbidden and nonmutating`,()=>{const b=make([[7,6],[7,8],[6,7],[8,7]],color),prev=snapshot(b);assert.equal(isDoubleThree(b,7,7,color),true);assert.equal(snapshot(b),prev);assert.equal(tryMove(b,7,7,color).ok,false);assert.equal(snapshot(b),prev);});
  test(`${color===1?'black':'white'} diagonal 3·3 forbidden`,()=>{const b=make([[6,6],[8,8],[6,8],[8,6]],color);assert.equal(isDoubleThree(b,7,7,color),true);});
  test(`${color===1?'black':'white'} broken 3·3 forbidden`,()=>{const b=make([[7,6],[7,9],[6,7],[9,7]],color);assert.equal(isDoubleThree(b,7,7,color),true);});
  test(`${color===1?'black':'white'} single open three allowed`,()=>{const b=make([[7,6],[7,8]],color);assert.equal(tryMove(b,7,7,color).ok,true);});
  test(`${color===1?'black':'white'} blocked axis is not a 3·3`,()=>{const b=make([[7,6],[7,8],[6,7],[8,7]],color);b[7][5]=3-color;b[7][9]=3-color;assert.equal(isDoubleThree(b,7,7,color),false);});
  test(`${color===1?'black':'white'} edge-bound three is not open`,()=>{const b=make([[0,1],[0,2],[1,0],[2,0]],color);assert.equal(isDoubleThree(b,0,0,color),false);});
  test(`${color===1?'black':'white'} winning five prioritized over potential double three`,()=>{const b=make([[7,3],[7,4],[7,5],[7,6],[6,7],[8,7]],color);assert.equal(isDoubleThree(b,7,7,color),false);assert.equal(tryMove(b,7,7,color).win,true);});
}
test('blocked four or three does not falsely win',()=>{const b=make([[7,3],[7,4],[7,5]]);assert.equal(tryMove(b,7,6,1).win,false);});
test('board full detection',()=>{const b=Array.from({length:SIZE},()=>Array(SIZE).fill(1));assert.equal(isBoardFull(b),true);b[14][14]=0;assert.equal(isBoardFull(b),false);});
test('rejected double three never changes board across repeated checks',()=>{const b=make([[7,6],[7,8],[6,7],[8,7]]),prev=snapshot(b);for(let i=0;i<3;i++)assert.equal(isDoubleThree(b,7,7,1),true);assert.equal(snapshot(b),prev);});

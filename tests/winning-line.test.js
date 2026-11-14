import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard} from '../rules.js';
import {winningStones} from '../winning-line.js';
for(const color of [1,2])for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
  test(`winning stones: color ${color}, axis ${dr}/${dc}`,()=>{
    const board=emptyBoard(),points=Array.from({length:5},(_,i)=>({r:7+(i-2)*dr,c:7+(i-2)*dc}));
    for(const p of points)board[p.r][p.c]=color;
    board[0][0]=3-color;const before=JSON.stringify(board);
    assert.deepEqual(new Set(winningStones(board,{r:7,c:7}).map(p=>`${p.r},${p.c}`)),new Set(points.map(p=>`${p.r},${p.c}`)));
    assert.equal(JSON.stringify(board),before);
  });
}
test('edge overline selects exactly five including the final move',()=>{
  const board=emptyBoard();for(let c=0;c<7;c++)board[0][c]=1;
  for(const c of [0,3,6]){const cells=winningStones(board,{r:0,c});assert.equal(cells.length,5);assert.ok(cells.some(p=>p.r===0&&p.c===c));}
});
test('simultaneous winning axes show both lines without repeating the final stone',()=>{
  const board=emptyBoard();for(let i=5;i<=9;i++){board[7][i]=2;board[i][7]=2;}
  assert.equal(winningStones(board,{r:7,c:7}).length,9);
});
test('gaps, opponent stones and a last move outside an older five never produce a highlight',()=>{
  const board=emptyBoard();for(let c=3;c<=7;c++)board[7][c]=1;
  board[0][0]=1;assert.deepEqual(winningStones(board,{r:0,c:0}),[]);
  board[7][5]=2;assert.deepEqual(winningStones(board,{r:7,c:7}),[]);
  board[7][5]=0;assert.deepEqual(winningStones(board,{r:7,c:7}),[]);
});
test('empty or invalid last move and a full drawn board have no winning stones',()=>{
  const board=Array.from({length:15},(_,r)=>Array.from({length:15},(_,c)=>(Math.floor(c/2)+r)%2+1));
  for(const p of [null,{r:-1,c:0},{r:1.5,c:1},{r:14,c:14}])assert.deepEqual(winningStones(board,p),[]);
  assert.deepEqual(winningStones(emptyBoard(),{r:7,c:7}),[]);
});

import {inBounds} from './rules.js';

// Presentation only: keep the rule engine and server results authoritative.
// Return five connected stones through the final move for each winning axis.
export function winningStones(board,lastMove){
  if(!lastMove||!inBounds(lastMove.r,lastMove.c))return [];
  const {r,c}=lastMove,color=board[r][c];
  if(color!==1&&color!==2)return [];
  const result=new Map();
  for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
    const before=[],after=[];
    for(let y=r-dr,x=c-dc;inBounds(y,x)&&board[y][x]===color;y-=dr,x-=dc)before.unshift({r:y,c:x});
    for(let y=r+dr,x=c+dc;inBounds(y,x)&&board[y][x]===color;y+=dr,x+=dc)after.push({r:y,c:x});
    const line=[...before,{r,c},...after];
    if(line.length<5)continue;
    const start=Math.max(0,Math.min(before.length-2,line.length-5));
    for(const cell of line.slice(start,start+5))result.set(`${cell.r},${cell.c}`,cell);
  }
  return [...result.values()];
}

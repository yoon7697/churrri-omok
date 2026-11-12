// CHURRRI'S LAB · 우리 반 오목왕 v0.1
// Rule variant: both colors forbidden to create double-open-three.
// Local game only. No network, no accounts, no player information storage.
export const SIZE = 15;
export function emptyBoard(){return Array.from({length:SIZE},()=>Array(SIZE).fill(0));}
export function inBounds(r,c){return r>=0&&r<SIZE&&c>=0&&c<SIZE;}
const DIRS=[[1,0],[0,1],[1,1],[1,-1]];
export function countLine(board,r,c,dr,dc,player){let total=1;for(const s of [-1,1]){let y=r+dr*s,x=c+dc*s;while(inBounds(y,x)&&board[y][x]===player){total++;y+=dr*s;x+=dc*s;}}return total;}
export function isFive(board,r,c,player){return DIRS.some(([dr,dc])=>countLine(board,r,c,dr,dc,player)>=5);}
function hasOpenFourIncluding(board,r,c,dr,dc,player,originR,originC){
  // A straight four and two empty ends, with the newly-added probe and original move inside.
  for(let start=-4;start<=0;start++){
    const coords=Array.from({length:4},(_,i)=>[r+(start+i)*dr,c+(start+i)*dc]);
    if(!coords.every(([y,x])=>inBounds(y,x)&&board[y][x]===player))continue;
    if(!coords.some(([y,x])=>y===originR&&x===originC))continue;
    const before=[r+(start-1)*dr,c+(start-1)*dc];const after=[r+(start+4)*dr,c+(start+4)*dc];
    if(inBounds(...before)&&inBounds(...after)&&board[before[0]][before[1]]===0&&board[after[0]][after[1]]===0)return true;
  }
  return false;
}
function hasOpenThreeInDirection(board,r,c,dr,dc,player){
  // An open three has at least one one-stone extension that creates a straight open four.
  // Reject extensions already forming five (these are not a three).
  for(let offset=-4;offset<=4;offset++){
    if(offset===0)continue;
    const y=r+offset*dr,x=c+offset*dc;
    if(!inBounds(y,x)||board[y][x]!==0)continue;
    board[y][x]=player;
    const isThreeExtension=!isFive(board,y,x,player)&&hasOpenFourIncluding(board,y,x,dr,dc,player,r,c);
    board[y][x]=0;
    if(isThreeExtension)return true;
  }
  return false;
}
export function isDoubleThree(board,r,c,player){
  if(!inBounds(r,c)||board[r][c]!==0)return false;
  board[r][c]=player;
  // In this classroom variant, a winning five is allowed even if the last move overlaps two threes.
  if(isFive(board,r,c,player)){board[r][c]=0;return false;}
  const count=DIRS.filter(([dr,dc])=>hasOpenThreeInDirection(board,r,c,dr,dc,player)).length;
  board[r][c]=0;
  return count>=2;
}
export function tryMove(board,r,c,player){
  if(!inBounds(r,c))return {ok:false,reason:'바둑판 밖에는 둘 수 없어요.'};
  if(board[r][c]!==0)return {ok:false,reason:'이미 돌이 놓인 자리예요.'};
  if(isDoubleThree(board,r,c,player))return {ok:false,reason:'3·3 금지! 두 방향에 동시에 열린 삼을 만들 수 없어요.'};
  board[r][c]=player;
  return {ok:true,win:isFive(board,r,c,player),draw:board.every(row=>row.every(cell=>cell!==0))};
}

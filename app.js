import {SIZE,emptyBoard,tryMove} from './rules.js';
const $=id=>document.getElementById(id);
const boardEl=$('board');
let board=emptyBoard();let player=1;let moves=[];let finished=false;
const modal=$('infoDialog');
const eventModal=$('gameEventDialog');
let lastFocusedElement=null;
function viewGame(){
  document.body.classList.remove('home-mode');
  document.body.classList.add('playing-mode');
  $('gameSection').classList.remove('hidden');
  // No scroll animation: the game is now a separate full-screen view.
  window.scrollTo(0,0);
  $('gameSection').focus({preventScroll:true});
}
function viewHome(){
  if(eventModal.open)eventModal.close();
  document.body.classList.remove('playing-mode');
  document.body.classList.add('home-mode');
  $('gameSection').classList.add('hidden');
  window.scrollTo(0,0);
  $('startLocal').focus({preventScroll:true});
}
function showGameEvent(type, title, text){
  lastFocusedElement=document.activeElement;
  $('gameEventTitle').textContent=title;
  $('gameEventText').textContent=text;
  $('gameEventSymbol').textContent=type==='win'?'🏆':type==='draw'?'🤝':'🚫';
  const actions=$('gameEventActions');actions.replaceChildren();
  const makeButton=(label,action,primary=false)=>{
    const button=document.createElement('button');
    button.type='button';button.className='event-action'+(primary?' primary':'');button.textContent=label;
    button.addEventListener('click',()=>{eventModal.close();action();});
    actions.append(button);
  };
  if(type==='forbidden')makeButton('닫기',()=>{lastFocusedElement?.focus?.({preventScroll:true});},true);
  else{
    makeButton('처음 화면',()=>viewHome());
    makeButton('새 게임',()=>{reset();$('gameSection').focus({preventScroll:true});},true);
  }
  eventModal.showModal();
}

const modalText={
  rules:{title:'오목왕 규칙',html:'<ul><li>15×15 오목판에서 흑돌이 먼저 시작해요.</li><li>흑과 백 모두 두 방향에 동시에 열린 삼을 만드는 <b>3·3은 금지</b>예요.</li><li>가로·세로·대각선으로 돌을 연속 5개 이상 연결하면 승리해요.</li><li>둘 수 있는 곳이 남지 않으면 무승부예요.</li><li>3·3 판정 테스트를 보강했지만, 공식 대회 적용 전 다양한 실전 상황 검증이 필요해요.</li></ul>'},
  help:{title:'사용 방법',html:'<ol><li><b>1:1 대결 → 바로 대결하기</b>를 눌러요.</li><li>친구 두 명이 한 기기에서 번갈아 교차점을 눌러요.</li><li>마지막 수는 빨간 점, 현재 차례는 오른쪽에 표시돼요.</li><li>잘못 둔 수는 <b>한 수 무르기</b>, 새로 시작하려면 <b>새 게임</b>을 눌러요.</li></ol><p>온라인 방 만들기, 컴퓨터 연습, 방 코드 기능은 다음 버전에서 제공할 예정이에요.</p>'}
};
function showDialog(title,html){$('dialogTitle').textContent=title;$('dialogContent').innerHTML=html;modal.showModal();}
function renderBoard(){
  boardEl.replaceChildren();
  // Centers are 6.25%, 12.5%, ... 93.75% (15 intersections).
  const pos=i=>6.25+(i*87.5/14);
  for(let i=0;i<SIZE;i++){
    let v=document.createElement('div');v.className='grid-line vertical';v.style.left=`${pos(i)}%`;boardEl.append(v);
    let h=document.createElement('div');h.className='grid-line horizontal';h.style.top=`${pos(i)}%`;boardEl.append(h);
  }
  for(let r of [3,7,11])for(let c of [3,7,11]){const dot=document.createElement('div');dot.className='star';dot.style.left=`${pos(c)}%`;dot.style.top=`${pos(r)}%`;boardEl.append(dot);}
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    const point=document.createElement('button');point.type='button';point.className='intersection';point.style.top=`${pos(r)}%`;point.style.left=`${pos(c)}%`;
    point.setAttribute('role','gridcell');point.setAttribute('aria-label',`${r+1}행 ${c+1}열: ${board[r][c]===1?'흑돌':board[r][c]===2?'백돌':'빈 자리'}`);
    point.disabled=finished||board[r][c]!==0;
    point.addEventListener('click',()=>move(r,c));
    if(board[r][c]){const piece=document.createElement('span');piece.className=`piece ${board[r][c]===1?'black':'white'}`;if(moves.length&&moves.at(-1).r===r&&moves.at(-1).c===c)piece.classList.add('last');point.append(piece);}
    boardEl.append(point);
  }
}
function status(message='먼저 다섯 개를 연결하면 승리해요!'){
  $('moveCount').textContent=`${moves.length}수`;
  const badge=$('turnBadge');const stone=badge.querySelector('.stone');stone.className=`stone ${player===1?'black':'white'}`;
  $('turnText').textContent=finished?(message.startsWith('무승부')?'무승부':`${player===1?'흑돌':'백돌'} 승리!`):`${player===1?'흑돌':'백돌'} 차례`;
  $('gameMessage').textContent=message;
  $('undoButton').disabled=moves.length===0;
}
function move(r,c){if(finished)return;const result=tryMove(board,r,c,player);if(!result.ok){if(result.reason.includes('3·3'))showGameEvent('forbidden','3·3은 금지예요!', '흑돌과 백돌 모두 한 번에 열린 삼을 두 개 만들 수 없어요. 다른 자리에 놓아 보세요.');else status(result.reason);return;}
  moves.push({r,c,player});
  if(result.win){finished=true;const winner=player===1?'흑돌':'백돌';status(`${winner}이 승리했어요! 🎉`);renderBoard();showGameEvent('win',`${winner} 승리! 🎉`,`${moves.length}수 만에 다섯 개를 연결했어요. 정말 잘했어요!`);return;}
  if(result.draw){finished=true;status('무승부! 놓을 곳이 더는 없어요.');renderBoard();showGameEvent('draw','무승부예요!','바둑판이 모두 찼어요. 새 게임을 시작하거나 처음 화면으로 돌아갈 수 있어요.');return;}
  player=player===1?2:1;renderBoard();status();
}
function reset(){board=emptyBoard();player=1;moves=[];finished=false;renderBoard();status();}
$('startLocal').addEventListener('click',viewGame);
$('backHome').addEventListener('click',viewHome);
$('resetButton').addEventListener('click',reset);
$('undoButton').addEventListener('click',()=>{const last=moves.pop();if(!last)return;board[last.r][last.c]=0;player=last.player;finished=false;renderBoard();status('마지막 수를 취소했어요.');});
document.querySelectorAll('[data-dialog]').forEach(btn=>btn.addEventListener('click',()=>{const d=modalText[btn.dataset.dialog];showDialog(d.title,d.html);}));
document.querySelectorAll('[data-unavailable]').forEach(btn=>btn.addEventListener('click',()=>showDialog('다음 버전에서 만나요!',`<p><b>${btn.dataset.unavailable}</b> 기능은 아직 개발 중이에요.</p><p>현재는 <b>1:1 대결</b>에서 한 기기로 오목을 즐길 수 있어요.</p>`)));
$('closeDialog').addEventListener('click',()=>modal.close());$('okDialog').addEventListener('click',()=>modal.close());
modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
// Result dialogs must be dismissed through their own visible actions.
eventModal.addEventListener('cancel',e=>e.preventDefault());
eventModal.addEventListener('click',e=>{if(e.target===eventModal)e.preventDefault();});
reset();

import {SIZE,emptyBoard,tryMove,isDoubleThree} from './rules.js';
const $=id=>document.getElementById(id);
const boardEl=$('board');
let board=emptyBoard();let player=1;let moves=[];let finished=false;
const modal=$('infoDialog');
const eventModal=$('gameEventDialog');
let lastFocusedElement=null;
let mode='local', human=1, difficulty='normal', thinking=false;
let worker=null, thinkingTimer=null, watchdog=null, computerRequest=0;
const difficultyNames={easy:'쉬움',normal:'보통',hard:'어려움'};
function cancelComputer(){
  computerRequest++;
  clearTimeout(thinkingTimer);clearTimeout(watchdog);
  worker?.terminate();worker=null;thinking=false;
}
function isComputerTurn(){return mode==='practice'&&player!==human&&!finished;}
function updateMode(){
  $('gameTitle').textContent=mode==='practice'?'컴퓨터와 오목 연습':'친구와 1:1 오목 대결';
  $('gameEyebrow').textContent=mode==='practice'?'COMPUTER PRACTICE':'LOCAL 2 PLAYER';
  $('gameDescription').textContent=mode==='practice'?`${difficultyNames[difficulty]} · 내 돌: ${human===1?'흑돌':'백돌'} · 흑돌이 먼저 시작해요.`:'한 기기를 번갈아 사용하세요. 흑돌이 먼저 시작해요.';
  $('modeRule').textContent=mode==='practice'?'컴퓨터와 번갈아 대국해요':'한 기기에서 번갈아 대국해요';
  $('undoButton').textContent=mode==='practice'?'↶ 내 차례로 무르기':'↶ 한 수 무르기';
}
function scheduleComputer(){
  if(!isComputerTurn()||!document.body.classList.contains('playing-mode'))return;
  const request=++computerRequest;
  thinking=true;renderBoard();status();
  // Brief visible feedback before computing. Worker is terminated on every navigation/reset/undo.
  thinkingTimer=setTimeout(()=>{
    if(request!==computerRequest)return;
    const fallback=()=>{
      if(request!==computerRequest)return;
      clearTimeout(watchdog);worker?.terminate();worker=null;
      // Worker unavailable: play one legal nearby stone without a blocking search.
      const points=[];
      for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(!board[r][c])points.push({r,c});
      points.sort((a,b)=>(Math.abs(a.r-7)+Math.abs(a.c-7))-(Math.abs(b.r-7)+Math.abs(b.c-7)));
      complete(points.find(m=>!isDoubleThree(board,m.r,m.c,player))||null);
    };
    const complete=point=>{
      if(request!==computerRequest)return;
      clearTimeout(watchdog);worker?.terminate();worker=null;thinking=false;
      if(!isComputerTurn()||!document.body.classList.contains('playing-mode'))return;
      if(!point){finished=true;renderBoard();status('무승부! 컴퓨터가 둘 수 있는 자리가 없어요.');showGameEvent('draw','무승부예요!','컴퓨터가 규칙에 맞게 둘 수 있는 자리가 없어요.');return;}
      // Apply through the same engine as human moves. Never trust an AI result blindly.
      if(!Number.isInteger(point.r)||!Number.isInteger(point.c)||point.r<0||point.r>=SIZE||point.c<0||point.c>=SIZE||board[point.r][point.c]||isDoubleThree(board,point.r,point.c,player)){fallback();return;}
      move(point.r,point.c,true);
    };
    try{
      worker=new Worker(new URL('./ai-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>data.error?fallback():complete(data.move);
      worker.onerror=event=>{event.preventDefault();fallback();};
      watchdog=setTimeout(fallback,5000);
      worker.postMessage({board,player,difficulty});
    }catch{fallback();}
  },240);
}
function viewPractice(){
  cancelComputer();
  document.body.classList.remove('home-mode','playing-mode');document.body.classList.add('setup-mode');
  $('gameSection').classList.add('hidden');$('practiceSection').classList.remove('hidden');
  window.scrollTo(0,0);$('practiceSection').focus({preventScroll:true});
}

function viewGame(){
  document.body.classList.remove('home-mode','setup-mode');
  $('practiceSection').classList.add('hidden');
  document.body.classList.add('playing-mode');
  $('gameSection').classList.remove('hidden');
  // No scroll animation: the game is now a separate full-screen view.
  window.scrollTo(0,0);
  $('gameSection').focus({preventScroll:true});
}
function viewHome(){
  cancelComputer();
  $('practiceSection').classList.add('hidden');
  if(eventModal.open)eventModal.close();
  document.body.classList.remove('playing-mode','setup-mode');
  document.body.classList.add('home-mode');
  $('gameSection').classList.add('hidden');
  window.scrollTo(0,0);
  $(mode==='practice'?'startPractice':'startLocal').focus({preventScroll:true});
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
  help:{title:'사용 방법',html:'<ol><li><b>1:1 대결 → 바로 대결하기</b>를 눌러요.</li><li>친구 두 명이 한 기기에서 번갈아 교차점을 눌러요.</li><li>마지막 수는 빨간 점, 현재 차례는 오른쪽에 표시돼요.</li><li>잘못 둔 수는 <b>한 수 무르기</b>, 새로 시작하려면 <b>새 게임</b>을 눌러요.</li></ol><p>컴퓨터 연습은 연습하기에서 난이도와 내 돌을 선택해 시작해요. 연습 중에는 내 차례로 무를 수 있어요. 온라인 방과 방 코드는 다음 버전에서 제공할 예정이에요.</p>'}
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
    point.disabled=finished||thinking||isComputerTurn()||board[r][c]!==0;
    point.addEventListener('click',()=>move(r,c));
    if(board[r][c]){const piece=document.createElement('span');piece.className=`piece ${board[r][c]===1?'black':'white'}`;if(moves.length&&moves.at(-1).r===r&&moves.at(-1).c===c)piece.classList.add('last');point.append(piece);}
    boardEl.append(point);
  }
}
function status(message='먼저 다섯 개를 연결하면 승리해요!'){
  $('moveCount').textContent=`${moves.length}수`;
  const badge=$('turnBadge');const stone=badge.querySelector('.stone');stone.className=`stone ${player===1?'black':'white'}`;
  badge.classList.toggle('thinking',thinking);
  $('turnText').textContent=thinking?'컴퓨터가 생각 중…':finished?(message.startsWith('무승부')?'무승부':`${player===1?'흑돌':'백돌'} 승리!`):`${player===1?'흑돌':'백돌'} 차례`;
  $('gameMessage').textContent=thinking?'잠깐만요, 다음 수를 생각하고 있어요.':message;
  if(mode==='practice'&&!finished&&!thinking)$('turnText').textContent=`${player===human?'내':'컴퓨터'} 차례 · ${player===1?'흑돌':'백돌'}`;
  if(mode==='practice'&&finished&&!message.startsWith('무승부'))$('turnText').textContent=player===human?'내가 승리했어요!':'컴퓨터 승리!';
  $('undoButton').disabled=moves.length===0||(mode==='practice'&&!moves.some(m=>m.player===human));
}
function move(r,c,computer=false){if(finished||(!computer&&(thinking||isComputerTurn())))return;const result=tryMove(board,r,c,player);if(!result.ok){if(result.reason.includes('3·3'))showGameEvent('forbidden','3·3은 금지예요!', '흑돌과 백돌 모두 한 번에 열린 삼을 두 개 만들 수 없어요. 다른 자리에 놓아 보세요.');else status(result.reason);return;}
  moves.push({r,c,player});
  if(result.win){finished=true;const winner=player===1?'흑돌':'백돌';status(`${winner}이 승리했어요! 🎉`);renderBoard();showGameEvent('win',mode==='practice'?(player===human?'내가 이겼어요! 🎉':'컴퓨터가 이겼어요!'): `${winner} 승리! 🎉`,mode==='practice'?(player===human?'멋진 대결이었어요! 다시 연습해 볼까요?':'잘 도전했어요! 새 게임에서 다시 연습해 보세요.'):`${moves.length}수 만에 다섯 개를 연결했어요. 정말 잘했어요!`);return;}
  if(result.draw){finished=true;status('무승부! 놓을 곳이 더는 없어요.');renderBoard();showGameEvent('draw','무승부예요!','바둑판이 모두 찼어요. 새 게임을 시작하거나 처음 화면으로 돌아갈 수 있어요.');return;}
  player=player===1?2:1;renderBoard();status();scheduleComputer();
}
function reset(){cancelComputer();board=emptyBoard();player=1;moves=[];finished=false;updateMode();renderBoard();status();scheduleComputer();}
$('startLocal').addEventListener('click',()=>{cancelComputer();mode='local';viewGame();reset();});
$('startPractice').addEventListener('click',viewPractice);
$('practiceHome').addEventListener('click',viewHome);
$('practiceForm').addEventListener('submit',e=>{
  e.preventDefault();const data=new FormData(e.currentTarget);
  mode='practice';human=Number(data.get('color'));difficulty=data.get('difficulty');viewGame();reset();
});
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();viewHome();});
$('backHome').addEventListener('click',viewHome);
$('resetButton').addEventListener('click',reset);
$('undoButton').addEventListener('click',()=>{
  if($('undoButton').disabled)return;
  cancelComputer();
  do{const last=moves.pop();if(!last)break;board[last.r][last.c]=0;player=last.player;}while(mode==='practice'&&player!==human&&moves.length);
  finished=false;renderBoard();status('마지막 수를 취소했어요.');
});
document.querySelectorAll('[data-dialog]').forEach(btn=>btn.addEventListener('click',()=>{const d=modalText[btn.dataset.dialog];showDialog(d.title,d.html);}));
document.querySelectorAll('[data-unavailable]').forEach(btn=>btn.addEventListener('click',()=>showDialog('다음 버전에서 만나요!',`<p><b>${btn.dataset.unavailable}</b> 기능은 아직 개발 중이에요.</p><p>지금은 <b>컴퓨터 연습</b>과 한 기기에서 하는 <b>1:1 대결</b>을 즐길 수 있어요.</p>`)));
$('closeDialog').addEventListener('click',()=>modal.close());$('okDialog').addEventListener('click',()=>modal.close());
modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
// Result dialogs must be dismissed through their own visible actions.
eventModal.addEventListener('cancel',e=>e.preventDefault());
eventModal.addEventListener('click',e=>{if(e.target===eventModal)e.preventDefault();});
reset();

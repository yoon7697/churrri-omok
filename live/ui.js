import { API_BASE } from './config.js';
import { api, newToken, validateBase, Connection } from './client.js';
import { openPracticeFromLobby, showMainMenu } from '../app.js';
const root=document.getElementById('onlineSection'), dialog=document.getElementById('lobbyDialog');
const params=new URLSearchParams(location.search),role=params.get('role')==='teacher'?'teacher':'student';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let base='';try{base=validateBase(API_BASE);}catch{}
let session=null,state=null,connection=null,status='connecting',busy=false,practicing=false,fatal='',offset=0,notice='',transitioning=false;
const key=`omok-live-${role}`,pendingKey=`omok-live-pending-${role}`;
function load(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{throw Error('이 브라우저에서는 참가 정보를 저장할 수 없어요. 일반 브라우저에서 다시 열어 주세요.');}}
function credential(){let p=load(pendingKey);if(!p?.token||p.base!==base)p={token:newToken(),base};save(pendingKey,p);return p.token;}
function message(text){notice=text;const el=root.querySelector('#liveError');if(el)el.textContent=text;}
function shell(content){
  document.body.classList.remove('home-mode','setup-mode','playing-mode');document.body.classList.add('online-mode');
  root.classList.remove('hidden');document.getElementById('practiceSection').classList.add('hidden');document.getElementById('gameSection').classList.add('hidden');
  root.innerHTML=`<div class="preview-banner"><span class="preview-tag">학급 대회 미리보기</span><p>최대 40명이 동시에 참가해요. 승리·부전승 2점, 무승부 1점 · 실시간 관전은 다음 단계예요.</p></div><div class="online-topline"><button class="lobby-back" data-live="home" type="button">← 처음 화면</button><span id="liveConnection" role="status">${connectionText()}</span></div>${content}<p id="liveError" class="lobby-error" role="alert">${e(notice)}</p>`;
}
const heading=(title,text)=>`<div class="lobby-heading"><p class="eyebrow">${role==='teacher'?'TEACHER':'STUDENT'} · ONLINE OMOK</p><h1 id="onlineTitle">${title}</h1><p>${text}</p></div>`;
function connectionText(){return fatal?e(fatal):status==='online'?'● 연결됨':status==='reconnecting'?'↻ 다시 연결하고 있어요':'서버 연결 준비';}
function entry(){document.body.classList.remove('live-playing');
  if(!base){shell(heading('온라인 서버 연결 준비 중이에요','서버 배포 후 이 화면에서 실제 방에 참가할 수 있어요.')+'<p>지금은 처음 화면의 대기실 체험과 컴퓨터 연습을 이용할 수 있어요.</p>');return;}
  shell(heading(role==='teacher'?'우리 반 대회 방 만들기':'실제 대기실에 참가하기',role==='teacher'?'학생들을 초대하고 선생님이 라운드를 시작해 주세요.':'선생님이 만든 방의 코드와 내 닉네임을 입력해 주세요.')+`<form id="liveEntryForm" class="lobby-card live-entry-card">${role==='teacher'?'<fieldset class="round-fieldset"><legend>대결 횟수</legend><div class="round-options">'+[3,5,7].map(n=>`<label><input type="radio" name="rounds" value="${n}" ${n===3?'checked':''}><span><b>${n}<small>라운드</small></b><em>한 판 5분</em></span></label>`).join('')+'</div></fieldset>':`<label class="field-label" for="liveCode">방 코드</label><input id="liveCode" class="code-input" name="code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required value="${e(params.get('code')||'')}"><label class="field-label nickname-label" for="liveNickname">닉네임</label><input id="liveNickname" class="lobby-input" name="nickname" maxlength="12" required placeholder="닉네임을 입력하세요"><p class="field-hint">2~12자로 입력해 주세요.</p>`}<button class="lobby-primary" type="submit">${role==='teacher'?'실제 방 만들기':'실제 방 참가하기'}</button></form>`);
  root.querySelector('#liveEntryForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;busy=true;const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;
    try{
      const f=new FormData(event.currentTarget),token=credential();
      const result=await api(base,role==='teacher'?'/rooms':'/join',role==='teacher'?{rounds:Number(f.get('rounds')),token}:{code:f.get('code'),nickname:f.get('nickname'),token});
      session={...result,token,base};save(key,session);try{localStorage.removeItem(pendingKey);}catch{}attach();
    }catch(error){message(error.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}
  });
}
function attach(){
  connection?.stop();fatal='';state=null;
  connection=new Connection(base,session,{
    status(value){status=value;if(!practicing)render();},
    state(value){
      const wasPracticing=practicing;state=value;offset=value.serverNow-Date.now();
      if(wasPracticing&&(value.match?.status==='active'||value.phase==='closed'||value.phase==='finished')){practicing=false;transitioning=true;const info=document.getElementById('infoDialog');if(info.open)info.close();showMainMenu();transitioning=false;}
      if(!practicing)render();
    },
    error(text){if(!practicing)message(text);},
    fatal(text){fatal=text;status='offline';if(practicing){practicing=false;transitioning=true;const info=document.getElementById('infoDialog');if(info.open)info.close();showMainMenu();transitioning=false;}render();}
  });
  connection.connect();render();
}
function roster(){return `<div class="participant-grid">${(state.participants||[]).map(p=>`<div class="participant-card"><span class="student-avatar" aria-hidden="true">${e([...p.nickname][0])}</span><span class="student-details"><b>${e(p.nickname)}</b><small>${p.online?'● 연결됨':'○ 접속 끊김'}${p.me?' · 나':''}${state.round?' · '+(p.roundStatus==='active'?'경기 중':p.roundStatus==='waiting'?'다음 라운드 대기':p.roundStatus==='bye'?'부전승':'경기 종료'):''}</small></span>${role==='teacher'?`<button class="lobby-text-button" data-live="manage" data-id="${e(p.id)}" type="button" aria-label="${e(p.nickname)} 관리">관리</button>`:''}</div>`).join('')}</div>`;}
function matchList(){
  if(!state.matches?.length)return '';
  return `<section class="live-progress" aria-label="라운드 경기 현황"><h2>경기 현황 <small>${state.completed} / ${state.total}명 종료</small></h2><div class="live-match-list">${state.matches.map(m=>`<div class="live-match-row ${m.mine?'is-mine':''}" data-match="${e(m.id)}"><div><strong>${m.status==='bye'?'부전승':`경기 ${m.number}`}${m.mine?' · 내 경기':''}</strong><p>${m.names?e(m.names.join(' vs ')):'익명 대결'}</p></div><span class="live-match-status">${m.status==='active'?`진행 중${m.connected<2?' · 재접속 대기':''}`:m.status==='bye'?'2점':m.status==='draw'?'무승부':'종료'}</span>${role==='teacher'&&m.status==='active'?`<button class="lobby-text-button" data-live="draw-match" data-id="${e(m.id)}" type="button" aria-label="경기 ${m.number} 무승부 종료">무승부 종료</button>`:''}</div>`).join('')}</div></section>`;
}
function standings(){return state.standings?`<section class="live-standings"><h2>대회 결과</h2><table><thead><tr><th>순위</th><th>닉네임</th><th>승점</th></tr></thead><tbody>${state.standings.map(p=>`<tr><td>${p.rank}위</td><td>${e(p.nickname)}${p.me?' · 나':''}</td><td>${p.points}점</td></tr>`).join('')}</tbody></table><p class="field-hint">승점이 같으면 공동순위예요.</p></section>`:'';}
function render(){
  if(!state){shell(heading(fatal?'연결을 확인해 주세요':'대기실에 연결하고 있어요',fatal||'잠시만 기다려 주세요.')+(fatal?'<button class="lobby-secondary" data-live="retry" type="button">이 탭에서 다시 연결</button><button class="lobby-text-button" data-live="forget" type="button">새로 참가하기</button>':''));return;}
  const match=state.match,active=match?.status==='active',playing=state.phase==='playing';
  const me=state.me;document.body.classList.toggle('live-playing',role==='student'&&active);
  const title=role==='teacher'?'우리 반 온라인 대회':active?'상대와 대결하고 있어요':state.bye?'이번 라운드는 부전승이에요!':state.waitingForNextRound?'다음 라운드를 기다려 주세요':match?`${e(me?.nickname)} 님, 경기를 마쳤어요!`:`${e(me?.nickname)} 님, 준비됐어요!`;
  shell(heading(title,`${state.round} / ${state.rounds}라운드 · 한 판 최대 5분 · 경기 종료 ${state.completed} / ${state.total}명`)+
    (state.phase==='closed'?'<section class="lobby-card"><h2>방이 닫혔어요.</h2><p>선생님에게 새 방 코드를 확인해 주세요.</p></section>':
    `<div class="live-layout"><section class="lobby-card live-room-panel"><span class="side-kicker">방 코드 · ${state.count} / ${state.capacity||40}명</span><strong class="room-code" id="liveRoomCode">${state.code}</strong><button class="lobby-secondary" data-live="copy" type="button">학생 입장 링크 복사</button><p class="field-hint">접속 중 ${state.onlineCount}명 · 같은 승점끼리 우선 대결해요.</p>${role==='teacher'||!playing?roster():active?'<p>상대방: 익명 참가자</p>':''}
      ${role==='teacher'?`<div class="live-teacher-actions"><button class="lobby-secondary" data-live="lock" type="button" ${status!=='online'||busy?'disabled':''}>${state.locked?'입장 잠금 해제':'입장 잠그기'}</button>${playing?`<button class="lobby-secondary" data-live="draw" type="button">${state.matches.filter(m=>m.status==='active').length===1?'현재 경기 무승부로 종료':'진행 중인 경기 모두 무승부로 종료'}</button><p class="field-hint">모든 경기가 끝나면 다음 라운드를 시작할 수 있어요.</p>`:`<button class="lobby-primary" id="liveStart" data-live="start" type="button" ${state.onlineCount<2||state.phase==='finished'||status!=='online'||busy?'disabled':''}>${state.phase==='finished'?'정해진 대결을 모두 마쳤어요':state.round?'다음 라운드 시작':'대결 시작'}</button>`}<button class="close-room-button" data-live="close" type="button">방 닫기</button></div>`:
      !active&&state.phase!=='finished'?'<button class="lobby-primary" data-live="practice" type="button">컴퓨터와 연습하기</button><p class="field-hint">내 경기가 시작되면 자동으로 이동해요.</p>':''}
      ${match&&!active?`<div class="live-result" role="status"><h2>${match.result==='win'?'내가 이겼어요!':match.result==='loss'?'상대가 이겼어요!':match.result==='draw'?'무승부예요!':`${match.winnerColor===1?'흑돌':'백돌'} 승리!`}</h2><p>${e(match.names?.join(' vs '))}</p>${me?`<strong>내 누적 승점 ${me.points}점</strong>`:''}<p>승리 2점 · 무승부 1점 · 패배 0점</p>${playing?'<p>다른 경기가 끝날 때까지 기다려 주세요.</p>':''}</div>`:''}
      ${state.bye?`<div class="live-result" role="status"><h2>부전승 · 2점</h2><p>참가 인원이 홀수여서 이번 라운드는 쉬어요.</p><strong>내 누적 승점 ${me?.points}점</strong></div>`:''}
      ${state.waitingForNextRound?'<p class="live-wait-notice" role="status">다음 라운드부터 참여할 수 있어요. 지금은 경기 현황을 확인하거나 컴퓨터와 연습해 보세요.</p>':''}
      ${fatal?`<p class="lobby-error">${e(fatal)}</p><button class="lobby-secondary" data-live="retry" type="button">이 탭에서 다시 연결</button>`:''}
      ${role==='student'?matchList():''}
    </section>${match?`<section class="lobby-card live-board-panel"><div class="live-game-status"><strong id="liveTurn">${active?(role==='teacher'?`${match.turn===1?'흑돌':'백돌'} 차례`:(match.myColor===match.turn?'내 차례':'상대 차례')):'경기 종료'}</strong>${role==='student'?`<span class="live-my-color">내 돌: ${match.myColor===1?'흑돌':'백돌'}</span>`:''}<span id="liveTimer" aria-label="남은 경기 시간"></span></div>${role==='student'&&active&&!match.opponentOnline?'<p class="field-hint">상대가 다시 연결하고 있어요.</p>':''}<div class="board-wrap"><div id="liveBoard" class="board" role="grid" aria-label="온라인 15행 15열 오목판"></div></div><p class="board-caption">마지막 수는 빨간색으로 표시돼요.</p></section>`:`<aside class="lobby-card ${role==='teacher'&&state.matches.length?'':'live-waiting'}">${role==='teacher'&&state.matches.length?matchList():`<span aria-hidden="true">⚫ ⚪</span><h2>${state.bye?'잠깐 쉬어 가요':state.waitingForNextRound?'다음 라운드에 만나요':'친구들이 모이면 시작해요'}</h2><p>${state.round?'선생님이 다음 라운드를 시작할 때까지 기다려 주세요.':'선생님이 시작하면 자동으로 상대와 연결돼요.'}</p>`}</aside>`}</div>${standings()}`));
  if(match&&state.phase!=='closed')renderBoard(match);updateTimer();
}
function renderBoard(match){
  const board=root.querySelector('#liveBoard');if(!board)return;const pos=i=>6.25+i*6.25;
  for(let i=0;i<15;i++){for(const axis of ['vertical','horizontal']){const line=document.createElement('div');line.className=`grid-line ${axis}`;line.style[axis==='vertical'?'left':'top']=`${pos(i)}%`;board.append(line);}}
  for(const r of [3,7,11])for(const c of [3,7,11]){const star=document.createElement('div');star.className='star';star.style.top=`${pos(r)}%`;star.style.left=`${pos(c)}%`;board.append(star);}
  for(let r=0;r<15;r++)for(let c=0;c<15;c++){
    const button=document.createElement('button');button.type='button';button.className='intersection';button.style.top=`${pos(r)}%`;button.style.left=`${pos(c)}%`;button.setAttribute('role','gridcell');button.setAttribute('aria-label',`${r+1}행 ${c+1}열`);
    button.disabled=role!=='student'||match.status!=='active'||match.myColor!==match.turn||!!match.board[r][c]||busy||status!=='online'||!!fatal||Date.now()+offset>=match.deadlineAt;
    if(match.board[r][c]){const piece=document.createElement('span');piece.className=`piece ${match.board[r][c]===1?'black':'white'}${match.lastMove?.r===r&&match.lastMove?.c===c?' last':''}`;button.append(piece);}
    button.onclick=()=>act('move',{matchId:match.id,r,c,ply:match.ply});board.append(button);
  }
}
function updateTimer(){const el=root.querySelector('#liveTimer');if(!el||!state?.match)return;const seconds=Math.max(0,Math.ceil((state.match.deadlineAt-Date.now()-offset)/1000));el.textContent=state.match.status==='active'?`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`:'종료';if(!seconds&&state.match.status==='active'){const turn=root.querySelector('#liveTurn');if(turn)turn.textContent='결과 확인 중';}if(!seconds)root.querySelectorAll('#liveBoard .intersection').forEach(b=>b.disabled=true);}
async function act(action,data={}){
  if(busy||status!=='online'||fatal)return;notice='';busy=true;render();
  try{await connection.send(action,data);}catch(error){
    if(error.message.includes('3·3'))modal('3·3은 금지예요!',`<p class="confirm-copy">${e(error.message)}</p>`,null);
    else message(error.message);
  }finally{busy=false;if(state&&(!dialog.open))render();}
}
function modal(title,content,mount){dialog.innerHTML=`<div class="dialog-head"><h2 id="lobbyDialogTitle">${e(title)}</h2><button type="button" id="liveDialogClose" aria-label="닫기">✕</button></div>${content}`;dialog.querySelector('#liveDialogClose').onclick=()=>dialog.close();mount?.();dialog.showModal();}
root.addEventListener('click',async event=>{
  const button=event.target.closest('[data-live]');if(!button||button.disabled)return;
  const a=button.dataset.live;
  if(a==='home'){document.body.classList.remove('live-playing');connection?.stop();history.replaceState(null,'',location.pathname);showMainMenu();return;}
  if(a==='retry'){attach();return;}
  if(a==='forget'){connection?.stop();try{localStorage.removeItem(key);}catch{}session=null;state=null;fatal='';entry();return;}
  if(a==='copy'){
    const url=new URL(location.pathname,location.origin);url.searchParams.set('online','1');url.searchParams.set('role','student');url.searchParams.set('code',state.code);
    try{await navigator.clipboard.writeText(url.href);message('학생 입장 링크를 복사했어요.');}catch{message(`방 코드 ${state.code}를 학생에게 알려 주세요.`);}return;
  }
  if(a==='start'){await act('start');return;}
  if(a==='lock'){await act('lock',{locked:!state.locked});return;}
  if(a==='close'||a==='draw'||a==='draw-match'){
    const matchId=a==='draw-match'?button.dataset.id:undefined;
    modal(a==='close'?'방을 닫을까요?':matchId?'이 경기를 무승부로 종료할까요?':'진행 중인 경기를 모두 무승부로 종료할까요?',`<p class="confirm-copy">${matchId?'선택한 경기만':'진행 중인 모든 경기의 결과를'} 무승부로 확정해요.</p><button id="liveConfirm" class="lobby-danger" type="button">확인</button>`,()=>{dialog.querySelector('#liveConfirm').onclick=()=>{dialog.close();act(a==='close'?'close':'draw',matchId?{matchId}:{});};});return;
  }
  if(a==='manage'){
    const p=state.participants.find(p=>p.id===button.dataset.id);if(!p)return;
    modal('참가 학생 관리',`<form id="liveRenameForm"><label class="field-label" for="liveRename">닉네임</label><input id="liveRename" class="lobby-input" value="${e(p.nickname)}" required maxlength="12"><button class="lobby-primary" type="submit">이름 변경</button></form><button id="liveKick" class="lobby-danger" type="button">내보내기</button>`,()=>{
      dialog.querySelector('#liveRenameForm').onsubmit=event=>{event.preventDefault();const nickname=dialog.querySelector('#liveRename').value;dialog.close();act('rename',{id:p.id,nickname});};
      dialog.querySelector('#liveKick').onclick=()=>{dialog.close();modal('학생을 내보낼까요?',`<p>${e(p.nickname)} 님을 내보내고 진행 중 경기는 무승부로 종료해요.</p><button id="liveKickConfirm" class="lobby-danger" type="button">내보내기</button>`,()=>{dialog.querySelector('#liveKickConfirm').onclick=()=>{dialog.close();act('kick',{id:p.id});};});};
    });return;
  }
  if(a==='practice'){
    practicing=true;root.classList.add('hidden');document.body.classList.remove('online-mode');
    openPracticeFromLobby(()=>{practicing=false;render();});
  }
});
if(base&&!params.has('demo')){
  document.getElementById('createOnlineRoom').addEventListener('click',event=>{event.stopImmediatePropagation();location.href='?online=1&role=teacher';},true);
  document.getElementById('joinOnlineRoom').addEventListener('click',event=>{event.stopImmediatePropagation();location.href=`?online=1&role=student&code=${encodeURIComponent(document.getElementById('joinCode').value.trim())}`;},true);
  document.querySelector('#createOnlineRoom span').textContent='온라인 대회';
}
if(params.get('online')==='1'){
  document.addEventListener('omok:home',()=>{if(!transitioning&&!practicing){connection?.stop();document.body.classList.remove('live-playing');history.replaceState(null,'',location.pathname);}});
  session=load(key);
  if(session?.base===base&&/^[A-Za-z0-9_-]{43}$/.test(session.token)&&/^[a-f0-9-]{36}$/.test(session.roomId))attach();else entry();
  setInterval(updateTimer,250);
}

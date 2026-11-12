import { openPracticeFromLobby, showMainMenu } from '../app.js';
import { DEMO_CODE, makeRoom, addStudent, renameStudent, removeStudent, addSamples } from './demo-room.js';

const root = document.getElementById('onlineSection');
const dialog = document.getElementById('lobbyDialog');
const storageKey = 'omok-lobby-preview-v1';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let room = null, ownStudentId = null, teacherAvailable = false, screen = 'create';
let storageAvailable = true;
function save() {
  try { sessionStorage.setItem(storageKey, JSON.stringify({ room, ownStudentId, teacherAvailable, screen })); }
  catch { storageAvailable = false; }
}
function restore() {
  try {
    const data = JSON.parse(sessionStorage.getItem(storageKey));
    if (!data?.room || data.room.code !== DEMO_CODE || ![3, 5, 7].includes(data.room.rounds) || !Array.isArray(data.room.participants) || data.room.participants.length > 40) return;
    if (!data.room.participants.every(p => typeof p.id === 'string' && typeof p.nickname === 'string' && ['online', 'offline'].includes(p.state))) return;
    room = data.room; ownStudentId = data.ownStudentId; teacherAvailable = !!data.teacherAvailable;
    screen = ['create', 'join', 'teacher', 'student'].includes(data.screen) ? data.screen : 'create';
  } catch { storageAvailable = false; }
}
restore();
const heading = (eyebrow, title, text) => `<div class="lobby-heading"><p class="eyebrow">${eyebrow}</p><h1 id="onlineTitle">${title}</h1><p>${text}</p></div>`;
const banner = `<div class="preview-banner"><span class="preview-tag">화면 미리보기</span><p>예시 방으로 체험해요. 다른 기기의 학생과 연결하는 기능은 다음 단계에서 열려요.</p></div>`;
const error = '<p class="lobby-error" id="lobbyError" role="alert"></p>';
const summary = () => `<div class="room-summary"><span>대회 규칙</span><strong>${room.rounds}라운드 · 한 판 최대 5분</strong><small>승리 2점 · 무승부 1점 · 부전승 2점</small></div>`;
function open(view) {
  screen = view; save();
  document.body.classList.remove('home-mode', 'setup-mode', 'playing-mode');
  document.body.classList.add('online-mode');
  document.getElementById('practiceSection').classList.add('hidden');
  document.getElementById('gameSection').classList.add('hidden');
  root.classList.remove('hidden'); render();
  window.scrollTo(0, 0); root.focus({ preventScroll: true });
}
function render() {
  const content = screen === 'create' ? createView() : screen === 'join' ? joinView() : screen === 'teacher' ? teacherView() : studentView();
  root.innerHTML = `${banner}<div class="online-topline"><button class="lobby-back" data-action="home" type="button">← 처음 화면</button><span class="lobby-stage">우리 반의 첫 대결을 준비해요</span></div>${content}<p class="preview-footnote">체험 내용은 이 탭에서만 유지돼요.${storageAvailable ? '' : ' 이 브라우저에서는 새로고침하면 초기화될 수 있어요.'}</p>`;
  root.querySelector('#createRoomForm')?.addEventListener('submit', createRoom);
  root.querySelector('#joinRoomForm')?.addEventListener('submit', joinRoom);
}
function createView() {
  return `${heading('TEACHER · 선생님', '우리 반 오목 대회 만들기', '몇 번 대결할지 고르면, 우리 반 대기실이 준비돼요.')}
  <div class="setup-lobby-layout"><form id="createRoomForm" class="lobby-card create-card">
    <div class="card-number">01 <span>대회 준비</span></div>
    <fieldset class="round-fieldset"><legend>몇 라운드로 진행할까요?</legend><div class="round-options">
      ${[3,5,7].map(n => `<label><input type="radio" name="rounds" value="${n}" ${n === 5 ? 'checked' : ''}><span><b>${n}<small>라운드</small></b><em>최대 ${n*5}분</em></span></label>`).join('')}
    </div></fieldset>
    <p class="field-hint">경기 시간 기준이에요. 라운드 사이의 대기 시간은 별도예요.</p>
    <div class="fixed-rule"><span aria-hidden="true">⏱</span><div><b>한 판은 최대 5분</b><p>시간 안에 승패가 나지 않으면 무승부예요.</p></div><span class="rule-chip">고정</span></div>
    ${error}<button class="lobby-primary" type="submit">체험 방 만들기 <span aria-hidden="true">→</span></button>
  </form><aside class="lobby-card steps-card"><span class="lobby-illustration" aria-hidden="true">🏫</span><h2>선생님이 여는<br>우리 반 오목 대회</h2><ol><li><b>방 코드로 초대해요</b><span>학생들이 코드를 입력하고 닉네임을 정해요.</span></li><li><b>참가자를 확인해요</b><span>이름을 고치거나 대기실에서 내보낼 수 있어요.</span></li><li><b>함께 대결을 시작해요</b><span>실시간 대결은 서버 연결 후 제공할 예정이에요.</span></li></ol></aside></div>`;
}
function joinView() {
  return `${heading('STUDENT · 학생', '우리 반 대기실로 가요', '방 코드를 입력하고, 대회에서 사용할 닉네임을 정해 주세요.')}
  <div class="join-lobby-layout"><form id="joinRoomForm" class="lobby-card join-card">
    <label class="field-label" for="lobbyCode">방 코드 <span>숫자 4자리</span></label>
    <input class="code-input" id="lobbyCode" name="code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off" placeholder="0000" value="${escape(document.getElementById('joinCode').value.trim())}">
    <label class="field-label nickname-label" for="studentNickname">닉네임</label>
    <input class="lobby-input" id="studentNickname" name="nickname" required maxlength="12" placeholder="닉네임을 입력하세요" autocomplete="off" aria-describedby="nicknameHint">
    <p class="field-hint" id="nicknameHint">2~12자로 입력해 주세요. 다른 친구와 다른 이름을 골라요.</p>
    ${error}<button class="lobby-primary" type="submit">대기실 입장하기 <span aria-hidden="true">→</span></button>
    <button class="lobby-text-button" data-action="fill-example" type="button">예시 코드 ${DEMO_CODE} 입력하기</button>
  </form><aside class="join-tip"><span aria-hidden="true">👋</span><h2>반가워요!</h2><p>지금은 화면을 먼저 체험해요.<br>예시 코드 <b>${DEMO_CODE}</b>로 들어가 보세요.</p><p>대기실에서 기다리는 동안<br>컴퓨터와 오목을 연습할 수 있어요.</p></aside></div>`;
}
function codeCard() {
  return `<aside class="lobby-card invite-card"><span class="side-kicker">우리 반 방 코드</span><strong class="room-code" aria-label="방 코드 ${room.code}">${room.code}</strong><p>체험용 코드예요.<br>실제 학생 초대는 다음 단계에서 가능해요.</p><button class="pill" data-action="copy-code" type="button">코드 복사</button><p id="copyStatus" role="status" class="copy-status"></p><div class="qr-later"><span aria-hidden="true">▦</span><p><b>입장 QR코드</b><small>실제 방 연결 후 제공해요</small></p></div>${summary()}</aside>`;
}
function teacherView() {
  if (!room || room.closed) return closedView();
  const online = room.participants.filter(p => p.state === 'online').length;
  return `${heading('TEACHER LOBBY · 선생님 대기실', '친구들을 기다리고 있어요', '참가자 카드를 누르면 닉네임을 바꾸거나 내보낼 수 있어요.')}
  <div class="teacher-lobby-layout">${codeCard()}<div class="participants-column"><section class="lobby-card roster-card" aria-labelledby="rosterTitle">
    <div class="roster-head"><div><h2 id="rosterTitle">참가 학생 <span class="count-pill">${room.participants.length}<small> / 40명</small></span></h2><p>대기 중 ${online}명${room.participants.length - online ? ` · 접속 끊김 ${room.participants.length - online}명` : ''}</p></div><button class="lobby-secondary lock-button" data-action="toggle-lock" type="button" aria-pressed="${room.locked}">${room.locked ? '🔒 입장 잠김' : '🔓 입장 열림'}</button></div>
    <div class="participant-grid">${room.participants.length ? room.participants.map(p => participantCard(p, true)).join('') : `<div class="empty-roster"><span aria-hidden="true">🌱</span><h3>아직 도착한 친구가 없어요</h3><p>아래 ‘예시 학생 추가’로<br>대기실 모습을 먼저 확인해 보세요.</p></div>`}</div>
    <p class="roster-hint">대회가 시작되면 학생에게는 진행 중인 경기의 이름이 공개되지 않아요.</p>
  </section><div class="lobby-card demo-tools"><div><span class="demo-tools-label">체험 도구</span><p>참가자가 들어온 모습을 확인해 보세요.</p></div><div class="demo-tool-actions"><button class="lobby-secondary" data-action="add-samples" type="button" ${room.locked || room.participants.length >= 40 ? 'disabled' : ''}>＋ 예시 학생 추가</button><button class="lobby-text-button" data-action="student-preview" type="button">학생 화면 체험 →</button></div></div>
    <div class="lobby-bottom"><p>대기실 화면을 먼저 확인해 주세요.<br><b>대회 시작은 온라인 경기 연결 후 열려요.</b></p><button class="lobby-primary" type="button" disabled>대회 시작 · 다음 단계</button></div>
    <button class="close-room-button" data-action="close-room" type="button">체험 방 닫기</button>
  </div></div><p id="lobbyStatus" class="lobby-status" role="status"></p>`;
}
function participantCard(p, editable = false) {
  const content = `<span class="student-avatar ${p.state === 'offline' ? 'offline-avatar' : ''}" aria-hidden="true">${escape([...p.nickname][0])}</span><span class="student-details"><b>${escape(p.nickname)}</b><small><span class="presence-dot ${p.state === 'offline' ? 'offline' : ''}"></span>${p.state === 'offline' ? '접속 끊김' : '대기 중'}${p.example ? ' · 예시' : ''}</small></span>${editable ? '<span class="edit-mark" aria-hidden="true">⋯</span>' : ''}`;
  return editable ? `<button class="participant-card" type="button" data-action="manage" data-id="${escape(p.id)}" aria-label="${escape(p.nickname)} 관리">${content}</button>` : `<li class="participant-card ${p.id === ownStudentId ? 'my-card' : ''}">${content}${p.id === ownStudentId ? '<span class="me-tag">나</span>' : ''}</li>`;
}
function studentView() {
  if (!room || room.closed) return closedView();
  const me = room.participants.find(p => p.id === ownStudentId);
  if (!me) return `${heading('STUDENT · 학생', '대기실에서 나왔어요', '다시 참가하려면 닉네임을 입력해 주세요.')}<button class="lobby-primary" data-action="join" type="button">참가 화면으로</button>`;
  return `${heading('STUDENT LOBBY · 학생 대기실', '모두 모이면 대결해요!', '선생님이 대회를 시작할 때까지 잠깐 기다려 주세요.')}
  <div class="student-lobby-layout"><section class="lobby-card waiting-card"><div class="waiting-visual" aria-hidden="true"><span>⚫</span><span>⚪</span><i>✦</i></div><span class="waiting-label">준비 완료</span><h2><span id="myNickname">${escape(me.nickname)}</span><span class="welcome-suffix">님, 반가워요!</span></h2><p>우리 반 친구들이 모이고 있어요.<br>기다리는 동안 오목 실력을 키워 볼까요?</p><button class="lobby-primary" data-action="practice" type="button">🎮 컴퓨터와 연습하기</button><p class="waiting-note">실제 대회가 시작되면 연습을 마치고<br>내 경기로 이동하도록 연결할 예정이에요.</p>${summary()}</section>
  <section class="lobby-card student-roster" aria-labelledby="friendsTitle"><div class="roster-head"><div><p class="side-kicker">체험 방 ${room.code}</p><h2 id="friendsTitle">함께 기다리는 친구들 <span class="count-pill">${room.participants.length}명</span></h2></div></div><ul class="participant-grid">${room.participants.map(p => participantCard(p)).join('')}</ul><p class="roster-hint">대회 전에는 친구들의 닉네임을 볼 수 있어요.<br>경기 중에는 상대방 이름을 숨겨요.</p></section></div>
  ${teacherAvailable ? '<div class="student-demo-return"><span class="demo-tools-label">체험 도구</span><button class="lobby-text-button" data-action="teacher-preview" type="button">선생님 대기실로 돌아가기 →</button></div>' : ''}
  <button class="close-room-button" data-action="leave" type="button">대기실 나가기</button>`;
}
function closedView() {
  return `${heading('CLASSROOM OMOK', '체험 방이 닫혔어요', '선생님 화면에서 새 체험 방을 만들어 주세요.')}<button class="lobby-primary" data-action="create" type="button">새 체험 방 만들기</button><button class="lobby-text-button" data-action="join" type="button">학생으로 참가하기</button>`;
}
function showError(message) { const el = root.querySelector('#lobbyError'); if (el) el.textContent = message; }
function createRoom(event) {
  event.preventDefault();
  try { room = makeRoom(new FormData(event.currentTarget).get('rounds')); ownStudentId = null; teacherAvailable = true; open('teacher'); }
  catch (e) { showError(e.message); }
}
function joinRoom(event) {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  if (data.get('code') !== DEMO_CODE) { showError(`지금은 예시 코드 ${DEMO_CODE}로 체험할 수 있어요.`); return; }
  try {
    if (room?.closed) throw new Error('닫힌 체험 방이에요. 선생님 화면에서 새 방을 만들어 주세요.');
    if (!room) { room = makeRoom(); addSamples(room); teacherAvailable = false; }
    // Returning to the form replaces only this tab's existing student entry.
    const name = data.get('nickname');
    const me = ownStudentId && room.participants.find(p => p.id === ownStudentId);
    if (me) { if (room.locked) throw new Error('선생님이 입장을 잠갔어요.'); renameStudent(room, me.id, name); }
    else ownStudentId = addStudent(room, name).id;
    open('student');
  } catch (e) { showError(e.message); }
}
let dialogReturnFocus = null;
function showModal(title, content, onMount) {
  dialogReturnFocus = document.activeElement;
  dialog.innerHTML = `<div class="dialog-head"><h2 id="lobbyDialogTitle">${escape(title)}</h2><button type="button" data-dialog-close aria-label="닫기">✕</button></div>${content}`;
  dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close());
  onMount?.(); dialog.showModal();
}
dialog.addEventListener('close', () => { if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus({ preventScroll: true }); });
function manage(id) {
  const p = room?.participants.find(p => p.id === id); if (!p || !teacherAvailable) return;
  showModal('참가 학생 관리', `<form id="renameStudentForm"><label class="field-label" for="renameNickname">닉네임</label><input class="lobby-input" id="renameNickname" required maxlength="12" value="${escape(p.nickname)}"><p id="renameError" class="lobby-error" role="alert"></p><button class="lobby-primary" type="submit">이름 변경하기</button></form><button id="kickStudent" class="lobby-danger" type="button">대기실에서 내보내기</button>`, () => {
    dialog.querySelector('#renameStudentForm').addEventListener('submit', event => {
      event.preventDefault();
      try { renameStudent(room, id, dialog.querySelector('#renameNickname').value); save(); dialog.close(); render(); root.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus(); }
      catch (e) { dialog.querySelector('#renameError').textContent = e.message; }
    });
    dialog.querySelector('#kickStudent').addEventListener('click', () => {
      dialog.close();
      showModal('학생을 내보낼까요?', `<p class="confirm-copy"><b>${escape(p.nickname)}</b> 님이 체험 대기실에서 나가요.</p><div class="lobby-dialog-actions"><button class="lobby-secondary" id="cancelKick" type="button">취소</button><button class="lobby-danger" id="confirmKick" type="button">내보내기</button></div>`, () => {
        dialog.querySelector('#cancelKick').onclick = () => dialog.close();
        dialog.querySelector('#confirmKick').onclick = () => { removeStudent(room, id); save(); dialog.close(); render(); root.querySelector('.lock-button')?.focus(); };
      });
    });
  });
}
root.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'home') { if (dialog.open) dialog.close(); showMainMenu(); }
  if (action === 'create') open('create');
  if (action === 'join') { document.getElementById('joinCode').value = DEMO_CODE; open('join'); }
  if (action === 'fill-example') { root.querySelector('#lobbyCode').value = DEMO_CODE; root.querySelector('#studentNickname').focus(); }
  if (action === 'add-samples' && teacherAvailable) { addSamples(room); save(); render(); root.querySelector('[data-action="add-samples"]')?.focus(); root.querySelector('#lobbyStatus').textContent = '예시 학생이 대기실에 들어왔어요.'; }
  if (action === 'manage') manage(button.dataset.id);
  if (action === 'toggle-lock' && teacherAvailable) { room.locked = !room.locked; save(); render(); root.querySelector('.lock-button').focus(); }
  if (action === 'student-preview') { document.getElementById('joinCode').value = DEMO_CODE; open('join'); }
  if (action === 'teacher-preview' && teacherAvailable) open('teacher');
  if (action === 'copy-code') {
    try { await navigator.clipboard.writeText(room.code); root.querySelector('#copyStatus')?.replaceChildren(document.createTextNode('코드를 복사했어요.')); }
    catch { root.querySelector('#copyStatus')?.replaceChildren(document.createTextNode(`코드는 ${room.code}예요. 직접 입력해 주세요.`)); }
  }
  if (action === 'practice') {
    save(); root.classList.add('hidden'); document.body.classList.remove('online-mode');
    openPracticeFromLobby(() => open('student'));
  }
  if (action === 'leave') showModal('대기실에서 나갈까요?', '<p class="confirm-copy">내 닉네임이 참가자 목록에서 빠져요.</p><button id="confirmLeave" class="lobby-danger" type="button">대기실 나가기</button>', () => {
    dialog.querySelector('#confirmLeave').onclick = () => { removeStudent(room, ownStudentId); ownStudentId = null; save(); dialog.close(); showMainMenu(); };
  });
  if (action === 'close-room') showModal('체험 방을 닫을까요?', '<p class="confirm-copy">체험 참가자 목록이 초기화돼요. 다시 방을 만들 수 있어요.</p><button id="confirmCloseRoom" class="lobby-danger" type="button">방 닫기</button>', () => {
    dialog.querySelector('#confirmCloseRoom').onclick = () => { room.closed = true; room.participants = []; ownStudentId = null; save(); dialog.close(); open('teacher'); };
  });
});
document.getElementById('createOnlineRoom').addEventListener('click', () => open(room && !room.closed && teacherAvailable ? 'teacher' : 'create'));
document.getElementById('joinOnlineRoom').addEventListener('click', () => open(room && !room.closed && ownStudentId && room.participants.some(p => p.id === ownStudentId) ? 'student' : 'join'));
document.addEventListener('omok:home', () => { root.classList.add('hidden'); document.body.classList.remove('online-mode'); screen='home';save(); });
if(room && !room.closed && ['teacher','student'].includes(screen))open(screen);

import { emptyBoard, tryMove } from '../../rules.js';
export const GAME_MS = 300_000;
export const ROOM_MS = 2 * 60 * 60 * 1000;
export const KEEP_MS = 24 * 60 * 60 * 1000;
export function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
export function nickname(value) {
  if (typeof value !== 'string') fail('닉네임을 입력해 주세요.');
  const name = value.trim().replace(/\s+/g, ' ');
  if ([...name].length < 2 || [...name].length > 12) fail('닉네임은 2~12자로 입력해 주세요.');
  return name;
}
export function newRoom(id, code, rounds, teacherHash, now) {
  if (![3, 5, 7].includes(rounds)) fail('라운드는 3·5·7 중에서 골라 주세요.');
  return { id, code, rounds, round: 0, phase: 'lobby', locked: false, version: 1,
    expiresAt: now + ROOM_MS, purgeAt: now + ROOM_MS + KEEP_MS,
    teacher: { id: 'teacher', hash: teacherHash, epoch: 0 }, participants: [], matches: [], tickets: [], receipts: [] };
}
export function expire(room, now) {
  let changed = false;
  if (room.phase !== 'closed' && now >= room.expiresAt) {
    room.phase = 'closed'; room.locked = true; changed = true;
  }
  const match = room.matches.at(-1);
  if (match?.status === 'active' && (now >= match.deadlineAt || room.phase === 'closed')) {
    endMatch(room, match, null, now >= match.deadlineAt ? 'time' : 'closed'); changed = true;
  }
  if (changed) room.version++;
  return changed;
}
export function endMatch(room, match, winner, reason) {
  if (match.status !== 'active') return;
  match.status = winner ? 'won' : 'draw'; match.winner = winner; match.reason = reason;
  match.names = Object.fromEntries(room.participants.filter(p => match.players.includes(p.id)).map(p => [p.id, p.nickname]));
  for (const id of match.players) {
    const p = room.participants.find(p => p.id === id); if (!p) continue;
    p.points += winner ? (id === winner ? 2 : 0) : 1;
  }
  if (room.phase !== 'closed') room.phase = room.round >= room.rounds ? 'finished' : 'between';
}
export function command(room, actorId, action, data, onlineIds, now, random = Math.random) {
  if (room.phase === 'closed') fail('방이 닫혔어요.', 410);
  const teacher = actorId === 'teacher';
  const me = room.participants.find(p => p.id === actorId && !p.removed);
  if (!teacher && !me) fail('참가 권한이 없어요.', 403);
  const teacherActions = ['start', 'rename', 'kick', 'lock', 'draw', 'close'];
  if (teacherActions.includes(action) && !teacher) fail('선생님만 사용할 수 있어요.', 403);
  const match = room.matches.at(-1);
  if (action === 'start') {
    if (!['lobby', 'between'].includes(room.phase) || room.round >= room.rounds) fail('지금은 다음 경기를 시작할 수 없어요.');
    const players = room.participants.filter(p => !p.removed && onlineIds.includes(p.id));
    if (players.length !== 2) fail('이번 연결 검증은 접속 중인 학생 두 명이 필요해요.');
    const [a, b] = players;
    const balanceA = 2*a.black-a.games, balanceB = 2*b.black-b.games;
    if (balanceA > balanceB || (balanceA === balanceB && random() < .5)) players.reverse();
    room.round++; players[0].black++; for(const p of players)p.games++;
    room.matches.push({ id: crypto.randomUUID(), round: room.round, players: players.map(p => p.id), board: emptyBoard(), turn: 1,
      ply: 0, lastMove: null, deadlineAt: now + GAME_MS, status: 'active', winner: null, reason: null });
    room.phase = 'playing';
  } else if (action === 'move') {
    if (teacher || !match || match.status !== 'active' || !match.players.includes(actorId)) fail('진행 중인 내 경기가 없어요.', 403);
    if (data.matchId !== match.id || data.ply !== match.ply) fail('판이 바뀌었어요. 다시 확인해 주세요.', 409);
    if (match.players[match.turn - 1] !== actorId) fail('상대방 차례예요.', 409);
    if (now >= match.deadlineAt) fail('경기 시간이 끝났어요.', 409);
    const result = tryMove(match.board, data.r, data.c, match.turn);
    if (!result.ok) fail(result.reason, 422);
    match.lastMove = { r: data.r, c: data.c }; match.ply++;
    if (result.win || result.draw) endMatch(room, match, result.win ? actorId : null, result.win ? 'five' : 'full');
    else match.turn = 3 - match.turn;
  } else if (action === 'rename') {
    const p = room.participants.find(p => p.id === data.id && !p.removed); if (!p) fail('참가자를 찾을 수 없어요.');
    const name = nickname(data.nickname);
    if (room.participants.some(other => !other.removed && other.id !== p.id && other.nickname === name)) fail('같은 닉네임이 있어요.');
    p.nickname = name;
  } else if (action === 'kick') {
    const p = room.participants.find(p => p.id === data.id && !p.removed); if (!p) fail('참가자를 찾을 수 없어요.');
    if (match?.status === 'active' && match.players.includes(p.id)) endMatch(room, match, null, 'teacher');
    p.removed = true; p.epoch++;
  } else if (action === 'lock') {
    if (typeof data.locked !== 'boolean') fail('입장 잠금 값을 확인해 주세요.'); room.locked = data.locked;
  } else if (action === 'draw') {
    if (!match || match.status !== 'active') fail('진행 중인 경기가 없어요.'); endMatch(room, match, null, 'teacher');
  } else if (action === 'close') {
    room.phase = 'closed'; room.locked = true; room.purgeAt = now + KEEP_MS;
    if (match?.status === 'active') endMatch(room, match, null, 'closed');
  } else fail('지원하지 않는 요청이에요.');
  room.version++;
}
export function view(room, actorId, onlineIds, now) {
  const teacher = actorId === 'teacher';
  const me = room.participants.find(p => p.id === actorId && !p.removed);
  if (!teacher && !me) fail('대기실에서 내보내졌어요.', 403);
  const match = room.matches.at(-1), active = match?.status === 'active';
  const myColor = match ? match.players.indexOf(actorId) + 1 : 0;
  const participants = teacher || !active ? room.participants.filter(p => !p.removed).map(p => ({ id: teacher ? p.id : (p.id === actorId ? p.id : undefined), nickname: p.nickname,
    online: onlineIds.includes(p.id), points: p.points, me: p.id === actorId })) : undefined;
  const out = { id: room.id, code: room.code, rounds: room.rounds, round: room.round, phase: room.phase, locked: room.locked,
    version: room.version, serverNow: now, expiresAt: room.expiresAt, role: teacher ? 'teacher' : 'student',
    me: me ? { id: me.id, nickname: me.nickname, points: me.points } : null,
    count: room.participants.filter(p => !p.removed).length, onlineCount: onlineIds.length, participants,
    completed: match && !active ? 2 : 0, total: match ? 2 : 0 };
  if (match) out.match = { id: match.id, board: match.board, turn: match.turn, ply: match.ply, lastMove: match.lastMove,
    deadlineAt: match.deadlineAt, status: match.status, reason: match.reason, myColor,
    opponentOnline: myColor ? onlineIds.includes(match.players[myColor === 1 ? 1 : 0]) : undefined,
    names: !active || teacher ? match.players.map(id => room.participants.find(p => p.id === id)?.nickname || '참가자') : undefined,
    result: active ? null : (match.winner ? (match.winner === actorId ? 'win' : teacher ? 'decided' : 'loss') : 'draw'),
    winnerColor: match.winner ? match.players.indexOf(match.winner) + 1 : 0 };
  return out;
}

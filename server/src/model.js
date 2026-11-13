import { emptyBoard, tryMove } from '../../rules.js';
export const GAME_MS = 300_000;
export const ROOM_MS = 2 * 60 * 60 * 1000;
export const KEEP_MS = 24 * 60 * 60 * 1000;
export const MAX_STUDENTS = 40;
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
export const currentMatches = room => room.matches.filter(m => m.round === room.round);
function settleRound(room) {
  if (room.phase !== 'closed' && !currentMatches(room).some(m => m.status === 'active')) {
    room.phase = room.round >= room.rounds ? 'finished' : 'between';
  }
}
export function expire(room, now) {
  let changed = false;
  if (room.phase !== 'closed' && now >= room.expiresAt) {
    room.phase = 'closed'; room.locked = true; changed = true;
  }
  for (const match of room.matches) {
    if (match.status === 'active' && (now >= match.deadlineAt || room.phase === 'closed')) {
      endMatch(room, match, null, now >= match.deadlineAt ? 'time' : 'closed'); changed = true;
    }
  }
  if (changed) room.version++;
  return changed;
}
export function endMatch(room, match, winner, reason) {
  if (match.status !== 'active') return;
  match.status = winner ? 'won' : 'draw'; match.winner = winner; match.reason = reason;
  // Freeze result names, including when a teacher later renames/removes someone.
  match.names = Object.fromEntries(room.participants.filter(p => match.players.includes(p.id)).map(p => [p.id, p.nickname]));
  for (const id of match.players) {
    const p = room.participants.find(p => p.id === id); if (!p) continue;
    p.points += winner ? (id === winner ? 2 : 0) : 1;
  }
  settleRound(room);
}
function shuffle(values, random) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export function pairing(room, onlineIds, random = Math.random) {
  let pool = shuffle(room.participants.filter(p => !p.removed && onlineIds.includes(p.id)), random);
  if (pool.length < 2) fail('접속 중인 학생이 두 명 이상 필요해요.');
  let bye;
  if (pool.length % 2) {
    const byes = p => room.matches.filter(m => m.status === 'bye' && m.players.includes(p.id)).length;
    // Everyone with fewer byes gets priority; lower points break the tie.
    pool.sort((a, b) => byes(a) - byes(b) || a.points - b.points);
    bye = pool.shift();
  }
  pool.sort((a, b) => b.points - a.points);
  const pairs = [];
  const meetings = (a, b) => room.matches.filter(m => m.players.includes(a.id) && m.players.includes(b.id)).length;
  while (pool.length) {
    const a = pool.shift();
    pool.sort((b, c) => Math.abs(a.points - b.points) - Math.abs(a.points - c.points) || meetings(a, b) - meetings(a, c));
    const b = pool.shift(), players = [a, b];
    const balanceA = 2 * a.black - a.games, balanceB = 2 * b.black - b.games;
    if (balanceA > balanceB || (balanceA === balanceB && random() < .5)) players.reverse();
    pairs.push(players);
  }
  return { pairs, bye };
}
export function command(room, actorId, action, data, onlineIds, now, random = Math.random) {
  if (room.phase === 'closed') fail('방이 닫혔어요.', 410);
  const teacher = actorId === 'teacher';
  const me = room.participants.find(p => p.id === actorId && !p.removed);
  if (!teacher && !me) fail('참가 권한이 없어요.', 403);
  const teacherActions = ['start', 'rename', 'kick', 'lock', 'draw', 'close'];
  if (teacherActions.includes(action) && !teacher) fail('선생님만 사용할 수 있어요.', 403);
  if (action === 'start') {
    if (!['lobby', 'between'].includes(room.phase) || room.round >= room.rounds) fail('모든 경기가 끝난 뒤 다음 라운드를 시작할 수 있어요.');
    const { pairs, bye } = pairing(room, onlineIds, random);
    room.round++;
    for (const [i, players] of pairs.entries()) {
      players[0].black++; for (const p of players) p.games++;
      room.matches.push({ id: crypto.randomUUID(), round: room.round, number: i + 1, players: players.map(p => p.id), board: emptyBoard(), turn: 1,
        ply: 0, lastMove: null, deadlineAt: now + GAME_MS, status: 'active', winner: null, reason: null });
    }
    if (bye) {
      bye.points += 2;
      room.matches.push({ id: crypto.randomUUID(), round: room.round, number: pairs.length + 1, players: [bye.id],
        status: 'bye', winner: bye.id, reason: 'bye', names: { [bye.id]: bye.nickname } });
    }
    room.phase = 'playing';
  } else if (action === 'move') {
    const match = currentMatches(room).find(m => m.id === data.matchId);
    if (teacher || !match || match.status !== 'active' || !match.players.includes(actorId)) fail('진행 중인 내 경기가 없어요.', 403);
    if (data.ply !== match.ply) fail('판이 바뀌었어요. 다시 확인해 주세요.', 409);
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
    for (const m of currentMatches(room)) if (m.status === 'active' && m.players.includes(p.id)) endMatch(room, m, null, 'teacher');
    p.removed = true; p.epoch++;
  } else if (action === 'lock') {
    if (typeof data.locked !== 'boolean') fail('입장 잠금 값을 확인해 주세요.'); room.locked = data.locked;
  } else if (action === 'draw') {
    const targets = currentMatches(room).filter(m => m.status === 'active' && (!data.matchId || m.id === data.matchId));
    if (!targets.length) fail('진행 중인 경기가 없어요.');
    for (const m of targets) endMatch(room, m, null, 'teacher');
  } else if (action === 'close') {
    room.phase = 'closed'; room.locked = true; room.purgeAt = now + KEEP_MS;
    for (const m of room.matches) if (m.status === 'active') endMatch(room, m, null, 'closed');
  } else fail('지원하지 않는 요청이에요.');
  room.version++;
}
function matchView(room, match, actorId, onlineIds) {
  const teacher = actorId === 'teacher', active = match.status === 'active', myColor = match.players.indexOf(actorId) + 1;
  const names = match.players.map(id => match.names?.[id] || room.participants.find(p => p.id === id)?.nickname || '참가자');
  return { id: match.id, number: match.number || 1, board: match.board, turn: match.turn, ply: match.ply, lastMove: match.lastMove,
    deadlineAt: match.deadlineAt, status: match.status, reason: match.reason, myColor,
    opponentOnline: myColor && match.players.length === 2 ? onlineIds.includes(match.players[myColor === 1 ? 1 : 0]) : undefined,
    names: !active || teacher ? names : undefined,
    result: active ? null : match.status === 'bye' ? 'bye' : (match.winner ? (match.winner === actorId ? 'win' : teacher ? 'decided' : 'loss') : 'draw'),
    winnerColor: match.winner ? match.players.indexOf(match.winner) + 1 : 0 };
}
export function view(room, actorId, onlineIds, now) {
  const teacher = actorId === 'teacher';
  const me = room.participants.find(p => p.id === actorId && !p.removed);
  if (!teacher && !me) fail('대기실에서 내보내졌어요.', 403);
  const matches = currentMatches(room), playing = room.phase === 'playing';
  // Preserve the teacher's single-game board for existing two-student rooms.
  const match = teacher ? (matches.length === 1 ? matches[0] : undefined) : matches.find(m => m.players.includes(actorId));
  const participants = teacher || !playing ? room.participants.filter(p => !p.removed).map(p => ({ id: teacher ? p.id : (p.id === actorId ? p.id : undefined), nickname: p.nickname,
    online: onlineIds.includes(p.id), points: p.points, me: p.id === actorId,
    roundStatus: matches.find(m => m.players.includes(p.id))?.status || 'waiting' })) : undefined;
  const out = { id: room.id, code: room.code, rounds: room.rounds, round: room.round, phase: room.phase, locked: room.locked,
    version: room.version, serverNow: now, expiresAt: room.expiresAt, role: teacher ? 'teacher' : 'student',
    me: me ? { id: me.id, nickname: me.nickname, points: me.points } : null,
    count: room.participants.filter(p => !p.removed).length, capacity: MAX_STUDENTS,
    onlineCount: room.participants.filter(p => !p.removed && onlineIds.includes(p.id)).length, participants,
    completed: matches.filter(m => m.status !== 'active').reduce((n, m) => n + m.players.length, 0),
    total: matches.reduce((n, m) => n + m.players.length, 0),
    matches: matches.map((m, i) => ({ id: m.id, number: m.number || i + 1, status: m.status,
      mine: m.players.includes(actorId), deadlineAt: m.deadlineAt,
      names: m.status !== 'active' || teacher ? m.players.map(id => m.names?.[id] || room.participants.find(p => p.id === id)?.nickname || '참가자') : undefined,
      connected: m.players.filter(id => onlineIds.includes(id)).length })),
    waitingForNextRound: !teacher && room.round > 0 && !match && !['finished', 'closed'].includes(room.phase) };
  if (match) {
    if (match.status === 'bye') out.bye = true;
    else out.match = matchView(room, match, actorId, onlineIds);
  }
  if (room.phase === 'finished') {
    const sorted = room.participants.filter(p => !p.removed).sort((a, b) => b.points - a.points);
    out.standings = sorted.map((p, i) => ({ nickname: p.nickname, points: p.points, rank: sorted.findIndex(other => other.points === p.points) + 1, me: p.id === actorId }));
  }
  return out;
}

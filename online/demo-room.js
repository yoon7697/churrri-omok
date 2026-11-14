// Browser-only screen prototype. This is deliberately not an online transport.
export const DEMO_CODE = '4827';
export const LIMIT = 40;
export const sampleNames = ['파란고래', '반짝별', '구름토끼', '씩씩한곰', '초록새싹', '웃는펭귄'];
export function normalizeNickname(value) {
  const name = String(value).trim().replace(/\s+/g, ' ');
  if ([...name].length < 2 || [...name].length > 12) throw new Error('닉네임은 2~12자로 입력해 주세요.');
  return name;
}
export function makeRoom(rounds = 5) {
  if (![3, 5, 7].includes(Number(rounds))) throw new Error('라운드를 다시 선택해 주세요.');
  return { code: DEMO_CODE, rounds: Number(rounds), locked: false, closed: false, participants: [] };
}
export function addStudent(room, name, example = false) {
  if (room.closed) throw new Error('닫힌 체험 방이에요. 새 방을 만들어 주세요.');
  if (room.locked) throw new Error('선생님이 입장을 잠갔어요. 잠금을 해제한 뒤 다시 참가해 주세요.');
  if (room.participants.length >= LIMIT) throw new Error('체험 방 정원 40명이 가득 찼어요.');
  const nickname = normalizeNickname(name);
  if (room.participants.some(p => p.nickname === nickname)) throw new Error('같은 닉네임이 있어요. 다른 이름을 입력해 주세요.');
  const student = { id: crypto.randomUUID(), nickname, state: 'online', example };
  room.participants.push(student);
  return student;
}
export function renameStudent(room, id, name) {
  const student = room.participants.find(p => p.id === id);
  if (!student) throw new Error('참가자를 찾을 수 없어요.');
  const nickname = normalizeNickname(name);
  if (room.participants.some(p => p.id !== id && p.nickname === nickname)) throw new Error('같은 닉네임이 있어요. 다른 이름을 입력해 주세요.');
  student.nickname = nickname;
}
export function removeStudent(room, id) { room.participants = room.participants.filter(p => p.id !== id); }
export function addSamples(room) {
  for (const name of sampleNames) {
    if (!room.participants.some(p => p.nickname === name) && room.participants.length < LIMIT) addStudent(room, name, true);
  }
}

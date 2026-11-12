// CHURRRI'S LAB · 우리 반 오목왕 v0.2
// Classroom house rules: both colors forbid double open-threes;
// five or more in a row wins; completing five takes priority over 3·3.
// This is NOT official Renju rules (no 4·4 or overline prohibition).
export const SIZE = 15;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
export function emptyBoard() { return Array.from({length: SIZE}, () => Array(SIZE).fill(0)); }
export function inBounds(r, c) { return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
export function countLine(board, r, c, dr, dc, player) {
  let total = 1;
  for (const sign of [-1, 1]) {
    let y = r + dr * sign, x = c + dc * sign;
    while (inBounds(y, x) && board[y][x] === player) { total++; y += dr * sign; x += dc * sign; }
  }
  return total;
}
export function isFive(board, r, c, player) {
  if (!inBounds(r, c) || board[r][c] !== player) return false;
  return DIRS.some(([dr, dc]) => countLine(board, r, c, dr, dc, player) >= 5);
}
export function isBoardFull(board) { return board.every(row => row.every(cell => cell !== 0)); }

// A straight open four has exactly 4 consecutive stones with empty, playable
// intersections at BOTH ends. The newly created move and original move must
// be among those four stones. A straight four cannot be the edge of a five.
function isOpenFourIncluding(board, r, c, dr, dc, player, originalR, originalC) {
  for (let start = -3; start <= 0; start++) {
    const cells = Array.from({length: 4}, (_, i) => [r + (start + i) * dr, c + (start + i) * dc]);
    if (!cells.every(([y, x]) => inBounds(y, x) && board[y][x] === player)) continue;
    if (!cells.some(([y, x]) => y === originalR && x === originalC)) continue;
    const a = [r + (start - 1) * dr, c + (start - 1) * dc];
    const z = [r + (start + 4) * dr, c + (start + 4) * dc];
    if (inBounds(...a) && inBounds(...z) && board[a[0]][a[1]] === 0 && board[z[0]][z[1]] === 0) return true;
  }
  return false;
}

// An open three is a line which can be extended IN ONE LEGAL MOVE to an open
// straight four. A broken-three is recognized through that legal extension.
// To avoid circular hypothetical analyses, future extension legality is checked
// using the same local double-three model with a bounded lookahead.
function isOpenThreeAxis(board, r, c, dr, dc, player, depth) {
  for (let offset = -4; offset <= 4; offset++) {
    if (!offset) continue;
    const y = r + offset * dr, x = c + offset * dc;
    if (!inBounds(y, x) || board[y][x] !== 0) continue;
    board[y][x] = player;
    try {
      if (isFive(board, y, x, player)) continue;
      if (!isOpenFourIncluding(board, y, x, dr, dc, player, r, c)) continue;
      // Ignore a pseudo-three when its only extension is itself forbidden.
      if (depth > 0 && countOpenThreeAxes(board, y, x, player, depth - 1) >= 2) continue;
      return true;
    } finally { board[y][x] = 0; }
  }
  return false;
}
function countOpenThreeAxes(board, r, c, player, depth) {
  return DIRS.reduce((count, [dr, dc]) => count + Number(isOpenThreeAxis(board, r, c, dr, dc, player, depth)), 0);
}
export function isDoubleThree(board, r, c, player) {
  if (!inBounds(r, c) || board[r][c] !== 0 || (player !== 1 && player !== 2)) return false;
  board[r][c] = player;
  try {
    if (isFive(board, r, c, player)) return false;
    return countOpenThreeAxes(board, r, c, player, 1) >= 2;
  } finally { board[r][c] = 0; }
}
export function tryMove(board, r, c, player) {
  if (player !== 1 && player !== 2) return {ok:false, reason:'잘못된 돌 색이에요.'};
  if (!inBounds(r, c)) return {ok:false, reason:'바둑판 밖에는 둘 수 없어요.'};
  if (board[r][c] !== 0) return {ok:false, reason:'이미 돌이 놓인 자리예요.'};
  if (isDoubleThree(board, r, c, player)) return {ok:false, reason:'3·3 금지! 두 방향에 동시에 열린 삼을 만들 수 없어요.'};
  board[r][c] = player;
  const win = isFive(board, r, c, player);
  return {ok:true, win, draw:!win && isBoardFull(board)};
}

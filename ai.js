import { SIZE, inBounds, isFive, isDoubleThree, isBoardFull } from './rules.js';

const AXES = [[0, 1], [1, 0], [1, 1], [1, -1]];
const WIN = 10_000_000;
export const LEVELS = {
  easy: { depth: 1, width: 6, budget: 80, mistakeRate: 0.65, choiceWidth: 8 },
  normal: { depth: 1, width: 6, budget: 140, mistakeRate: 0.3, choiceWidth: 4 },
  hard: { depth: 3, width: 8, budget: 900 }
};

// Every immediate win must be considered, even beyond the search's shortlist.
function nearby(board) {
  const points = new Set();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (!board[r][c]) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const y = r + dy, x = c + dx;
      if (inBounds(y, x) && !board[y][x]) points.add(y * SIZE + x);
    }
  }
  if (!points.size && !board.some(row => row.some(Boolean))) return [{ r: 7, c: 7 }];
  return [...points].map(i => ({ r: Math.floor(i / SIZE), c: i % SIZE }));
}
export function legalMoves(board, player) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (!board[r][c] && !isDoubleThree(board, r, c, player)) moves.push({ r, c });
  }
  return moves;
}
function winsAt(board, move, player) {
  board[move.r][move.c] = player;
  try { return isFive(board, move.r, move.c, player); }
  finally { board[move.r][move.c] = 0; }
}

// Score five-cell windows through a hypothetical stone, including broken lines.
// Open straight threes/fours get extra weight over blocked formations.
function threat(board, { r, c }, player) {
  let score = 0;
  board[r][c] = player;
  try {
    for (const [dr, dc] of AXES) {
      for (let start = -4; start <= 0; start++) {
        let stones = 0, blocked = false;
        for (let i = start; i < start + 5; i++) {
          const y = r + i * dr, x = c + i * dc;
          if (!inBounds(y, x) || (board[y][x] && board[y][x] !== player)) { blocked = true; break; }
          if (board[y][x] === player) stones++;
        }
        if (!blocked) score += [0, 2, 20, 300, 12000, WIN][stones];
      }
      let count = 1, open = 0;
      for (const sign of [-1, 1]) {
        let y = r + dr * sign, x = c + dc * sign;
        while (inBounds(y, x) && board[y][x] === player) { count++; y += dr * sign; x += dc * sign; }
        if (inBounds(y, x) && !board[y][x]) open++;
      }
      if (open === 2) score += count >= 4 ? 80000 : count === 3 ? 4000 : count === 2 ? 80 : 0;
    }
    return score;
  } finally { board[r][c] = 0; }
}
function candidates(board, player) {
  const points = nearby(board);
  const wins = points.filter(m => winsAt(board, m, player));
  if (wins.length) return { moves: wins.map(m => ({ ...m, score: WIN })), win: true };
  const enemyWins = points.filter(m => winsAt(board, m, 3 - player));
  const legal = points.filter(m => !isDoubleThree(board, m.r, m.c, player));
  const blocks = legal.filter(m => enemyWins.some(e => e.r === m.r && e.c === m.c));
  let selected = blocks.length ? blocks : legal;
  // A nearby region can be exhausted by forbidden moves; search the whole board.
  if (!selected.length) selected = legalMoves(board, player);
  const moves = selected.map(m => ({ ...m,
    score: threat(board, m, player) + (isDoubleThree(board, m.r, m.c, 3 - player) ? 0 : threat(board, m, 3 - player) * 1.15)
      + (14 - Math.abs(m.r - 7) - Math.abs(m.c - 7))
  })).sort((a, b) => b.score - a.score || a.r - b.r || a.c - b.c);
  return { moves, win: false, forced: enemyWins.length > 0 };
}

// Iterative deepening: only use fully completed depths when the time budget ends.
// The worker keeps the UI responsive; the budget bounds tablet thinking time.
export function chooseMove(input, player, difficulty = 'normal', options = {}) {
  if (player !== 1 && player !== 2) throw new Error('Invalid computer color');
  const board = input.map(row => row.slice());
  if (isBoardFull(board)) return null;
  const config = LEVELS[difficulty] || LEVELS.normal;
  const now = options.now || (() => performance.now());
  const deadline = now() + config.budget;
  const root = candidates(board, player);
  if (!root.moves.length) return null;
  const clean = m => ({ r: m.r, c: m.c });
  if (root.win) return clean(root.moves[0]);
  if (config.depth === 1) {
    // Practice levels leave room to learn between immediate wins and forced blocks.
    const rng = options.random || Math.random;
    const choices = Math.min(root.moves.length - 1, config.choiceWidth - 1);
    const index = !root.forced && choices > 0 && rng() < config.mistakeRate ? 1 + Math.floor(rng() * choices) : 0;
    return clean(root.moves[index]);
  }
  const timeout = Symbol('search budget');
  function search(turn, depth, alpha, beta, ply) {
    if (now() >= deadline) throw timeout;
    const result = candidates(board, turn);
    if (result.win) return WIN - ply;
    if (!result.moves.length) return 0;
    if (depth === 0) {
      const attack = result.moves[0];
      const opponent = candidates(board, 3 - turn);
      if (opponent.win) return -WIN + ply + 1;
      return attack.score - (opponent.moves[0]?.score || 0);
    }
    let best = -Infinity;
    for (const m of result.moves.slice(0, config.width)) {
      board[m.r][m.c] = turn;
      let value;
      try { value = -search(3 - turn, depth - 1, -beta, -alpha, ply + 1); }
      finally { board[m.r][m.c] = 0; }
      best = Math.max(best, value); alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return best;
  }
  let bestMove = root.moves[0];
  for (let depth = 2; depth <= config.depth; depth++) {
    let iterationBest = bestMove, score = -Infinity;
    try {
      for (const m of root.moves.slice(0, config.width)) {
        if (now() >= deadline) throw timeout;
        board[m.r][m.c] = player;
        let value;
        try { value = -search(3 - player, depth - 1, -Infinity, -score, 1); }
        finally { board[m.r][m.c] = 0; }
        if (value > score) { score = value; iterationBest = m; }
      }
      bestMove = iterationBest;
    } catch (error) { if (error !== timeout) throw error; break; }
  }
  return clean(bestMove);
}

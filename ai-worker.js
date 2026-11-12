import { chooseMove } from './ai.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ move: chooseMove(data.board, data.player, data.difficulty) }); }
  catch { self.postMessage({ error: true }); }
};

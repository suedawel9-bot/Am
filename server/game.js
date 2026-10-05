import { cardFor, winningResult } from './cards.js';
import { cardsForRound, recordWinner } from './db.js';

const PRICE = 10;
const FEE_RATE = 0.20;
const LOBBY_SECONDS = 30;
const DRAW_INTERVAL = 1500;

let state = null;

export function newRound(roundId) {
  state = {
    roundId,
    phase: 'lobby',
    drawn: [],
    drawnSet: new Set(),
    winner: null,
    lobbyEndsAt: Date.now() + LOBBY_SECONDS * 1000,
    drawTimer: null,
    lobbyTimer: null
  };
}

export function startDrawing(io) {
  if (!state || state.phase !== 'lobby') return;
  state.phase = 'drawing';
  state.lobbyTimer = null;
  io.emit('phase', { phase: 'drawing' });
  tick(io);
}

function tick(io) {
  if (!state || state.phase !== 'drawing') return;

  const remaining = [];
  for (let n = 1; n <= 75; n++) if (!state.drawnSet.has(n)) remaining.push(n);
  if (remaining.length === 0) return finish(io, null);

  const n = remaining[Math.floor(Math.random() * remaining.length)];
  state.drawn.push(n);
  state.drawnSet.add(n);
  io.emit('draw', { number: n, drawn: state.drawn });

  const rows = cardsForRound(state.roundId);
  for (const { user_id, card_no } of rows) {
    const res = winningResult(cardFor(card_no), state.drawnSet);
    if (res) return finish(io, { userId: user_id, cardNo: card_no, result: res });
  }

  state.drawTimer = setTimeout(() => tick(io), DRAW_INTERVAL);
}

function finish(io, winner) {
  if (!state || state.phase === 'ended') return;
  clearTimeout(state.drawTimer);
  clearInterval(state.lobbyTimer);
  state.phase = 'ended';

  const totalCards = cardsForRound(state.roundId).length;
  const gross = totalCards * PRICE;
  const fee = gross * FEE_RATE;
  const prize = gross - fee;

  if (winner) {
    recordWinner(state.roundId, winner.userId, winner.cardNo, winner.result.pattern.name, prize);
    state.winner = { ...winner, prize, gross, fee };
    io.emit('winner', state.winner);
  } else {
    io.emit('winner', null);
  }

  setTimeout(() => {
    const nextId = state.roundId + 1;
    newRound(nextId);
    io.emit('newRound', publicState());
    startLobby(io);
  }, 5000);
}

export function startLobby(io) {
  if (!state) return;
  state.phase = 'lobby';
  state.lobbyEndsAt = Date.now() + LOBBY_SECONDS * 1000;
  io.emit('phase', { phase: 'lobby', lobbyEndsAt: state.lobbyEndsAt });

  state.lobbyTimer = setTimeout(() => startDrawing(io), LOBBY_SECONDS * 1000);
}

export function publicState() {
  if (!state) return null;
  return {
    roundId: state.roundId,
    phase: state.phase,
    drawn: state.drawn,
    winner: state.winner,
    lobbyEndsAt: state.lobbyEndsAt
  };
}

export { PRICE };

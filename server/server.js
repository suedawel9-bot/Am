import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import crypto from 'crypto';

import { TOTAL_CARDS, cardFor } from './cards.js';
import { getOrCreateUser, buyCard, getBalance, cardsForUser, cardsForRound } from './db.js';
import { newRound, startLobby, publicState, PRICE } from './game.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ---------- Telegram initData validation ----------
function validateInitData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');

    const secret = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const computed = crypto
      .createHmac('sha256', secret)
      .update(dataCheckString)
      .digest('hex');

    if (computed !== hash) return null;

    const userJson = params.get('user');
    return userJson ? JSON.parse(userJson) : null;
  } catch (e) {
    console.error('validateInitData error:', e.message);
    return null;
  }
}

// ---------- Helpers ----------
function broadcastPool() {
  const state = publicState();
  if (!state) return;
  const purchases = cardsForRound(state.roundId);
  const uniquePlayers = new Set(purchases.map(p => p.user_id)).size;
  io.emit('poolUpdate', {
    totalCards: purchases.length,
    playerCount: uniquePlayers
  });
}

// ---------- REST ----------
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'bingo-server',
    endpoints: ['/api/state', '/api/card/:no', '/api/auth', '/health']
  });
});

app.get('/health', (_req, res) => res.status(200).send('OK'));

app.post('/api/auth', (req, res) => {
  const { initData } = req.body || {};
  const user = validateInitData(initData);
  if (!user) return res.status(401).json({ error: 'INVALID_INIT_DATA' });
  const row = getOrCreateUser(String(user.id), user.first_name || 'Player');
  res.json({ user: row, balance: row.balance });
});

app.get('/api/card/:no', (req, res) => {
  const no = parseInt(req.params.no, 10);
  if (isNaN(no) || no < 1 || no > TOTAL_CARDS) {
    return res.status(400).json({ error: 'BAD_CARD' });
  }
  res.json({ cardNo: no, card: cardFor(no) });
});

app.get('/api/state', (_req, res) => res.json(publicState()));

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  let userId = null;

  // Send current game state immediately
  socket.emit('state', publicState());
  // Send current pool snapshot
  const snapshot = publicState();
  if (snapshot) {
    const purchases = cardsForRound(snapshot.roundId);
    socket.emit('poolUpdate', {
      totalCards: purchases.length,
      playerCount: new Set(purchases.map(p => p.user_id)).size
    });
  }

  socket.on('auth', ({ initData }) => {
    const user = validateInitData(initData);
    if (!user) return socket.emit('authError', 'INVALID_INIT_DATA');

    userId = String(user.id);
    const row = getOrCreateUser(userId, user.first_name || 'Player');

    socket.emit('authOk', {
      userId,
      balance: row.balance,
      myCards: cardsForUser(publicState().roundId, userId)
    });
  });

  socket.on('buyCard', ({ cardNo }, cb) => {
    if (!userId) return cb?.({ error: 'NOT_AUTH' });
    if (!cardNo || cardNo < 1 || cardNo > TOTAL_CARDS) {
      return cb?.({ error: 'BAD_CARD' });
    }

    try {
      buyCard(publicState().roundId, userId, cardNo, PRICE);

      // Recalculate pool and broadcast to everyone
      broadcastPool();

      cb?.({
        ok: true,
        balance: getBalance(userId),
        totalCards: cardsForRound(publicState().roundId).length
      });
    } catch (e) {
      cb?.({ error: e.message });
    }
  });

  socket.on('disconnect', () => {
    // no-op, but could be used for presence later
  });
});

// ---------- Bootstrap ----------
newRound(1);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bingo server on :${PORT}`);
  startLobby(io);
});

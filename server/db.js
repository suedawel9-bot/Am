import Database from 'better-sqlite3';

const db = new Database('bingo.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    name TEXT,
    balance REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS card_purchases (
    round_id INTEGER,
    user_id TEXT,
    card_no INTEGER,
    PRIMARY KEY (round_id, card_no)
  );

  CREATE TABLE IF NOT EXISTS winners (
    round_id INTEGER PRIMARY KEY,
    user_id TEXT,
    card_no INTEGER,
    pattern TEXT,
    prize REAL,
    created_at INTEGER
  );
`);

export function getOrCreateUser(id, name) {
  let row = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);
  if (row) return row;

  // NEW USER: Grant 100 Birr Welcome Bonus
  const WELCOME_BONUS = 100;
  db.prepare('INSERT INTO users (telegram_id, name, balance) VALUES (?, ?, ?)').run(id, name, WELCOME_BONUS);
  
  row = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);
  return row;
}

export function getBalance(id) {
  const r = db.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(id);
  return r ? r.balance : 0;
}

export function adjustBalance(id, delta) {
  db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(delta, id);
}

export function buyCard(roundId, userId, cardNo, price) {
  const tx = db.transaction(() => {
    const taken = db.prepare('SELECT 1 FROM card_purchases WHERE round_id = ? AND card_no = ?').get(roundId, cardNo);
    if (taken) throw new Error('CARD_TAKEN');

    const bal = getBalance(userId);
    if (bal < price) throw new Error('INSUFFICIENT');

    db.prepare('INSERT INTO card_purchases (round_id, user_id, card_no) VALUES (?, ?, ?)').run(roundId, userId, cardNo);
    adjustBalance(userId, -price);
  });
  tx();
}

export function cardsForRound(roundId) {
  return db.prepare('SELECT user_id, card_no FROM card_purchases WHERE round_id = ?').all(roundId);
}

export function cardsForUser(roundId, userId) {
  return db.prepare('SELECT card_no FROM card_purchases WHERE round_id = ? AND user_id = ?').all(roundId, userId).map(r => r.card_no);
}

export function recordWinner(roundId, userId, cardNo, pattern, prize) {
  db.prepare('INSERT OR REPLACE INTO winners (round_id, user_id, card_no, pattern, prize, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(roundId, userId, cardNo, pattern, prize, Date.now());
}

export default db;

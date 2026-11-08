// ============================================================
// /api/bingo/:action — Thanksgiving Bingo backend, one function.
//
//   GET  /api/bingo/topics           player-added squares (most used first)
//   POST /api/bingo/topics  { text } add a square (de-duped) → { text }
//   POST /api/bingo/boards  { squares, marked, mode, name? } → { id }
//   GET  /api/bingo/board?id=xxxx    a saved board (read-only)
// ============================================================

import { randomBytes } from 'node:crypto';
import { getStore } from '../../lib/bingo/store.js';
import { TOPICS, FREE } from '../../thanksgiving-bingo/js/topics.js';
import { CELLS, CENTER, cleanTopic, topicKey, validTopic, completedLines } from '../../thanksgiving-bingo/js/bingo.js';

const CURATED = new Map(TOPICS.map((t) => [topicKey(t), t]));
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function newId(len = 8) {
  const bytes = randomBytes(len);
  let s = '';
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return s;
}

async function listTopics(store) {
  return { topics: (await store.listTopics()).map((t) => t.text) };
}

async function addTopic(store, req) {
  const text = cleanTopic(req.body?.text);
  if (!validTopic(text)) throw httpError(400, 'Squares need 2–40 characters.');
  const key = topicKey(text);
  if (CURATED.has(key)) return { text: CURATED.get(key), curated: true };

  const existing = await store.findTopic(key);
  if (existing) {
    if (existing.hidden) throw httpError(400, 'That square isn\'t available.');
    return { text: existing.text };
  }
  try {
    const row = await store.addTopic(text, key);
    return { text: row.text };
  } catch (err) {
    if (err.supabaseStatus === 409) { // raced another player adding the same square
      const row = await store.findTopic(key);
      if (row && !row.hidden) return { text: row.text };
    }
    throw err;
  }
}

async function saveBoard(store, req) {
  const { squares, marked, mode, name } = req.body || {};
  if (!Array.isArray(squares) || squares.length !== CELLS) throw httpError(400, 'A board has 25 squares.');
  if (!Array.isArray(marked) || marked.length !== CELLS) throw httpError(400, 'Bad marks.');
  if (mode !== 'random' && mode !== 'custom') throw httpError(400, 'Bad mode.');

  const clean = squares.map((s, i) => (i === CENTER ? FREE : cleanTopic(s)));
  const keys = new Set();
  clean.forEach((s, i) => {
    if (i === CENTER) return;
    if (!validTopic(s)) throw httpError(400, 'Every square needs 2–40 characters.');
    const k = topicKey(s);
    if (keys.has(k)) throw httpError(400, 'Duplicate square on the board.');
    keys.add(k);
  });
  const marks = marked.map((m, i) => i === CENTER || m === true);
  const displayName = cleanTopic(name).slice(0, 30) || null;

  const row = {
    id: newId(), mode, squares: clean, marked: marks,
    bingo_lines: completedLines(marks), display_name: displayName,
  };
  try {
    await store.createBoard(row);
  } catch (err) {
    if (err.supabaseStatus !== 409) throw err;
    row.id = newId(); // id collision: astronomically rare, try once more
    await store.createBoard(row);
  }

  const playerKeys = [...keys].filter((k) => !CURATED.has(k));
  store.bumpTopics(playerKeys).catch((e) => console.error('[bingo] bump', e));
  return { id: row.id };
}

async function getBoard(store, req) {
  const id = String(req.query.id || '');
  if (!/^[a-z0-9]{6,12}$/.test(id)) throw httpError(404, 'Board not found.');
  const b = await store.getBoard(id);
  if (!b) throw httpError(404, 'Board not found.');
  return {
    id: b.id, createdAt: b.created_at, mode: b.mode, squares: b.squares,
    marked: b.marked, lines: b.bingo_lines, name: b.display_name,
  };
}

const ROUTES = {
  'GET topics': listTopics,
  'POST topics': addTopic,
  'POST boards': saveBoard,
  'GET board': getBoard,
};

export default async function handler(req, res) {
  const route = ROUTES[`${req.method} ${req.query.action}`];
  if (!route) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Cache-Control', req.query.action === 'board' ? 'public, max-age=60' : 'no-store');
  try {
    const store = getStore();
    return res.status(200).json(await route(store, req));
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error('[bingo]', err);
    return res.status(status).json({ error: status === 500 ? 'Server error' : err.message });
  }
}

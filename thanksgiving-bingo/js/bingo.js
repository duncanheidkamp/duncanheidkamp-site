// ============================================================
// bingo.js — pure game logic, shared by browser, API and tests.
// No DOM, no network.
// ============================================================

import { FREE, MAX_TOPIC_LENGTH, MIN_TOPIC_LENGTH } from './topics.js';

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const CENTER = 12;

/** All 12 lines: 5 rows, 5 columns, 2 diagonals. */
export const LINES = (() => {
  const out = [];
  for (let r = 0; r < SIZE; r++) out.push({ id: `row${r}`, cells: [0, 1, 2, 3, 4].map((c) => r * SIZE + c) });
  for (let c = 0; c < SIZE; c++) out.push({ id: `col${c}`, cells: [0, 1, 2, 3, 4].map((r) => r * SIZE + c) });
  out.push({ id: 'diag0', cells: [0, 6, 12, 18, 24] });
  out.push({ id: 'diag1', cells: [4, 8, 12, 16, 20] });
  return out;
})();

/** Ids of completed lines, e.g. ["row2", "diag0"]. */
export function completedLines(marked) {
  return LINES.filter((l) => l.cells.every((i) => marked[i])).map((l) => l.id);
}

/** Set of cell indexes that sit on any completed line. */
export function cellsInLines(marked) {
  const set = new Set();
  for (const l of LINES) if (l.cells.every((i) => marked[i])) l.cells.forEach((i) => set.add(i));
  return set;
}

/** Trim, collapse spaces. */
export function cleanTopic(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/** Case/punctuation-insensitive key for de-duplication. */
export function topicKey(text) {
  return cleanTopic(text).toLowerCase().replace(/[“”"'‘’.!?…]/g, '');
}

export function validTopic(text) {
  const t = cleanTopic(text);
  return t.length >= MIN_TOPIC_LENGTH && t.length <= MAX_TOPIC_LENGTH && t !== FREE;
}

/** Fisher–Yates with an injectable rng (tests pass a seeded one). */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 24 picks → 25 squares with FREE in the centre. */
export function layout(picks) {
  if (picks.length !== CELLS - 1) throw new Error(`Need ${CELLS - 1} squares, got ${picks.length}`);
  const squares = picks.slice();
  squares.splice(CENTER, 0, FREE);
  return squares;
}

/** Random board from a pool (de-duplicated). */
export function deal(pool, rng = Math.random) {
  const seen = new Set();
  const uniq = pool.filter((t) => {
    const k = topicKey(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (uniq.length < CELLS - 1) throw new Error('Not enough topics to deal a board');
  return layout(shuffle(uniq, rng).slice(0, CELLS - 1));
}

export function freshMarks() {
  const m = Array(CELLS).fill(false);
  m[CENTER] = true;
  return m;
}

/**
 * The Wordle-style share text.
 *   ⬛ not marked · 🟦 marked · 🟥 on a completed line
 */
export function shareGrid(marked) {
  const hot = cellsInLines(marked);
  const rows = [];
  for (let r = 0; r < SIZE; r++) {
    let s = '';
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c;
      s += hot.has(i) ? '🟥' : marked[i] ? '🟦' : '⬛';
    }
    rows.push(s);
  }
  return rows.join('\n');
}

export function bingoSummary(marked) {
  const n = completedLines(marked).length;
  const count = marked.filter(Boolean).length - 1; // not counting FREE
  if (marked.every(Boolean)) return 'BLACKOUT';
  if (n === 0) return `${count}/24, no bingo`;
  return n === 1 ? 'BINGO' : `${n}× BINGO`;
}

export function shareText(marked, url, year = new Date().getFullYear()) {
  return `Thanksgiving Bingo 🦃 ${year}\n${bingoSummary(marked)}\n${shareGrid(marked)}\n${url}`;
}

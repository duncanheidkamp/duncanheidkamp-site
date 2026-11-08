import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS, FREE } from '../js/topics.js';
import {
  LINES, CENTER, deal, layout, freshMarks, completedLines, shareGrid, shareText, topicKey, validTopic,
} from '../js/bingo.js';

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

test('curated list is long enough, short enough, and has no duplicates', () => {
  assert.ok(TOPICS.length >= 40);
  assert.equal(new Set(TOPICS.map(topicKey)).size, TOPICS.length);
  for (const t of TOPICS) assert.ok(validTopic(t), t);
});

test('there are 12 lines', () => {
  assert.equal(LINES.length, 12);
  assert.equal(LINES.filter((l) => l.cells.includes(CENTER)).length, 4);
});

test('deal: 25 unique squares with FREE in the centre', () => {
  for (let s = 1; s < 50; s++) {
    const b = deal(TOPICS, seeded(s));
    assert.equal(b.length, 25);
    assert.equal(b[CENTER], FREE);
    assert.equal(new Set(b).size, 25);
  }
});

test('layout needs exactly 24', () => {
  assert.throws(() => layout(TOPICS.slice(0, 23)));
  assert.equal(layout(TOPICS.slice(0, 24))[CENTER], FREE);
});

test('fresh board has no bingo; middle row + free is a bingo', () => {
  const m = freshMarks();
  assert.deepEqual(completedLines(m), []);
  [10, 11, 13, 14].forEach((i) => (m[i] = true));
  assert.deepEqual(completedLines(m), ['row2']);
  [0, 6, 18, 24].forEach((i) => (m[i] = true));
  assert.deepEqual(completedLines(m), ['row2', 'diag0']);
});

test('share grid colours', () => {
  const m = freshMarks();
  [10, 11, 13, 14, 0].forEach((i) => (m[i] = true));
  const g = shareGrid(m).split('\n');
  assert.equal(g[0], '🟦⬛⬛⬛⬛');
  assert.equal(g[2], '🟥🟥🟥🟥🟥');
  assert.ok(shareText(m, 'https://x/y', 2026).startsWith('Thanksgiving Bingo 🦃 2026\nBINGO\n'));
});

test('blackout', () => {
  assert.ok(shareText(Array(25).fill(true), 'u').includes('BLACKOUT'));
});

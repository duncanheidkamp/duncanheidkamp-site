// Run with:  npm test   (uses node's built-in test runner, no deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { points, pAssignedTo, scorePlayer, scoreNate, leaderboard, biggestUpset, consensus } from '../js/scoring.js';

test('points table from the spec', () => {
  assert.equal(points(0.9), 99);   // Safe right
  assert.equal(points(0.75), 94);  // Likely right
  assert.equal(points(0.6), 84);   // Lean right
  assert.equal(points(0.4), 64);   // Lean wrong
  assert.equal(points(0.25), 44);  // Likely wrong
  assert.equal(points(0.1), 19);   // Safe wrong
});

test('Nate exact probability: 0.737 correct → 93', () => {
  assert.equal(points(0.737), 93);
});

test('pAssignedTo flips confidence when the pick lost', () => {
  assert.equal(pAssignedTo('D', { side: 'D', confidence: 0.75 }), 0.75);
  assert.equal(pAssignedTo('R', { side: 'D', confidence: 0.75 }), 0.25);
});

test('scorePlayer only counts resolved races', () => {
  const picks = {
    'tx-sen': { side: 'D', confidence: 0.9 },  // right, Safe → 99
    'tx-gov': { side: 'D', confidence: 0.6 },  // wrong, Lean → 64
    'ak-sen': { side: 'R', confidence: 0.75 }, // pending
  };
  const s = scorePlayer(picks, { 'tx-sen': 'D', 'tx-gov': 'R' });
  assert.deepEqual({ pts: s.pts, w: s.w, l: s.l, called: s.called }, { pts: 163, w: 1, l: 1, called: 2 });
  assert.equal(s.avg, 81.5);
});

test('scoreNate skips races with no model number', () => {
  const s = scoreNate({ 'tx-sen': 0.737, 'tx-gov': null }, { 'tx-sen': 'D', 'tx-gov': 'R' });
  assert.deepEqual({ pts: s.pts, w: s.w, l: s.l }, { pts: 93, w: 1, l: 0 });
});

test('leaderboard breaks ties by closest House guess', () => {
  const same = { 'tx-sen': { side: 'D', confidence: 0.9 } };
  const rows = leaderboard(
    [
      { id: 'a', name: 'Ann', picks: same, houseD: 230 },
      { id: 'b', name: 'Bob', picks: same, houseD: 214 },
    ],
    { 'tx-sen': 'D' },
    215
  );
  assert.equal(rows[0].name, 'Bob');
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 2);
});

test('consensus and biggest upset', () => {
  const P = (name, side) => ({ name, picks: { 'tx-sen': { side, confidence: 0.75 }, 'ks-sen': { side: 'R', confidence: 0.6 } } });
  const players = [P('A', 'R'), P('B', 'R'), P('C', 'R'), P('D', 'D')];
  assert.deepEqual(consensus('tx-sen', players), { nD: 1, nR: 3, majority: 'R' });
  const up = biggestUpset(players, { 'tx-sen': 'D', 'ks-sen': 'R' });
  assert.equal(up.race.id, 'tx-sen');
  assert.deepEqual(up.rightNames, ['D']);
  assert.equal(biggestUpset(players, { 'ks-sen': 'R' }), null);
});

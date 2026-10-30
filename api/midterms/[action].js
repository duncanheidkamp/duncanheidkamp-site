// ============================================================
// /api/midterms/:action — the whole pick'em backend in one
// Vercel function (keeps us well under the Hobby function limit).
//
//   GET  /api/midterms/state    everything the page needs (gated grid)
//   POST /api/midterms/login    { name, pin }                → session
//   POST /api/midterms/submit   { name?, pin?, picks, houseD } → session
//   POST /api/midterms/admin    { passcode, results?, houseDFinal? }
//
// Sessions travel as "Authorization: Bearer <playerId>.<token>".
// Every write checks the lock time HERE, on the server.
// ============================================================

import { getStore } from '../../lib/midterms/store.js';
import { hashPin, verifyPin, newSessionToken, hashToken, addSessionHash, safeEqual, readSession } from '../../lib/midterms/auth.js';
import {
  RACES, RACE_IDS, CONFIDENCE_VALUES, LOCK_AT, MAX_PLAYERS, HOUSE_TOTAL, HOUSE_R_MIN, HOUSE_R_MAX,
} from '../../midterms/js/races.js';

// House D seats allowed = 435 − (R slider range) → 180…255.
const HOUSE_D_MIN = HOUSE_TOTAL - HOUSE_R_MAX;
const HOUSE_D_MAX = HOUSE_TOTAL - HOUSE_R_MIN;

// Small helper so handlers can `throw httpError(400, '...')`.
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

/** Lock time: settings table → env var → default in races.js. */
async function lockTime(store) {
  const settings = await store.getSettings();
  const iso = settings.lock_at || process.env.MIDTERMS_LOCK_AT || LOCK_AT;
  return { lockAt: new Date(iso), settings };
}

/** The player behind the Authorization header, or null. */
async function sessionPlayer(store, req) {
  const s = readSession(req);
  if (!s) return null;
  const p = await store.getPlayerById(s.playerId);
  if (!p || !(p.session_token_hashes || []).includes(hashToken(s.token))) return null;
  return p;
}

/** Rows from midterms_picks → { raceId: {side, confidence} }. */
function picksMap(rows) {
  const out = {};
  for (const r of rows) out[r.race_id] = { side: r.side, confidence: Number(r.confidence) };
  return out;
}

function cleanName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 20) throw httpError(400, 'Name must be 1–20 characters.');
  return name;
}

function cleanPin(raw) {
  const pin = String(raw || '');
  if (!/^\d{4}$/.test(pin)) throw httpError(400, 'PIN must be 4 digits.');
  return pin;
}

/** Validate a full entry: all 11 races + the House tiebreaker. */
function cleanEntry(body) {
  const picks = body.picks || {};
  const rows = [];
  for (const id of RACE_IDS) {
    const p = picks[id];
    if (!p || (p.side !== 'R' && p.side !== 'D')) throw httpError(400, `Missing pick for ${id}.`);
    const conf = Number(p.confidence);
    if (!CONFIDENCE_VALUES.some((v) => Math.abs(v - conf) < 1e-9)) throw httpError(400, `Bad confidence for ${id}.`);
    rows.push({ race_id: id, side: p.side, confidence: conf });
  }
  const houseD = Number(body.houseD);
  if (!Number.isInteger(houseD) || houseD < HOUSE_D_MIN || houseD > HOUSE_D_MAX) {
    throw httpError(400, 'Set the House split tiebreaker.');
  }
  return { rows, houseD };
}

/** Issue a fresh session token for a player (keeps other devices signed in). */
async function startSession(store, player) {
  const token = newSessionToken();
  await store.updatePlayer(player.id, {
    session_token_hashes: addSessionHash(player.session_token_hashes, hashToken(token)),
  });
  return { playerId: player.id, token };
}

// ---------- actions ----------

async function getState(store, req) {
  const { lockAt, settings } = await lockTime(store);
  const locked = Date.now() >= lockAt.getTime();
  const me = await sessionPlayer(store, req);

  const [submitted, results] = await Promise.all([store.listSubmittedPlayers(), store.listResults()]);

  // THE GATE: other players' picks only go to a submitted player, or to
  // anyone once picks are locked.
  const canSeeGrid = locked || !!(me && me.submitted_at);

  let players = [];
  if (canSeeGrid) {
    const all = await store.listPicks();
    const byPlayer = {};
    for (const row of all) (byPlayer[row.player_id] ||= []).push(row);
    players = submitted.map((p) => ({
      id: p.id,
      name: p.name,
      houseD: p.tiebreaker_house_d,
      submittedAt: p.submitted_at,
      picks: picksMap(byPlayer[p.id] || []),
    }));
  }

  let mine = null;
  if (me) {
    mine = {
      id: me.id,
      name: me.name,
      submitted: !!me.submitted_at,
      houseD: me.tiebreaker_house_d,
      picks: picksMap(await store.getPicksFor(me.id)),
    };
  }

  return {
    lockAt: lockAt.toISOString(),
    locked,
    serverNow: new Date().toISOString(),
    playerCount: submitted.length,
    // Names are fine to show to anyone ("6 players are in"); picks are not.
    playerNames: submitted.map((p) => p.name),
    canSeeGrid,
    me: mine,
    players,
    results: Object.fromEntries(results.map((r) => [r.race_id, { winner: r.winner, status: r.status }])),
    houseDFinal: settings.house_d_final ?? null,
  };
}

async function login(store, req) {
  const name = cleanName(req.body?.name);
  const pin = cleanPin(req.body?.pin);
  const player = await store.getPlayerByNameKey(name.toLowerCase());
  if (!player || !verifyPin(pin, player.pin_hash)) throw httpError(401, "That name and PIN don't match.");
  return { session: await startSession(store, player) };
}

async function submit(store, req) {
  const { lockAt } = await lockTime(store);
  if (Date.now() >= lockAt.getTime()) throw httpError(403, 'Picks are locked.');

  const { rows, houseD } = cleanEntry(req.body || {});

  // Who is this? A valid session wins; otherwise name + PIN.
  let player = await sessionPlayer(store, req);
  let session = null;
  if (!player) {
    const name = cleanName(req.body?.name);
    const pin = cleanPin(req.body?.pin);
    const key = name.toLowerCase();
    player = await store.getPlayerByNameKey(key);
    if (player) {
      if (!verifyPin(pin, player.pin_hash)) throw httpError(409, 'That name is taken. Wrong PIN?');
    } else {
      if ((await store.countPlayers()) >= MAX_PLAYERS) throw httpError(403, 'The pool is full.');
      try {
        player = await store.createPlayer({ name, name_key: key, pin_hash: hashPin(pin) });
      } catch (err) {
        // Two people grabbed the same name at once: unique constraint.
        if (/23505|duplicate/i.test(err.message)) throw httpError(409, 'That name was just taken. Try another.');
        throw err;
      }
    }
    session = await startSession(store, player);
    player = await store.getPlayerById(player.id);
  }

  const now = new Date().toISOString();
  await store.upsertPicks(rows.map((r) => ({ ...r, player_id: player.id, updated_at: now })));
  await store.updatePlayer(player.id, {
    tiebreaker_house_d: houseD,
    // First complete submission sets their column order; edits don't move them.
    submitted_at: player.submitted_at || now,
  });

  return { ok: true, session };
}

async function admin(store, req) {
  const expected = process.env.MIDTERMS_ADMIN_PASSCODE;
  if (!expected) throw httpError(503, 'Admin passcode not configured (MIDTERMS_ADMIN_PASSCODE).');
  if (!safeEqual(req.body?.passcode || '', expected)) throw httpError(401, 'Wrong passcode.');

  const { results, houseDFinal } = req.body;
  if (results && typeof results === 'object') {
    const now = new Date().toISOString();
    const rows = [];
    for (const [raceId, value] of Object.entries(results)) {
      if (!RACE_IDS.includes(raceId)) continue;
      // value: 'pending' | 'R' | 'D' | 'too_close'
      if (value === 'R' || value === 'D') rows.push({ race_id: raceId, winner: value, status: 'called', updated_at: now });
      else if (value === 'too_close') rows.push({ race_id: raceId, winner: null, status: 'too_close', updated_at: now });
      else rows.push({ race_id: raceId, winner: null, status: 'pending', updated_at: now });
    }
    if (rows.length) await store.upsertResults(rows);
  }
  if (houseDFinal !== undefined) {
    const n = houseDFinal === null || houseDFinal === '' ? null : Number(houseDFinal);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > HOUSE_TOTAL)) throw httpError(400, 'House seats must be 0–435.');
    await store.setSetting('house_d_final', n);
  }

  const [res, settings] = await Promise.all([store.listResults(), store.getSettings()]);
  return {
    ok: true,
    results: Object.fromEntries(res.map((r) => [r.race_id, r.status === 'called' ? r.winner : r.status])),
    houseDFinal: settings.house_d_final ?? null,
    races: RACES.map((r) => ({ id: r.id, title: r.title, r: r.r, d: r.d })),
  };
}

// ---------- router ----------

const ROUTES = {
  'GET state': getState,
  'POST login': login,
  'POST submit': submit,
  'POST admin': admin,
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const route = ROUTES[`${req.method} ${req.query.action}`];
  if (!route) return res.status(404).json({ error: 'Not found' });
  try {
    const store = getStore();
    return res.status(200).json(await route(store, req));
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error('[midterms]', err);
    return res.status(status).json({ error: status === 500 ? 'Server error' : err.message });
  }
}

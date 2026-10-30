// ============================================================
// store.js — persistence for the midterms pick'em.
//
// Two interchangeable backends with the same methods:
//   • supabaseStore — talks to Supabase's REST API (PostgREST) with the
//     service-role key. Used in production. No npm dependency: plain fetch.
//   • memoryStore   — keeps everything in a JS object. Only for local dev
//     (`npm run dev` sets MIDTERMS_STORE=memory). Resets on restart.
//
// Tables are prefixed `midterms_` so they can live in an existing
// Supabase project without colliding. See midterms/schema.sql.
// ============================================================

import { randomUUID } from 'node:crypto';

// ---------- Supabase (production) ----------

function supabaseStore(url, key) {
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  // Small wrapper: throws on HTTP errors so the API returns a 500.
  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  const eq = (v) => `eq.${encodeURIComponent(v)}`;

  return {
    async getPlayerByNameKey(nameKey) {
      const rows = await rest(`midterms_players?select=*&name_key=${eq(nameKey)}`);
      return rows[0] || null;
    },
    async getPlayerById(id) {
      // Guard: PostgREST errors on a malformed uuid, so check the shape first.
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const rows = await rest(`midterms_players?select=*&id=${eq(id)}`);
      return rows[0] || null;
    },
    async countPlayers() {
      const rows = await rest('midterms_players?select=id');
      return rows.length;
    },
    async createPlayer(fields) {
      const rows = await rest('midterms_players', { method: 'POST', body: fields, prefer: 'return=representation' });
      return rows[0];
    },
    async updatePlayer(id, fields) {
      await rest(`midterms_players?id=${eq(id)}`, { method: 'PATCH', body: { ...fields, updated_at: new Date().toISOString() } });
    },
    async listSubmittedPlayers() {
      return rest('midterms_players?select=id,name,tiebreaker_house_d,submitted_at&submitted_at=not.is.null&order=submitted_at.asc');
    },
    async listPicks() {
      return rest('midterms_picks?select=player_id,race_id,side,confidence');
    },
    async getPicksFor(playerId) {
      return rest(`midterms_picks?select=race_id,side,confidence&player_id=${eq(playerId)}`);
    },
    async upsertPicks(rows) {
      await rest('midterms_picks?on_conflict=player_id,race_id', {
        method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal',
      });
    },
    async listResults() {
      return rest('midterms_results?select=race_id,winner,status');
    },
    async upsertResults(rows) {
      await rest('midterms_results?on_conflict=race_id', {
        method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal',
      });
    },
    async getSettings() {
      const rows = await rest('midterms_settings?select=key,value');
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    async setSetting(key, value) {
      await rest('midterms_settings?on_conflict=key', {
        method: 'POST', body: [{ key, value }], prefer: 'resolution=merge-duplicates,return=minimal',
      });
    },
  };
}

// ---------- In-memory (local dev only) ----------

function memoryStore() {
  const db = { players: [], picks: [], results: [], settings: {} };
  const now = () => new Date().toISOString();
  const clone = (x) => JSON.parse(JSON.stringify(x));

  return {
    async getPlayerByNameKey(k) { return clone(db.players.find((p) => p.name_key === k) || null); },
    async getPlayerById(id) { return clone(db.players.find((p) => p.id === id) || null); },
    async countPlayers() { return db.players.length; },
    async createPlayer(fields) {
      const p = { id: randomUUID(), session_token_hashes: [], tiebreaker_house_d: null, submitted_at: null, created_at: now(), updated_at: now(), ...fields };
      db.players.push(p);
      return clone(p);
    },
    async updatePlayer(id, fields) {
      const p = db.players.find((p) => p.id === id);
      if (p) Object.assign(p, fields, { updated_at: now() });
    },
    async listSubmittedPlayers() {
      return clone(db.players.filter((p) => p.submitted_at).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)));
    },
    async listPicks() { return clone(db.picks); },
    async getPicksFor(id) { return clone(db.picks.filter((p) => p.player_id === id)); },
    async upsertPicks(rows) {
      for (const row of rows) {
        const i = db.picks.findIndex((p) => p.player_id === row.player_id && p.race_id === row.race_id);
        if (i >= 0) db.picks[i] = { ...row }; else db.picks.push({ ...row });
      }
    },
    async listResults() { return clone(db.results); },
    async upsertResults(rows) {
      for (const row of rows) {
        const i = db.results.findIndex((r) => r.race_id === row.race_id);
        if (i >= 0) db.results[i] = { ...row }; else db.results.push({ ...row });
      }
    },
    async getSettings() { return clone(db.settings); },
    async setSetting(key, value) { db.settings[key] = value; },
  };
}

// ---------- Pick a backend ----------

let cached;
export function getStore() {
  if (cached) return cached;
  if (process.env.MIDTERMS_STORE === 'memory') {
    cached = memoryStore();
  } else {
    const url = process.env.MIDTERMS_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.MIDTERMS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Supabase env vars missing (MIDTERMS_SUPABASE_URL / MIDTERMS_SUPABASE_SERVICE_KEY)');
    cached = supabaseStore(url, key);
  }
  return cached;
}

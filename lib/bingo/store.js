// ============================================================
// store.js — persistence for Thanksgiving Bingo.
//
// Same idea as lib/midterms/store.js: Supabase via PostgREST with the
// service-role key in production, an in-memory object for local dev
// (`npm run dev` sets BINGO_STORE=memory).
//
// Uses the same Supabase project as the midterms pick'em
// (MIDTERMS_SUPABASE_URL / MIDTERMS_SUPABASE_SERVICE_KEY) unless
// BINGO_SUPABASE_URL / BINGO_SUPABASE_SERVICE_KEY are set.
// Tables: bingo_boards, bingo_topics (see thanksgiving-bingo/schema.sql).
// ============================================================

function supabaseStore(url, key) {
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const err = new Error(`Supabase ${method} ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
      err.supabaseStatus = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  const eq = (v) => `eq.${encodeURIComponent(v)}`;

  return {
    async listTopics() {
      return rest('bingo_topics?select=text,use_count&hidden=is.false&order=use_count.desc,created_at.asc&limit=300');
    },
    async findTopic(key) {
      const rows = await rest(`bingo_topics?select=text,hidden&text_key=${eq(key)}`);
      return rows[0] || null;
    },
    async addTopic(text, key) {
      const rows = await rest('bingo_topics', {
        method: 'POST', body: { text, text_key: key }, prefer: 'return=representation',
      });
      return rows[0];
    },
    async bumpTopics(keys) {
      if (keys.length) await rest('rpc/bingo_bump_topics', { method: 'POST', body: { keys } });
    },
    async createBoard(row) {
      await rest('bingo_boards', { method: 'POST', body: row, prefer: 'return=minimal' });
    },
    async getBoard(id) {
      const rows = await rest(`bingo_boards?select=id,created_at,mode,squares,marked,bingo_lines,display_name&id=${eq(id)}`);
      return rows[0] || null;
    },
  };
}

function memoryStore() {
  const topics = [];
  const boards = new Map();
  return {
    async listTopics() {
      return topics.filter((t) => !t.hidden).sort((a, b) => b.use_count - a.use_count)
        .map(({ text, use_count }) => ({ text, use_count }));
    },
    async findTopic(key) { return topics.find((t) => t.text_key === key) || null; },
    async addTopic(text, key) {
      const t = { text, text_key: key, hidden: false, use_count: 0 };
      topics.push(t);
      return t;
    },
    async bumpTopics(keys) { for (const t of topics) if (keys.includes(t.text_key)) t.use_count++; },
    async createBoard(row) { boards.set(row.id, { ...row, created_at: new Date().toISOString() }); },
    async getBoard(id) { return boards.get(id) || null; },
  };
}

let cached;
export function getStore() {
  if (cached) return cached;
  if (process.env.BINGO_STORE === 'memory') return (cached = memoryStore());
  const url = process.env.BINGO_SUPABASE_URL || process.env.MIDTERMS_SUPABASE_URL;
  const key = process.env.BINGO_SUPABASE_SERVICE_KEY || process.env.MIDTERMS_SUPABASE_SERVICE_KEY;
  if (!url || !key) throw Object.assign(new Error('Saving isn\'t set up yet.'), { status: 503 });
  return (cached = supabaseStore(url, key));
}

// ============================================================
// Local dev server: `npm run dev` → http://localhost:4210
//
// Serves the static site (with Vercel-style clean URLs) and runs the
// /api/midterms/* function in-process with an in-memory store, so you
// can click through the whole game without Supabase.
//
// Handy env vars:
//   MIDTERMS_LOCK_AT=2020-01-01T00:00:00Z npm run dev   → test "locked"
//   MIDTERMS_ADMIN_PASSCODE=letmein (default here)       → /midterms/admin
// ============================================================

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

process.env.MIDTERMS_STORE ||= 'memory';
process.env.MIDTERMS_ADMIN_PASSCODE ||= 'letmein';
process.env.BINGO_STORE ||= 'memory';

const { default: midterms } = await import('../api/midterms/[action].js');
const { default: bingo } = await import('../api/bingo/[action].js');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.PORT || 4210);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};

// Mimic the bits of Vercel's (req, res) helpers our function uses.
function shim(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

async function serveStatic(pathname, res) {
  // Clean URLs: /midterms → midterms/index.html, /midterms/admin → midterms/admin.html
  const tries = [pathname, `${pathname}.html`, join(pathname, 'index.html')];
  for (const t of tries) {
    const file = join(ROOT, t);
    if (!file.startsWith(ROOT)) break;
    try {
      if ((await stat(file)).isFile()) {
        res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
        return res.end(await readFile(file));
      }
    } catch {}
  }
  res.statusCode = 404;
  res.end('Not found');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const m = /^\/api\/midterms\/([a-z]+)$/.exec(url.pathname);
  if (m) {
    req.query = { action: m[1] };
    req.body = req.method === 'POST' ? await readBody(req) : undefined;
    return midterms(req, shim(res));
  }
  const b = /^\/api\/bingo\/([a-z]+)$/.exec(url.pathname);
  if (b) {
    req.query = { action: b[1], ...Object.fromEntries(url.searchParams) };
    req.body = req.method === 'POST' ? await readBody(req) : undefined;
    return bingo(req, shim(res));
  }
  return serveStatic(decodeURIComponent(url.pathname), res);
}).listen(PORT, () => console.log(`Dev server on http://localhost:${PORT}  (store: ${process.env.MIDTERMS_STORE})`));

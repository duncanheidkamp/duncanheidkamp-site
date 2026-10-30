// ============================================================
// admin.js — /midterms/admin
// Passcode (MIDTERMS_ADMIN_PASSCODE on Vercel) is checked by the
// server on every save. We keep it in sessionStorage so a refresh
// doesn't ask again; closing the tab forgets it.
// ============================================================

import { RACES, sideLabel } from './races.js';

const root = document.getElementById('admin');
const KEY = 'midterms.admin';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let passcode = (() => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } })();
let results = {};      // raceId → 'pending' | 'R' | 'D' | 'too_close'
let houseDFinal = null;
let msg = '';

async function call(body) {
  const res = await fetch('/api/midterms/admin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Error'), { status: res.status });
  results = data.results; houseDFinal = data.houseDFinal;
  return data;
}

function renderLogin(error = '') {
  root.innerHTML = `
    <form class="entry" id="login">
      <label class="field">Passcode <input name="pc" type="password" autocomplete="current-password" required /></label>
      <p class="error">${esc(error)}</p>
      <button class="btn" type="submit">Open admin</button>
    </form>`;
  root.querySelector('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    passcode = new FormData(e.target).get('pc');
    try {
      await call({});
      try { sessionStorage.setItem(KEY, passcode); } catch {}
      render();
    } catch (err) { renderLogin(err.message); }
  });
}

function render() {
  const called = RACES.filter((r) => results[r.id] === 'R' || results[r.id] === 'D').length;
  root.innerHTML = `
    <p class="small"><b>${called} of ${RACES.length}</b> races called. ${esc(msg)}</p>
    ${RACES.map((r) => {
      const cur = results[r.id] || 'pending';
      // The 'D' slot is labeled per race (Montana shows 'I won').
      const OPTS = [['pending', 'Pending'], ['R', 'R won'], ['D', `${sideLabel(r, 'D')} won`], ['too_close', 'Too close']];
      return `
        <div class="admin-race">
          <div><b>${esc(r.title)}</b><br><span>R ${esc(r.r)} · ${sideLabel(r, 'D')} ${esc(r.d)}</span></div>
          <div class="seg">${OPTS.map(([v, label]) => `<button type="button" class="${v} ${cur === v ? 'sel' : ''}" data-race="${r.id}" data-v="${v}">${label}</button>`).join('')}</div>
        </div>`;
    }).join('')}
    <form class="entry" id="house" style="margin-top:12px">
      <label class="field">Final House Democratic seats (tiebreaker)
        <input name="d" inputmode="numeric" pattern="[0-9]*" value="${houseDFinal ?? ''}" placeholder="e.g. 222" />
      </label>
      <button class="btn" type="submit">Save House result</button>
    </form>
    <button class="btn ghost" id="logout" style="margin-top:8px">Lock admin</button>`;

  root.querySelectorAll('.seg button').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await call({ results: { [b.dataset.race]: b.dataset.v } });
        msg = `Saved ${RACES.find((r) => r.id === b.dataset.race).title}.`;
      } catch (err) { msg = err.message; if (err.status === 401) return renderLogin(err.message); }
      render();
    })
  );
  root.querySelector('#house').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = new FormData(e.target).get('d');
    try { await call({ houseDFinal: v === '' ? null : Number(v) }); msg = 'Saved House result.'; }
    catch (err) { msg = err.message; }
    render();
  });
  root.querySelector('#logout').addEventListener('click', () => {
    try { sessionStorage.removeItem(KEY); } catch {}
    passcode = ''; renderLogin();
  });
}

if (passcode) call({}).then(render).catch(() => renderLogin()); else renderLogin();

// ============================================================
// app.js — the Midterms Pick'em page.
//
// One page, two views (switched with the URL hash):
//   #picks — make / edit your picks
//   #grid  — everyone's picks (+ leaderboard once races are called)
//
// State lives in `S`. Every change calls render(), which rebuilds the
// view from S with template strings. Simple and plenty fast for 11 rows.
// ============================================================

import { RACES, CONFIDENCES, confidenceLabel, sideLabel, HOUSE_TOTAL, HOUSE_MAJORITY, HOUSE_R_MIN, HOUSE_R_MAX } from './races.js';
import { NATE } from './nate.js';
import { SHAPES } from './shapes.js';
import { consensus, leaderboard, scoreNate, biggestUpset, impliedSenate } from './scoring.js';

const API = '/api/midterms';
const SESSION_KEY = 'midterms.session';
const DRAFT_KEY = 'midterms.draft';
const app = document.getElementById('app');

// ---------- tiny utils ----------

// Escape anything user-typed (player names) before putting it in HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// localStorage can throw (private mode, blocked storage) — never let it break the page.
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="#121212" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5l2.3 2.3L9.5 3.5"/></svg>';

/** 0.6/0.75/0.9 → 1/2/3 (shade level for chips). */
const level = (conf) => (conf >= 0.9 ? 3 : conf >= 0.75 ? 2 : 1);

/** Nate's cell: favorite + rounded % + shade by strength. */
function nateCell(raceId) {
  const p = NATE.pDem[raceId];
  if (p == null) return { none: true };
  const side = p >= 0.5 ? 'D' : 'R';
  const fav = Math.max(p, 1 - p);
  return { side, fav, lvl: fav < 0.65 ? 1 : fav < 0.85 ? 2 : 3, text: String(Math.round(fav * 100)) };
}

/** Short column label: first name, trimmed to fit a 36px column. */
function shortName(name) {
  const first = String(name).split(' ')[0];
  return first.length > 6 ? first.slice(0, 5) + '.' : first;
}

function countdown(ms) {
  if (ms <= 0) return 'Locked';
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return d > 0 ? `Locks in ${d}d ${h}h` : h > 0 ? `Locks in ${h}h ${m}m` : `Locks in ${m}m`;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ---------- state ----------

const S = {
  session: store.get(SESSION_KEY),   // { playerId, token } or null
  server: null,                      // last /state response
  // The picks being edited. Seeded from the server (if signed in) or a local draft.
  draft: { picks: {}, houseD: null, name: '', ...(store.get(DRAFT_KEY) || {}) },
  pin: '',
  view: location.hash === '#grid' ? 'grid' : location.hash === '#picks' ? 'picks' : null,
  error: '',
  busy: false,
  signIn: null,                      // { name, pin, error } when the sheet is open
  detail: '',                        // tapped-cell explanation under the grid
  loaded: false,
};

function saveDraft() {
  store.set(DRAFT_KEY, { picks: S.draft.picks, houseD: S.draft.houseD, name: S.draft.name });
}

// ---------- API ----------

async function api(action, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (S.session) headers.Authorization = `Bearer ${S.session.playerId}.${S.session.token}`;
  const res = await fetch(`${API}/${action}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status });
  return data;
}

async function loadState() {
  const st = await api('state');
  // A stale/invalid session comes back as me:null — forget it.
  if (S.session && !st.me) { S.session = null; store.del(SESSION_KEY); }
  S.server = st;
  // Signed-in player: their saved picks become the draft (once, or after a save).
  if (st.me && st.me.submitted && !S.draftFromServer) {
    S.draft = { picks: st.me.picks, houseD: st.me.houseD, name: st.me.name };
    S.draftFromServer = true;
  }
  if (!S.view) S.view = st.me?.submitted || st.locked ? 'grid' : 'picks';
  S.loaded = true;
}

// ---------- derived ----------

function pickedCount() {
  return RACES.filter((r) => S.draft.picks[r.id]?.side && S.draft.picks[r.id]?.confidence).length;
}
const isLocked = () => !!S.server?.locked;
const me = () => S.server?.me || null;

/** Called races → { raceId: 'R'|'D' }. */
function winners() {
  const out = {};
  for (const [id, r] of Object.entries(S.server?.results || {})) if (r.status === 'called' && r.winner) out[id] = r.winner;
  return out;
}

/** Players for the grid, the signed-in player first, then by submission. */
function gridPlayers() {
  const list = S.server?.players || [];
  const myId = me()?.id;
  return [...list.filter((p) => p.id === myId), ...list.filter((p) => p.id !== myId)];
}

// ---------- header ----------

function header({ kicker, title, small, lede, extra = '' }) {
  const m = me();
  const pill = m
    ? `<button class="pill" data-act="account" aria-label="Signed in as ${esc(m.name)}">${esc(m.name)}</button>`
    : `<button class="pill" data-act="signin">Sign in</button>`;
  return `
    <header class="top">
      <div class="top-row">
        <a class="site" href="/">duncanheidkamp.com</a>
        ${pill}
      </div>
      <div>
        <div class="kicker">${kicker}</div>
        <h1 class="${small ? 'sm' : ''}">${title}</h1>
        <p class="lede ${small ? 'sm' : ''}">${lede}</p>
      </div>
      ${extra}
    </header>`;
}

// ---------- view: picks ----------

function raceCard(race) {
  const p = S.draft.picks[race.id] || {};
  const locked = isLocked();
  const cand = (side) => {
    const name = side === 'D' ? race.d : race.r;
    const sel = p.side === side;
    return `<button type="button" class="cand ${side} ${sel ? 'sel' : ''}" data-act="side" data-race="${race.id}" data-side="${side}"
      aria-pressed="${sel}" ${locked ? 'disabled' : ''}>
      <span class="tag">${sideLabel(race, side)}</span><span class="nm">${esc(name)}</span></button>`;
  };
  const confs = CONFIDENCES.map((c) => {
    const sel = p.side && p.confidence === c.value;
    return `<button type="button" class="conf ${sel ? 'sel' : ''}" data-act="conf" data-race="${race.id}" data-conf="${c.value}"
      aria-pressed="${!!sel}" ${!p.side || locked ? 'disabled' : ''}>${c.label}</button>`;
  }).join('');
  const label = `${race.state}${p.side ? `, picked ${p.side}` : ', not picked yet'}`;
  return `
    <section class="race" id="race-${race.id}">
      <div class="race-head">
        <span class="st">${race.st}</span>
        <div class="race-title"><b>${esc(race.title)}</b><span>${esc(race.note)}</span></div>
        <svg class="shape ${p.side || ''}" width="44" height="44" viewBox="0 0 100 100" role="img" aria-label="${label}"><path d="${SHAPES[race.st]}"/></svg>
      </div>
      <div class="cands">${cand('D')}${cand('R')}</div>
      <div class="confs" role="group" aria-label="Confidence">${confs}</div>
    </section>`;
}

function tiebreaker() {
  const set = S.draft.houseD != null;
  const d = set ? S.draft.houseD : HOUSE_MAJORITY;
  const r = HOUSE_TOTAL - d;
  const hint = set ? (d >= HOUSE_MAJORITY ? 'D majority' : 'R majority') : 'Drag to set';
  return `
    <section class="tiebreak ${set ? '' : 'unset'}">
      <div>
        <div class="kicker">Tiebreaker</div>
        <p>What will the House seat split be?</p>
      </div>
      <div class="split-read">
        <span class="big D" id="hD">D ${d}</span>
        <span class="hint ${set ? 'set' : ''}" id="hHint">${hint}</span>
        <span class="big R" id="hR">R ${r}</span>
      </div>
      <div class="split-bar" aria-hidden="true"><span class="dfill" id="hBar" style="width:${(d / HOUSE_TOTAL * 100).toFixed(1)}%"></span><span class="maj"></span></div>
      <label>
        <span class="sr-only">Republican House seats</span>
        <input type="range" id="house" min="${HOUSE_R_MIN}" max="${HOUSE_R_MAX}" step="1" value="${r}" ${isLocked() ? 'disabled' : ''}
          aria-valuetext="Democrats ${d}, Republicans ${r}" />
      </label>
      <div class="range-key"><span>More D</span><span>${HOUSE_MAJORITY} for a majority</span><span>More R</span></div>
    </section>`;
}

function entryBox() {
  // Signed-in players don't need to re-enter name + PIN.
  if (me()) return '';
  return `
    <section class="entry">
      <div>
        <div class="kicker">Your entry</div>
        <p class="small" style="margin-top:6px">Your name and a 4-digit PIN let you come back on any device to edit picks before lock.</p>
      </div>
      <div class="fields">
        <label class="field">Name
          <input id="name" autocomplete="nickname" maxlength="20" value="${esc(S.draft.name)}" placeholder="Duncan" />
        </label>
        <label class="field">PIN
          <input id="pin" class="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="${esc(S.pin)}" placeholder="••••" />
        </label>
      </div>
    </section>`;
}

function renderPicks() {
  const n = pickedCount();
  const total = RACES.length;
  const locked = isLocked();
  const m = me();
  const lockMs = new Date(S.server.lockAt).getTime() - Date.now();
  const needName = !m && (!S.draft.name.trim() || !/^\d{4}$/.test(S.pin));
  const left = total - n;
  const houseSet = S.draft.houseD != null;
  const complete = left === 0 && houseSet;

  let submitLabel = m?.submitted ? 'Save changes' : 'Submit picks';
  if (left > 0) submitLabel = `Pick ${left} more race${left === 1 ? '' : 's'}`;
  else if (!houseSet) submitLabel = 'Set the House split';
  else if (needName) submitLabel = 'Add your name + PIN';
  if (S.busy) submitLabel = 'Saving…';

  const banner = locked
    ? `<div class="notice"><span><b>Picks are locked.</b> Here's what you picked.</span><a href="#grid">See the grid</a></div>`
    : m?.submitted
      ? `<div class="notice"><span><b>You're in.</b> Change anything until lock.</span><a href="#grid">See the grid</a></div>`
      : '';

  app.innerHTML = `
    ${header({
      kicker: '2026 Midterms',
      title: "Pick'em",
      lede: 'Pick a winner in each race and how sure you are. Picks lock Tuesday, Nov 3 at 5:00 PM CT.',
      extra: `
        <div class="progress">
          <div class="progress-row"><span>${n} of ${total} picked</span><span class="muted">${countdown(lockMs)}</span></div>
          <div class="bar"><span style="width:${Math.round(n / total * 100)}%"></span></div>
          <div class="conf-key"><span><b>Lean</b> 60%</span><span><b>Likely</b> 75%</span><span><b>Safe</b> 90%</span></div>
        </div>`,
    })}
    <main class="${locked ? 'locked' : ''}">
      ${banner}
      ${RACES.map(raceCard).join('')}
      ${tiebreaker()}
      ${locked ? '' : entryBox()}
      ${locked ? '' : `
      <div style="display:flex;flex-direction:column;gap:10px;padding-top:8px">
        <button class="btn" data-act="submit" ${complete && !needName && !S.busy ? '' : 'disabled'}>${submitLabel}</button>
        <p class="error" role="alert">${esc(S.error)}</p>
        <p class="small center">${m?.submitted ? 'Edits show up in the grid right away.' : "You'll see everyone's picks once you submit."}</p>
        ${m ? '' : '<p class="small center">Already played? <button class="link" data-act="signin">Sign in with your name + PIN</button></p>'}
      </div>`}
    </main>`;
}

// ---------- view: grid ----------

function renderGate() {
  const names = S.server.playerNames || [];
  const fake = Array.from({ length: 18 }, (_, i) => `<span class="chip ${['R1', 'D2', 'R3', 'D1', 'R2', 'D3'][i % 6]}"></span>`).join('');
  app.innerHTML = `
    ${header({ kicker: '2026 Midterms', title: "Everyone's picks", small: true, lede: `${names.length} player${names.length === 1 ? '' : 's'} in · picks lock Tue, Nov 3 at 5:00 PM CT` })}
    <main>
      <div class="gate">
        <div class="blur" aria-hidden="true">${fake}</div>
        <h2>Make your picks to see everyone's</h2>
        <p class="small">The grid unlocks as soon as you submit a full entry.${names.length ? ` Already in: ${names.map(esc).join(', ')}.` : ''}</p>
        <a class="btn" href="#picks" style="max-width:280px">Make your picks</a>
        ${me() ? '' : '<p class="small">Already played? <button class="link" data-act="signin">Sign in</button></p>'}
      </div>
    </main>`;
}

function leaderboardHtml(players, wins) {
  const called = Object.keys(wins).length;
  if (!called) return '';
  const rows = leaderboard(players, wins, S.server.houseDFinal);
  const nate = scoreNate(NATE.pDem, wins);
  const myId = me()?.id;
  const fmt = (x) => (x == null ? '—' : x.toFixed(1));
  const pending = RACES.filter((r) => !wins[r.id]).map((r) => `${r.st} ${r.office}`);

  const body = rows.map((r) => `
    <div class="board-row ${r.id === myId ? 'me' : ''}">
      <span class="rk">${r.rank}</span>
      <span class="nm">${esc(r.name)}${r.id === myId ? ' (you)' : ''}</span>
      <span class="num">${r.w}–${r.l}</span>
      <span class="num">${fmt(r.avg)}</span>
      <span class="pts">${r.pts}</span>
    </div>`).join('');

  const up = biggestUpset(players, wins);
  const upset = up ? `
    <div class="upset">
      <span class="k">Biggest upset</span>
      <span class="r">${esc(up.race.title)}</span>
      <span class="t">The group went ${Math.max(up.nD, up.nR)}–${Math.min(up.nD, up.nR)} for ${sideLabel(up.race, up.majority)}. ${sideLabel(up.race, up.winner)} won.
        ${up.rightNames.length ? `${up.rightNames.map(esc).join(', ')} called it.` : 'Nobody called it.'}</span>
    </div>` : '';

  return `
    <div class="board">
      <div class="board-row head"><span class="rk">#</span><span>Player</span><span class="num">W–L</span><span class="num">Avg</span><span class="pts">Pts</span></div>
      ${body}
      <div class="board-row nate">
        <span class="rk" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg></span>
        <span class="nm">Nate Silver<small>Base case · Silver Bulletin</small></span>
        <span class="num">${nate.w}–${nate.l}</span>
        <span class="num">${fmt(nate.avg)}</span>
        <span class="pts">${nate.pts}</span>
      </div>
    </div>
    <p class="small" style="margin-top:-6px">Points per race: Safe right 99, Likely right 94, Lean right 84 · Lean wrong 64, Likely wrong 44, Safe wrong 19. Nate scores on his exact odds and isn't ranked. Ties go to the closest House guess${S.server.houseDFinal != null ? ` (actual: D ${S.server.houseDFinal})` : ''}.${pending.length ? ` Pending: ${pending.join(', ')}.` : ' All races called.'}</p>
    ${upset}`;
}

function gridHtml(players, wins) {
  const anyCalled = Object.keys(wins).length > 0;
  const myId = me()?.id;

  const head = `
    <tr>
      <th class="lab" scope="col">Race</th>
      <th class="nate" scope="col">Nate<small>model</small></th>
      ${players.map((p) => `<th class="pc ${p.id === myId ? 'me' : ''}" scope="col" title="${esc(p.name)}">${p.id === myId ? 'You' : esc(shortName(p.name))}</th>`).join('')}
      <th class="grp" scope="col">Group</th>
      ${anyCalled ? '<th class="res" scope="col">Result</th>' : ''}
    </tr>`;

  const rows = RACES.map((race) => {
    const win = wins[race.id];
    const status = S.server.results[race.id]?.status;
    const { nD, nR, majority } = consensus(race.id, players);
    const split = nD + nR > 0 && nD === nR;

    const n = nateCell(race.id);
    const nateHtml = n.none
      ? '<span class="chip wide none" aria-label="No model data">—</span>'
      : `<button class="chip wide ${n.side}${n.lvl} ${win && win !== n.side ? 'missed' : ''}" data-act="cell" data-who="nate" data-race="${race.id}">${n.text}${win && win === n.side ? `<span class="hit">${CHECK}</span>` : ''}</button>`;

    const cells = players.map((p) => {
      const pick = p.picks[race.id];
      if (!pick) return `<td class="pc ${p.id === myId ? 'me' : ''}"><span class="chip none">·</span></td>`;
      const hit = win && pick.side === win;
      const dissent = !win && majority && pick.side !== majority;
      return `<td class="pc ${p.id === myId ? 'me' : ''}">
        <button class="chip ${pick.side}${level(pick.confidence)} ${win && !hit ? 'missed' : ''}" data-act="cell" data-who="${p.id}" data-race="${race.id}"
          aria-label="${esc(p.name)}: ${sideLabel(race, pick.side)} ${confidenceLabel(pick.confidence)}">${sideLabel(race, pick.side)}${dissent ? '<span class="dissent"></span>' : ''}${hit ? `<span class="hit">${CHECK}</span>` : ''}</button></td>`;
    }).join('');

    const total = nD + nR;
    const grp = total === 0 ? '—' : majority ? `${Math.max(nD, nR)}–${Math.min(nD, nR)} ${sideLabel(race, majority)}` : `${nD}–${nR} split`;
    const res = !anyCalled ? '' : `<td class="res">${win ? `<span class="won ${win}">${sideLabel(race, win)} won</span>` : `<span class="pending">${status === 'too_close' ? 'Too close' : 'Pending'}</span>`}</td>`;

    return `
      <tr class="${split ? 'split' : ''}">
        <th class="lab" scope="row"><b>${race.st}</b><span>${race.office}</span></th>
        <td class="nate">${nateHtml}</td>
        ${cells}
        <td class="grp"><span class="grp-t">${grp}</span>${total ? `<span class="mini"><span style="width:${Math.round(nD / total * 100)}%"></span></span>` : ''}</td>
        ${res}
      </tr>`;
  }).join('');

  const seats = players.map((p) => p.houseD).filter((x) => x != null);
  const avg = seats.length ? (seats.reduce((a, b) => a + b, 0) / seats.length).toFixed(1) : '—';
  const foot = `
    <tr>
      <th class="lab" scope="row"><b style="font-size:12px">House D</b><span>tiebreaker</span></th>
      <td class="nate"><span class="pending">—</span></td>
      ${players.map((p) => `<td class="pc seat ${p.id === myId ? 'me' : ''}">${p.houseD ?? '—'}</td>`).join('')}
      <td class="grp"><span class="pending">avg ${avg}</span></td>
      ${anyCalled ? `<td class="res">${S.server.houseDFinal != null ? `<b>${S.server.houseDFinal}</b>` : '<span class="pending">Pending</span>'}</td>` : ''}
    </tr>`;

  // Implied 2027 Senate: today's split with each column's Senate picks applied.
  const senChip = (s, who) => `<button class="chip sen ${s.control}" data-act="senate" data-who="${who}"
    aria-label="Implied Senate ${s.D} D, ${s.R} R">${s.D}–${s.R}</button>`;
  const nateSen = impliedSenate((id) => (NATE.pDem[id] == null ? null : NATE.pDem[id] >= 0.5 ? 'D' : 'R'));
  const playerSen = players.map((p) => impliedSenate((id) => p.picks[id]?.side));
  const avgD = playerSen.length ? playerSen.reduce((a, s) => a + s.D, 0) / playerSen.length : null;
  // Result column: only once every Senate race in the pick'em is called.
  const senRaces = RACES.filter((r) => r.held);
  const actualSen = senRaces.every((r) => wins[r.id]) ? impliedSenate((id) => wins[id]) : null;
  const senate = `
    <tr class="senate-row">
      <th class="lab" scope="row"><b style="font-size:12px">Senate</b><span>2027 D–R</span></th>
      <td class="nate">${senChip(nateSen, 'nate')}</td>
      ${players.map((p, i) => `<td class="pc ${p.id === myId ? 'me' : ''}">${senChip(playerSen[i], p.id)}</td>`).join('')}
      <td class="grp"><span class="pending">${avgD == null ? '—' : `avg ${avgD.toFixed(1)} D`}</span></td>
      ${anyCalled ? `<td class="res">${actualSen ? `<span class="won ${actualSen.control}">${actualSen.D}–${actualSen.R}</span>` : '<span class="pending">Pending</span>'}</td>` : ''}
    </tr>`;

  return `
    <div class="grid-wrap">
      <table class="grid">
        <thead>${head}</thead>
        <tbody>${rows}</tbody>
        <tfoot>${foot}${senate}</tfoot>
      </table>
    </div>
    <div class="detail" id="detail" aria-live="polite">${S.detail || 'Tap any square to see the pick.'}</div>
    <p class="small" style="margin-top:-4px">Nate = Silver Bulletin win probability for the favorite, as of ${esc(NATE.asOf)}. Group tally excludes Nate. Highlighted rows are an even split.
      Senate = the 2027 split each column's Senate picks imply, starting from today's 47 D – 53 R; seats not in the pick'em stay put, Bodnar (I) counts with D, and 50–50 is R control (VP Vance breaks ties).</p>`;
}

/** The Wordle-style block for the group chat. */
function shareText() {
  const m = me();
  const myPicks = gridPlayers().find((p) => p.id === m?.id)?.picks || S.draft.picks;
  const houseD = m?.houseD ?? S.draft.houseD;
  const cells = RACES.map((r) => `${r.st}-${r.office[0]} ${myPicks[r.id]?.side === 'D' ? '🟦' : myPicks[r.id]?.side === 'R' ? '🟥' : '⬜'}`);
  const lines = [];
  for (let i = 0; i < cells.length; i += 3) lines.push(cells.slice(i, i + 3).join('  '));
  return [
    `${m?.name || 'My'}'s 2026 picks 🗳️`,
    ...lines,
    houseD != null ? `House: D ${houseD} – R ${HOUSE_TOTAL - houseD}` : null,
    'duncanheidkamp.com/midterms',
  ].filter(Boolean).join('\n');
}

function shareHtml() {
  const m = me();
  if (!m?.submitted) return '';
  const picks = gridPlayers().find((p) => p.id === m.id)?.picks || {};
  const squares = RACES.map((r) => `<span><span class="sw" style="background:var(--${picks[r.id]?.side === 'D' ? 'd' : 'r'})"></span>${r.st}-${r.office[0]}</span>`).join('');
  return `
    <section class="share">
      <h2>Share to the group chat</h2>
      <div class="share-card">
        <b>${esc(m.name)}'s 2026 picks</b>
        <div class="share-grid">${squares}</div>
        <span>House: D ${m.houseD} – R ${HOUSE_TOTAL - m.houseD}</span>
        <span style="color:var(--muted)">duncanheidkamp.com/midterms</span>
      </div>
      <button class="btn" data-act="copy">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>
        Copy my picks
      </button>
    </section>`;
}

function renderGrid() {
  if (!S.server.canSeeGrid) return renderGate();
  const players = gridPlayers();
  const wins = winners();
  const called = Object.keys(wins).length;
  const locked = isLocked();
  const m = me();
  const live = locked && called > 0;
  const updated = new Date(S.server.serverNow).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });

  const banner = locked
    ? ''
    : m?.submitted
      ? '<div class="notice"><span><b>You\'re in.</b> You can still change picks until lock.</span><a href="#picks">Edit picks</a></div>'
      : '';

  app.innerHTML = `
    ${header({
      kicker: live ? '<span class="live-dot"></span>Live · Election night' : '2026 Midterms',
      title: live ? 'Leaderboard' : "Everyone's picks",
      small: true,
      lede: live
        ? `Updated ${updated} CT · ${called} of ${RACES.length} races called`
        : `${players.length} player${players.length === 1 ? '' : 's'} · ${locked ? 'picks are locked' : 'picks lock Tue, Nov 3 at 5:00 PM CT'}`,
    })}
    <main style="gap:16px">
      ${banner}
      ${leaderboardHtml(players, wins)}
      ${called ? '<h2>Race by race</h2>' : ''}
      <div class="legend">
        <span><span class="sw" style="background:var(--d1-bg)"></span><span class="sw" style="background:var(--r1-bg)"></span>Lean</span>
        <span><span class="sw" style="background:var(--d2-bg)"></span><span class="sw" style="background:var(--r2-bg)"></span>Likely</span>
        <span><span class="sw" style="background:var(--d3-bg)"></span><span class="sw" style="background:var(--r3-bg)"></span>Safe</span>
        ${called ? `<span><span class="check">${CHECK}</span>Called it</span><span><span class="sw" style="background:var(--r2-bg);opacity:.3"></span>Missed</span>` : '<span><span class="dot"></span>Against the group</span>'}
      </div>
      ${gridHtml(players, wins)}
      ${shareHtml()}
      ${!m && !locked ? '<a class="btn" href="#picks">Make your picks</a>' : ''}
    </main>`;
}

// ---------- sign-in sheet ----------

function renderSheet() {
  document.querySelector('.sheet-back')?.remove();
  if (!S.signIn) return;
  const el = document.createElement('div');
  el.className = 'sheet-back';
  el.innerHTML = `
    <form class="sheet" data-act="signin-form">
      <h2>Welcome back</h2>
      <p class="small">Use the name and PIN from your entry.</p>
      <div class="fields">
        <label class="field">Name <input name="name" autocomplete="nickname" maxlength="20" value="${esc(S.signIn.name)}" required /></label>
        <label class="field">PIN <input name="pin" class="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required /></label>
      </div>
      <p class="error" role="alert">${esc(S.signIn.error || '')}</p>
      <button class="btn" type="submit">Sign in</button>
      <button class="btn ghost" type="button" data-act="close-sheet">Cancel</button>
    </form>`;
  document.body.appendChild(el);
  el.querySelector('input[name=name]').focus();
}

// ---------- render ----------

function render() {
  if (!S.loaded) {
    app.innerHTML = '<p class="small" style="padding:24px 16px">Loading…</p>';
    return;
  }
  if (S.view === 'grid') renderGrid(); else renderPicks();
  renderSheet();
}

// ---------- events ----------

app.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;

  if (act === 'side' && !isLocked()) {
    const cur = S.draft.picks[t.dataset.race] || {};
    S.draft.picks[t.dataset.race] = { side: t.dataset.side, confidence: cur.confidence };
    saveDraft(); S.error = ''; render();
  }
  if (act === 'conf' && !isLocked()) {
    const cur = S.draft.picks[t.dataset.race];
    if (!cur?.side) return;
    cur.confidence = Number(t.dataset.conf);
    saveDraft(); S.error = ''; render();
  }
  if (act === 'submit') submit();
  if (act === 'signin') { S.signIn = { name: S.draft.name || '', error: '' }; renderSheet(); }
  if (act === 'account') {
    if (confirm(`Signed in as ${me().name}. Sign out on this device?`)) {
      S.session = null; store.del(SESSION_KEY); store.del(DRAFT_KEY);
      S.draft = { picks: {}, houseD: null, name: '' }; S.draftFromServer = false;
      await refresh();
    }
  }
  if (act === 'copy') copyPicks();
  if (act === 'cell') showCell(t.dataset.who, t.dataset.race, t);
  if (act === 'senate') showSenate(t.dataset.who, t);
});

// Slider: update the readout live without a full re-render (keeps the drag smooth).
app.addEventListener('input', (ev) => {
  if (ev.target.id === 'house') {
    const r = Number(ev.target.value);
    const d = HOUSE_TOTAL - r;
    S.draft.houseD = d;
    document.getElementById('hD').textContent = `D ${d}`;
    document.getElementById('hR').textContent = `R ${r}`;
    const hint = document.getElementById('hHint');
    hint.textContent = d >= HOUSE_MAJORITY ? 'D majority' : 'R majority';
    hint.classList.add('set');
    document.getElementById('hBar').style.width = `${(d / HOUSE_TOTAL * 100).toFixed(1)}%`;
    ev.target.closest('.tiebreak').classList.remove('unset');
    ev.target.setAttribute('aria-valuetext', `Democrats ${d}, Republicans ${r}`);
    saveDraft();
  }
  if (ev.target.id === 'name') { S.draft.name = ev.target.value; saveDraft(); refreshSubmit(); }
  if (ev.target.id === 'pin') { ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 4); S.pin = ev.target.value; refreshSubmit(); }
});
// Re-render after the drag ends so the submit button picks up the new state.
app.addEventListener('change', (ev) => { if (ev.target.id === 'house') render(); });

/** Typing in name/PIN: update just the button so the input keeps focus. */
function refreshSubmit() {
  const btn = app.querySelector('[data-act=submit]');
  if (!btn) return;
  const ready = pickedCount() === RACES.length && S.draft.houseD != null && S.draft.name.trim() && /^\d{4}$/.test(S.pin);
  btn.disabled = !ready;
  btn.textContent = ready ? 'Submit picks' : pickedCount() < RACES.length ? `Pick ${RACES.length - pickedCount()} more` : S.draft.houseD == null ? 'Set the House split' : 'Add your name + PIN';
}

document.addEventListener('submit', async (ev) => {
  if (ev.target.dataset.act !== 'signin-form') return;
  ev.preventDefault();
  const f = new FormData(ev.target);
  S.signIn = { name: String(f.get('name') || ''), error: '' };
  try {
    const { session } = await api('login', { method: 'POST', body: { name: f.get('name'), pin: f.get('pin') } });
    S.session = session; store.set(SESSION_KEY, session);
    S.signIn = null; S.draftFromServer = false;
    await refresh();
    S.view = me()?.submitted ? 'grid' : 'picks';
    location.hash = S.view;
    render();
    toast(`Welcome back, ${me()?.name}`);
  } catch (err) {
    S.signIn.error = err.message;
    renderSheet();
  }
});

document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-act=close-sheet]') || ev.target.classList.contains('sheet-back')) { S.signIn = null; renderSheet(); }
});

async function submit() {
  S.busy = true; S.error = ''; render();
  try {
    const body = { picks: S.draft.picks, houseD: S.draft.houseD };
    if (!me()) { body.name = S.draft.name.trim(); body.pin = S.pin; }
    const res = await api('submit', { method: 'POST', body });
    if (res.session) { S.session = res.session; store.set(SESSION_KEY, res.session); }
    S.busy = false; S.draftFromServer = false;
    const wasSubmitted = me()?.submitted;
    await refresh();
    S.view = 'grid'; location.hash = 'grid';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(wasSubmitted ? 'Changes saved' : "You're in!");
  } catch (err) {
    S.busy = false; S.error = err.message;
    if (err.status === 403) await refresh();
    render();
  }
}

function showCell(who, raceId, el) {
  const race = RACES.find((r) => r.id === raceId);
  app.querySelectorAll('.chip.picked').forEach((c) => c.classList.remove('picked'));
  el.classList.add('picked');
  if (who === 'nate') {
    const n = nateCell(raceId);
    const name = n.side === 'D' ? race.d : race.r;
    S.detail = `<b>Nate</b> · ${race.title}: ${esc(name)} (${sideLabel(race, n.side)}) at ${(n.fav * 100).toFixed(1)}%`;
  } else {
    const p = gridPlayers().find((x) => x.id === who);
    const pick = p.picks[raceId];
    const name = pick.side === 'D' ? race.d : race.r;
    S.detail = `<b>${esc(p.name)}</b> · ${race.title}: ${esc(name)} (${sideLabel(race, pick.side)}), ${confidenceLabel(pick.confidence)}`;
  }
  document.getElementById('detail').innerHTML = S.detail;
}

/** Tap on a Senate-row cell: the split, who controls, and which seats flip. */
function showSenate(who, el) {
  app.querySelectorAll('.chip.picked').forEach((c) => c.classList.remove('picked'));
  el.classList.add('picked');
  let name, s;
  if (who === 'nate') {
    name = 'Nate';
    s = impliedSenate((id) => (NATE.pDem[id] == null ? null : NATE.pDem[id] >= 0.5 ? 'D' : 'R'));
  } else {
    const p = gridPlayers().find((x) => x.id === who);
    name = esc(p.name);
    s = impliedSenate((id) => p.picks[id]?.side);
  }
  const flips = s.flips.length
    ? 'Flips: ' + s.flips.map((f) => `${f.race.st} → ${sideLabel(f.race, f.to)}`).join(', ')
    : 'No seats flip';
  S.detail = `<b>${name}</b> · 2027 Senate ${s.D} D – ${s.R} R, <b>${s.control === 'D' ? 'Democratic' : 'Republican'} control</b>. ${flips}.`;
  document.getElementById('detail').innerHTML = S.detail;
}

async function copyPicks() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for older iOS / non-secure contexts.
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  toast('Copied. Paste it in the group chat');
}

window.addEventListener('hashchange', () => {
  S.view = location.hash === '#grid' ? 'grid' : 'picks';
  S.detail = '';
  render();
  window.scrollTo(0, 0);
});

// ---------- boot + auto-refresh ----------

async function refresh() {
  try { await loadState(); S.error = S.error || ''; }
  catch (err) { if (!S.loaded) { app.innerHTML = `<p class="error" style="padding:24px 16px">Couldn't load the game. ${esc(err.message)}</p>`; return; } }
  render();
}

render();
refresh();

// Election night: refresh the grid about every 60s once picks are locked
// (skip while the tab is hidden or someone is mid-sign-in).
setInterval(() => {
  if (document.hidden || S.signIn || S.view !== 'grid' || !isLocked()) return;
  const keep = S.detail;
  refresh().then(() => { if (keep) { S.detail = keep; const d = document.getElementById('detail'); if (d) d.innerHTML = keep; } });
}, 60_000);

// Keep the lock countdown fresh on the picks view (once a minute is enough).
setInterval(() => {
  if (S.view !== 'picks' || !S.server) return;
  const el = app.querySelector('.progress-row .muted');
  if (el) el.textContent = countdown(new Date(S.server.lockAt).getTime() - Date.now());
  // Crossed the lock while the page was open → reload state so it goes read-only.
  if (!isLocked() && Date.now() >= new Date(S.server.lockAt).getTime()) refresh();
}, 60_000);

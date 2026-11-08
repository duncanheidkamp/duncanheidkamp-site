// ============================================================
// app.js — Thanksgiving Bingo UI. Screens: home · pick · play · view.
// Progress lives in localStorage; the server only sees a board when
// the player taps "Share my board".
// ============================================================

import { TOPICS, FREE, FREE_LABEL, MAX_TOPIC_LENGTH } from './topics.js';
import {
  CELLS, CENTER, deal, layout, shuffle, freshMarks, completedLines, cellsInLines,
  shareText, shareGrid, bingoSummary, cleanTopic, topicKey, validTopic,
} from './bingo.js';

const app = document.getElementById('app');
const KEY = 'tgbingo.board.v1';
const PICK_KEY = 'tgbingo.pick.v1';
const BASE = '/thanksgiving-bingo';

// ---------- storage (never throws) ----------

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---------- api ----------

async function api(path, body) {
  const res = await fetch(`/api/bingo/${path}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

let playerTopicsPromise;
function playerTopics() {
  playerTopicsPromise ||= api('topics').then((d) => d.topics).catch(() => []);
  return playerTopicsPromise;
}

/** Save a typed square to the shared pool; fall back to local-only if offline. */
async function submitTopic(raw) {
  const text = cleanTopic(raw);
  if (!validTopic(text)) throw new Error(`Squares need 2–${MAX_TOPIC_LENGTH} characters.`);
  try {
    const d = await api('topics', { text });
    playerTopicsPromise = null;
    return d.text;
  } catch (e) {
    if (/characters|available/.test(e.message)) throw e;
    return text; // couldn't reach the server: still let them play it
  }
}

// ---------- tiny helpers ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const curatedKeys = new Set(TOPICS.map(topicKey));
const isCustom = (t) => t !== FREE && !curatedKeys.has(topicKey(t));

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function miniGrid(marked, cls = '') {
  const hot = cellsInLines(marked);
  return `<div class="mini ${cls}" aria-hidden="true">${marked.map((m, i) =>
    `<i class="${hot.has(i) ? 'h' : m ? 'm' : ''}"></i>`).join('')}</div>`;
}

function cellLabel(t) {
  return t === FREE ? `<span><b class="turkey">🦃</b>${FREE_LABEL}</span>` : `<span>${esc(t)}</span>`;
}

/** Shrink a square's text until it fits. */
function fitCells(root = app) {
  root.querySelectorAll('.cell span').forEach((span) => {
    const cell = span.parentElement;
    span.style.fontSize = '';
    let size = parseFloat(getComputedStyle(span).fontSize);
    while (size > 8.5 && (span.scrollHeight > cell.clientHeight - 6 || span.scrollWidth > cell.clientWidth - 4)) {
      size -= 0.5;
      span.style.fontSize = `${size}px`;
    }
  });
}
let fitRaf;
addEventListener('resize', () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => fitCells()); });

// ---------- wake lock ----------

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && screen === 'play') keepAwake(true);
});

// ---------- state ----------

let screen = 'home';
let board = store.get(KEY); // { mode, squares, marked, history, sharedId, sharedAt }
if (board && (!Array.isArray(board.squares) || board.squares.length !== CELLS)) board = null;

function saveBoard() { store.set(KEY, board); }

function newBoard(mode, squares) {
  board = { mode, squares, marked: freshMarks(), history: [], sharedId: null };
  saveBoard();
}

function go(next, opts = {}) {
  screen = next;
  keepAwake(next === 'play');
  if (!opts.keepUrl && location.search) history.replaceState(null, '', BASE);
  window.scrollTo(0, 0);
  render();
}

function render() {
  ({ home: renderHome, pick: renderPick, play: renderPlay, view: renderView })[screen]();
}

// ============================================================
// HOME
// ============================================================

function renderHome() {
  const marks = board ? board.marked.filter(Boolean).length - 1 : 0;
  app.innerHTML = `
    <section class="home">
      <p class="kicker"><a href="/">duncanheidkamp.com</a></p>
      <h1>Thanksgiving<em>Bingo</em></h1>
      <p class="lede">Political bingo for the dinner table. Mark a square every time someone brings it up. First line wins the wishbone.</p>

      ${board ? `
        <div class="resume">
          ${miniGrid(board.marked)}
          <div class="resume-text">
            <strong>Your board</strong>
            <span>${marks} marked · ${esc(bingoSummary(board.marked).replace(/^\d+\/24, /, ''))}</span>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-act="resume">Back to my board</button>
          <button class="btn btn-secondary" data-act="deal">Deal me a new board</button>
          <button class="btn btn-secondary" data-act="pick">Pick my own squares</button>
        </div>` : `
        <div class="btn-row">
          <button class="btn btn-primary" data-act="deal">Deal me a board</button>
          <button class="btn btn-secondary" data-act="pick">Pick my own squares</button>
        </div>`}

      <div class="how">
        <p>Get a random card, or pick 24 squares yourself. The centre is free.</p>
        <p>Tap a square when it comes up at dinner. Five in a row, column or diagonal is bingo.</p>
        <p>Share your card with the group chat. Friends get a link to see exactly what came up.</p>
      </div>
      <p class="foot">Missing a classic? Add your own square, and everyone else can pick it too.</p>
    </section>`;

  app.querySelector('[data-act="deal"]').onclick = () => {
    if (board && !confirmReplace()) return;
    newBoard('random', deal(TOPICS));
    go('play');
  };
  app.querySelector('[data-act="pick"]').onclick = () => {
    if (board && !confirmReplace()) return;
    go('pick');
  };
  app.querySelector('[data-act="resume"]')?.addEventListener('click', () => go('play'));
}

function confirmReplace() {
  const marks = board.marked.filter(Boolean).length - 1;
  return marks === 0 || board.sharedId || confirm('Start a new board? Your current one will be cleared.');
}

// ============================================================
// PICK YOUR OWN
// ============================================================

let pick = null; // { selected: [text], added: [text] }

function renderPick() {
  pick ||= store.get(PICK_KEY) || { selected: [], added: [] };
  const need = CELLS - 1;
  const n = pick.selected.length;
  const sel = new Set(pick.selected.map(topicKey));

  const chip = (t, extra = '') => {
    const on = sel.has(topicKey(t));
    return `<button class="chip" data-t="${esc(t)}" aria-pressed="${on}" ${!on && n >= need ? 'disabled' : ''}>${esc(t)}${extra}</button>`;
  };

  app.innerHTML = `
    <div class="pickbar">
      <div class="bar">
        <button class="back" data-act="back" aria-label="Back">←</button>
        <div class="title">Pick your squares</div>
        <span class="spacer"></span>
      </div>
      <div class="status" style="margin:0"><span class="count">${n} / ${need}</span> picked${n < need ? '' : ' · ready'}</div>
      <div class="progress"><i style="width:${(n / need) * 100}%"></i></div>
    </div>

    <h2>Add your own</h2>
    <form class="addrow" data-act="add">
      <input name="t" maxlength="${MAX_TOPIC_LENGTH}" placeholder="e.g. Uncle Rick's crypto losses" autocomplete="off" enterkeyhint="done" />
      <button class="btn btn-primary" type="submit">Add</button>
    </form>
    <p class="hint">It's added to your card and becomes a square anyone can pick.</p>
    ${pick.added.length ? `<div class="chips" style="margin-top:12px">${pick.added.map((t) => chip(t)).join('')}</div>` : ''}

    <h2>The classics</h2>
    <div class="chips">${TOPICS.map((t) => chip(t)).join('')}</div>

    <h2>Added by players</h2>
    <div class="chips" id="player-chips"><span class="muted">Loading…</span></div>

    <div class="pickfoot">
      <div class="btn-row" style="margin:0;grid-template-columns:auto 1fr">
        <button class="btn btn-secondary" data-act="fill" style="width:auto" ${n >= need ? 'disabled' : ''}>Fill the rest</button>
        <button class="btn btn-red" data-act="start" ${n === need ? '' : 'disabled'}>${n === need ? 'Start playing' : `Pick ${need - n} more`}</button>
      </div>
    </div>`;

  const savePick = () => store.set(PICK_KEY, pick);

  app.addEventListener('click', onChip);
  function onChip(e) {
    const b = e.target.closest('.chip');
    if (!b || screen !== 'pick') return;
    const t = b.dataset.t;
    const k = topicKey(t);
    if (sel.has(k)) pick.selected = pick.selected.filter((x) => topicKey(x) !== k);
    else if (pick.selected.length < need) pick.selected.push(t);
    savePick();
    const y = scrollY;
    app.removeEventListener('click', onChip);
    renderPick();
    scrollTo(0, y);
  }

  playerTopics().then((list) => {
    const el = document.getElementById('player-chips');
    if (!el || screen !== 'pick') return;
    const fresh = list.filter((t) => !pick.added.some((a) => topicKey(a) === topicKey(t)));
    el.innerHTML = fresh.length ? fresh.map((t) => chip(t)).join('')
      : '<span class="muted">Nothing yet. Add the first one above.</span>';
  });

  app.querySelector('[data-act="back"]').onclick = () => { app.removeEventListener('click', onChip); go('home'); };

  app.querySelector('[data-act="add"]').onsubmit = async (e) => {
    e.preventDefault();
    const input = e.target.t;
    try {
      const text = await submitTopic(input.value);
      const k = topicKey(text);
      if (!pick.added.some((a) => topicKey(a) === k) && !curatedKeys.has(k)) pick.added.unshift(text);
      if (!pick.selected.some((s) => topicKey(s) === k)) {
        if (pick.selected.length >= need) { toast('Card full. Unpick one first.'); }
        else pick.selected.push(text);
      }
      savePick();
      app.removeEventListener('click', onChip);
      renderPick();
      toast('Added');
    } catch (err) { toast(err.message); }
  };

  app.querySelector('[data-act="fill"]').onclick = async () => {
    const pool = shuffle(TOPICS).filter((t) => !sel.has(topicKey(t)));
    pick.selected = pick.selected.concat(pool.slice(0, need - pick.selected.length));
    savePick();
    app.removeEventListener('click', onChip);
    renderPick();
  };

  app.querySelector('[data-act="start"]').onclick = () => {
    if (pick.selected.length !== need) return;
    newBoard('custom', layout(shuffle(pick.selected)));
    pick = null;
    store.del(PICK_KEY);
    app.removeEventListener('click', onChip);
    go('play');
  };
}

// ============================================================
// PLAY
// ============================================================

function gridHtml(b, interactive) {
  const hot = cellsInLines(b.marked);
  const tag = interactive ? 'button' : 'div';
  return `
    <div class="card ${interactive ? '' : 'readonly'}">
      <div class="letters" aria-hidden="true">${'BINGO'.split('').map((l) => `<span>${l}</span>`).join('')}</div>
      <div class="grid" role="grid">
        ${b.squares.map((t, i) => {
          const cls = ['cell', t === FREE && 'free', b.marked[i] && 'on', hot.has(i) && 'hot', isCustom(t) && 'custom'].filter(Boolean).join(' ');
          const label = t === FREE ? FREE_LABEL : t;
          return `<${tag} class="${cls}" data-i="${i}" ${interactive ? `aria-pressed="${!!b.marked[i]}" ${t === FREE ? 'disabled' : ''}` : ''} aria-label="${esc(label)}${b.marked[i] ? ', marked' : ''}">${cellLabel(t)}</${tag}>`;
        }).join('')}
      </div>
    </div>`;
}

function statusLine(marked) {
  const lines = completedLines(marked).length;
  const n = marked.filter(Boolean).length - 1;
  if (marked.every(Boolean)) return { text: 'BLACKOUT 🦃', win: true };
  if (lines) return { text: lines === 1 ? 'BINGO!' : `${lines}× BINGO!`, win: true };
  if (n === 0) return { text: 'Tap a square when it comes up', win: false };
  return { text: `${n} marked · no bingo yet`, win: false };
}

function renderPlay() {
  if (!board) return go('home');
  const st = statusLine(board.marked);
  const tapped = board.history.length > 0 || board.marked.some((m, i) => m && i !== CENTER);

  app.innerHTML = `
    <div class="bar">
      <button class="back" data-act="home" aria-label="Home">←</button>
      <div class="title">Thanksgiving Bingo</div>
      <span class="spacer"></span>
    </div>
    <div class="status ${st.win ? 'win' : ''}" id="status">${esc(st.text)}</div>
    ${gridHtml(board, true)}
    <div class="tools">
      <button class="chipbtn" data-act="undo" ${board.history.length ? '' : 'disabled style="opacity:.4"'}>↶ Undo</button>
      ${!tapped && board.mode === 'random' ? '<button class="chipbtn" data-act="reshuffle">⟳ Reshuffle</button>' : ''}
      <button class="chipbtn" data-act="addsq">＋ Add a square</button>
    </div>
    <div class="legend">
      <span><i style="background:var(--navy)"></i>Came up</span>
      <span><i style="background:var(--cranberry)"></i>Bingo line</span>
      <span><i style="background:var(--gold);border-radius:50%"></i>Player-added</span>
    </div>
    <div class="btn-row">
      <button class="btn btn-red" data-act="share">${board.sharedId ? 'Share again' : 'Share my board'}</button>
    </div>`;

  fitCells();

  app.querySelector('.grid').onclick = (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || cell.classList.contains('free')) return;
    toggle(Number(cell.dataset.i));
  };
  app.querySelector('[data-act="home"]').onclick = () => go('home');
  app.querySelector('[data-act="undo"]').onclick = undo;
  app.querySelector('[data-act="reshuffle"]')?.addEventListener('click', () => {
    newBoard('random', deal(TOPICS));
    renderPlay();
  });
  app.querySelector('[data-act="addsq"]').onclick = openAddSheet;
  app.querySelector('[data-act="share"]').onclick = openShareSheet;
}

function toggle(i) {
  const before = completedLines(board.marked).length;
  board.marked[i] = !board.marked[i];
  board.history.push(i);
  if (board.history.length > 50) board.history.shift();
  saveBoard();
  const after = completedLines(board.marked).length;
  renderPlay();
  app.querySelector(`.cell[data-i="${i}"]`)?.classList.add('pop');
  if (after > before) celebrate(after);
  else navigator.vibrate?.(8);
}

function undo() {
  const i = board.history.pop();
  if (i === undefined) return;
  board.marked[i] = !board.marked[i];
  saveBoard();
  renderPlay();
}

function celebrate(lines) {
  navigator.vibrate?.([30, 40, 60]);
  toast(board.marked.every(Boolean) ? 'Blackout. Pass the pie.' : lines === 1 ? 'BINGO! 🦃' : `${lines} lines! 🦃`);
  confetti();
}

// ---------- add a square mid-game ----------

function openAddSheet() {
  const scrim = sheet(`
    <h3>Add a square</h3>
    <p>It replaces a random square you haven't marked, and other players can pick it too.</p>
    <form data-act="add">
      <label for="addt">New square</label>
      <div class="addrow">
        <input id="addt" name="t" maxlength="${MAX_TOPIC_LENGTH}" placeholder="e.g. Grandpa's Fox News segment" autocomplete="off" enterkeyhint="done" />
        <button class="btn btn-primary" type="submit">Add</button>
      </div>
      <p class="err"></p>
    </form>`);
  const form = scrim.querySelector('form');
  setTimeout(() => form.t.focus(), 50);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = form.querySelector('.err');
    try {
      const text = await submitTopic(form.t.value);
      const k = topicKey(text);
      if (board.squares.some((s) => topicKey(s) === k)) throw new Error('That one\'s already on your card.');
      const open = board.squares.map((s, i) => i).filter((i) => i !== CENTER && !board.marked[i] && !isCustom(board.squares[i]));
      const fallback = board.squares.map((s, i) => i).filter((i) => i !== CENTER && !board.marked[i]);
      const choices = open.length ? open : fallback;
      if (!choices.length) throw new Error('Every square is marked already.');
      const i = choices[Math.floor(Math.random() * choices.length)];
      board.squares[i] = text;
      board.history = board.history.filter((h) => h !== i);
      saveBoard();
      scrim.remove();
      renderPlay();
      app.querySelector(`.cell[data-i="${i}"]`)?.classList.add('pop');
      toast('Square added');
    } catch (ex) { err.textContent = ex.message; }
  };
}

// ---------- share ----------

function boardUrl(id) { return `${location.origin}${BASE}?b=${id}`; }

function openShareSheet() {
  const lines = completedLines(board.marked).length;
  const lastName = store.get('tgbingo.name') || '';
  const scrim = sheet(`
    <h3>${lines ? 'Share your bingo' : 'Share your board'}</h3>
    <p>Saves this card so friends can open it from the link. Saved cards can't be edited.</p>
    <div class="preview">
      ${miniGrid(board.marked, 'lg')}
      <pre>Thanksgiving Bingo 🦃\n${esc(bingoSummary(board.marked))}</pre>
    </div>
    <form>
      <label for="nm">Your name (optional)</label>
      <div class="addrow"><input id="nm" name="nm" maxlength="30" value="${esc(lastName)}" placeholder="Shown on the shared card" autocomplete="given-name" /></div>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn-red" type="submit">Save &amp; share</button>
      </div>
      <p class="err"></p>
    </form>`);
  const form = scrim.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const err = form.querySelector('.err');
    btn.disabled = true; btn.textContent = 'Saving…'; err.textContent = '';
    const name = cleanTopic(form.nm.value).slice(0, 30);
    store.set('tgbingo.name', name);
    try {
      const { id } = await api('boards', { squares: board.squares, marked: board.marked, mode: board.mode, name });
      board.sharedId = id;
      saveBoard();
      const text = shareText(board.marked, boardUrl(id));
      scrim.remove();
      await shareOut(text, id);
      renderPlay();
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false; btn.textContent = 'Save & share';
    }
  };
}

async function shareOut(text, id) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return showCopy(text, id); }
  }
  showCopy(text, id);
}

function showCopy(text, id) {
  const scrim = sheet(`
    <h3>Saved</h3>
    <p>Copy this into the group chat.</p>
    <div class="preview"><pre>${esc(text)}</pre></div>
    <div class="btn-row">
      <button class="btn btn-red" data-act="copy">Copy</button>
      <a class="btn btn-secondary" href="${BASE}?b=${id}">Open the saved card</a>
    </div>`);
  scrim.querySelector('[data-act="copy"]').onclick = async (e) => {
    try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied'; }
    catch { toast('Couldn\'t copy. Long-press the text instead.'); }
  };
}

function sheet(inner) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${inner}</div>`;
  scrim.onclick = (e) => { if (e.target === scrim) scrim.remove(); };
  document.body.appendChild(scrim);
  return scrim;
}

// ============================================================
// VIEW A SHARED BOARD
// ============================================================

let viewed = null;

async function loadView(id) {
  screen = 'view';
  app.innerHTML = '<p class="loading">Loading the card…</p>';
  try {
    viewed = await api(`board?id=${encodeURIComponent(id)}`);
    document.title = viewed.name ? `${viewed.name}'s Thanksgiving Bingo` : 'Thanksgiving Bingo';
  } catch (e) {
    viewed = { error: e.message };
  }
  render();
}

function renderView() {
  if (!viewed || viewed.error) {
    app.innerHTML = `
      <div class="bar"><span class="spacer"></span><div class="title">Thanksgiving Bingo</div><span class="spacer"></span></div>
      <p class="loading">${esc(viewed?.error || 'Card not found.')}</p>
      <div class="btn-row"><button class="btn btn-primary" data-act="mine">Make your own board</button></div>`;
    app.querySelector('[data-act="mine"]').onclick = () => go('home');
    return;
  }
  const st = statusLine(viewed.marked);
  const when = new Date(viewed.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const mine = board?.sharedId === viewed.id;
  app.innerHTML = `
    <div class="bar"><span class="spacer"></span><div class="title">Thanksgiving Bingo</div><span class="spacer"></span></div>
    <div class="byline">
      <strong>${viewed.name ? `${esc(viewed.name)}'s card` : 'A shared card'}</strong>
      <span>${esc(st.win ? st.text.replace(/!$/, '') : `${viewed.marked.filter(Boolean).length - 1} marked, no bingo`)} · ${esc(when)}</span>
    </div>
    ${gridHtml(viewed, false)}
    <div class="legend">
      <span><i style="background:var(--navy)"></i>Came up</span>
      <span><i style="background:var(--cranberry)"></i>Bingo line</span>
    </div>
    <div class="btn-row">
      <button class="btn btn-red" data-act="mine">${mine ? 'Back to my board' : 'Make your own board'}</button>
      <button class="btn btn-secondary" data-act="copy">Copy share text</button>
    </div>`;
  fitCells();
  app.querySelector('[data-act="mine"]').onclick = () => go(mine ? 'play' : 'home');
  app.querySelector('[data-act="copy"]').onclick = async (e) => {
    try { await navigator.clipboard.writeText(shareText(viewed.marked, boardUrl(viewed.id))); e.target.textContent = 'Copied'; }
    catch { toast('Couldn\'t copy.'); }
  };
}

// ============================================================
// confetti (leaves + cranberries, ~1.6s)
// ============================================================

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.getElementById('confetti');
  const ctx = cv.getContext('2d');
  const dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#b4232a', '#c8902e', '#1f3b5c', '#8a4b1f', '#d9a441'];
  const bits = Array.from({ length: 90 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 80,
    y: innerHeight * .35,
    vx: (Math.random() - .5) * 11,
    vy: -Math.random() * 11 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - .5) * .3,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 5,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  (function frame(t) {
    const age = t - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += .35; b.vx *= .99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 1800);
      ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (age < 1800) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(start);
}

// ============================================================
// boot
// ============================================================

const sharedId = new URLSearchParams(location.search).get('b');
if (sharedId) loadView(sharedId);
else render();
playerTopics(); // warm the cache

export { shareGrid }; // for console debugging

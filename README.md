# duncanheidkamp.com

Static homepage replacing the previous WordPress site, plus small apps that live under it (like `/midterms`).

## Stack

- Plain HTML + CSS + JS, no build step, no framework
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) via Google Fonts (homepage)
- Deployed on Vercel (project `duncanheidkamp-site`, domain www.duncanheidkamp.com)
- Vercel serverless functions in `api/` for anything that needs a backend

## Files

| File | Purpose |
|---|---|
| `index.html` | Homepage markup |
| `style.css` | Homepage styles, mobile-first |
| `vercel.json` | Enables clean URLs (`/midterms/admin` → `midterms/admin.html`) |
| `package.json` | `"type": "module"` for the API, plus `dev` / `test` scripts. No dependencies. |
| `midterms/` | 2026 Midterms Pick'em (see below) |
| `api/midterms/[action].js` | The pick'em backend (one function, several actions) |
| `lib/midterms/` | Server-only helpers: Supabase store, PIN/session auth |
| `scripts/dev-server.js` | Local server for static files + the API, with an in-memory database |

## Deployment

Push to `main` and Vercel auto-deploys. To deploy by hand:
```bash
vercel --prod
```

## Local development

```bash
npm run dev        # http://localhost:4210 (static site + API, in-memory DB)
npm test           # pick'em scoring unit tests (node's built-in runner)
```
The homepage alone still works by opening `index.html` directly.

---

## 2026 Midterms Pick'em (`/midterms`)

Friends pick a winner and a confidence (Lean 60% / Likely 75% / Safe 90%) in 12 races (11 two-party races plus Montana, an independent vs. a Republican), plus a House-seat tiebreaker. Submitting unlocks a grid of everyone's picks. Picks lock **Tue Nov 3, 2026 at 5:00 PM CT**, and the server enforces it.

| Path | What it is |
|---|---|
| `/midterms` | Make picks (`#picks`) and everyone's picks + leaderboard (`#grid`) |
| `/midterms/admin` | Mark races called on election night (passcode) |
| `midterms/js/races.js` | **The races.** Names, notes, order, lock time. Shared by browser + API. |
| `midterms/js/nate.js` | **Nate Silver's numbers** (Dem win prob per race). Edit + push to update. |
| `midterms/js/scoring.js` | Brier points, consensus, leaderboard, biggest upset (unit-tested) |
| `midterms/schema.sql` | Supabase tables, to paste into the SQL editor once |
| `midterms/og.png` | 1200×630 link-preview image for iMessage |

### One-time setup

1. **Supabase:** open your Supabase project, go to **SQL Editor**, paste `midterms/schema.sql`, and run it. The tables are prefixed `midterms_`, so any existing project works. RLS is on with no policies, so only the server (service-role key) can read them.
2. **Vercel env vars:** in project `duncanheidkamp-site`, go to Settings → Environment Variables (Production):

   | Name | Value |
   |---|---|
   | `MIDTERMS_SUPABASE_URL` | `https://<project>.supabase.co` |
   | `MIDTERMS_SUPABASE_SERVICE_KEY` | the **service_role** key (Supabase → Settings → API). Never commit it. |
   | `MIDTERMS_ADMIN_PASSCODE` | any passphrase, used for `/midterms/admin` |
   | `MIDTERMS_LOCK_AT` *(optional)* | override the lock time, e.g. `2026-11-03T17:00:00-06:00` |

3. Redeploy (push, or Vercel → Deployments → Redeploy) so the functions pick up the env vars.

### How it works

- **Players:** name + 4-digit PIN. The PIN is scrypt-hashed. Signing in issues a random session token. The browser keeps `{playerId, token}` in localStorage, and the DB stores only the token's SHA-256 (up to 5 devices per player).
- **The gate:** `GET /api/midterms/state` returns other players' picks only to a request whose session belongs to a submitted player, or to anyone once picks lock.
- **The lock:** `POST /api/midterms/submit` checks the server clock against the lock time and returns 403 after it.
- **Scoring:** points = round(100 × (1 − (p − 1)²)), where p is the probability given to the winner. Safe right 99, Likely right 94, Lean right 84, Lean wrong 64, Likely wrong 44, Safe wrong 19. Ties break on the closest House guess. Nate is scored on his exact odds as an unranked benchmark.
- **Election night:** the grid auto-refreshes every 60 s after lock.

### Election-week checklist

1. Send the link to the group chat and make your own picks first.
2. **Tuesday afternoon:** update `midterms/js/nate.js` from Silver Bulletin (and `asOf`), then commit and push.
3. **Election night:** open `/midterms/admin`, mark races as they're called, and enter the final House D seats when known. Maine and Alaska can stay "Pending" for days.

### Known limits (by design)

- A 4-digit PIN is "keep friends honest" security, not real security, and there's no rate limit on guesses.
- Pool size is capped at 15 players.

# Handoff: 2026 Midterms Pick'em — duncanheidkamp.com/midterms

## TL;DR
Build a mobile-first pick'em page on Duncan's existing site where a small group of friends (≤10) pick winners in 11 races with a confidence level. **Once a player submits their entry, they unlock a grid of everyone's picks** (one column per player) to compare how each race was called. Picks lock **Tuesday Nov 3, 2026 at 5:00 PM CT**. Must ship by **Sunday Nov 1** so friends have time to enter picks.

You (Claude Code) have access to the site repo and its GitHub/Vercel setup. Inspect the repo first and match its existing framework, routing, styling and deploy conventions.

## Hard deadline & scope discipline
- Ship order: **(1) picks entry → (2) comparison grid → (3) share → (4) results + leaderboard.** (1)–(3) must be live by Sunday night; (4) only has to be ready by Tuesday evening.
- **One external benchmark only: Nate Silver (Silver Bulletin).** Hand-entered from screenshots into a static file — no APIs, no prediction markets, no other models. Players do their own research.
- **No margins.** Winner + confidence only.
- **No iMessage/BlueBubbles integration.** Sharing is via the link and copy-paste.
- No user accounts. No email. No over-engineering.

## Stack
- Match the existing site. Duncan's default preference: **TypeScript, React, Tailwind, Supabase**, deployed on **Vercel**.
- Route: `/midterms` (add a nav link / tab if the site has a nav).
- Supabase for persistence. Put keys in Vercel env vars; never commit them.

## Design reference
A mockup canvas ("Midterms Pick'em") exists with three phone screens: Make your picks, Everyone's picks, Election night. Match its layout, colors and type: Libre Franklin for UI, Zilla Slab for headings, white ground, ink #121212, R #B13A33, D #2C5A98 with lighter tints for Lean/Likely.

## Design direction
- **Mobile-first** (friends open it from an iMessage link on iPhone).
- **NYT Games polish**: clean, confident typography, generous whitespace, satisfying tap targets, subtle motion. **No purple gradients, no generic AI-template look.**
- Party colors: muted red/blue (not neon), always paired with a letter label (R/D) so color isn't the only signal.
- Support light and dark mode.

## The races (seed data)
Verify nominee names against Ballotpedia before seeding — these were gathered Oct 30, 2026 and should be double-checked. Default: just the two major candidates.

| id | Race | Republican | Democrat | Notes |
|---|---|---|---|---|
| tx-sen | Texas Senate | Ken Paxton | James Talarico | |
| tx-gov | Texas Governor | Greg Abbott (inc.) | Gina Hinojosa | |
| ak-sen | Alaska Senate | Dan Sullivan (inc.) | Mary Peltola | Slow count |
| mi-sen | Michigan Senate | Mike Rogers | Abdul El-Sayed | Open seat |
| me-sen | Maine Senate | Susan Collins (inc.) | Troy Jackson | Ranked-choice, may take days |
| oh-sen | Ohio Senate (special) | Jon Husted (inc.) | Sherrod Brown | |
| oh-gov | Ohio Governor | Vivek Ramaswamy | Amy Acton | Open seat |
| ks-sen | Kansas Senate | Roger Marshall (inc.) | Adam Hamilton | |
| ia-sen | Iowa Senate | Ashley Hinson | Josh Turek | Open seat |
| ia-gov | Iowa Governor | Zach Lahn | Rob Sand | Open seat |
| ga-gov | Georgia Governor | Rick Jackson | Keisha Lance Bottoms | Open seat |

Store races in a typed config file (`races.ts`) rather than the DB, so they are easy to edit. **Display order everywhere is alphabetical by state, Senate before Governor within a state:** AK Sen, GA Gov, IA Sen, IA Gov, KS Sen, ME Sen, MI Sen, OH Sen, OH Gov, TX Sen, TX Gov.

## Features

### 1. Make your picks
- Enter a display name and a **4-digit PIN**. The name + PIN pair lets a player come back later (on any device) to view the grid or edit their picks before lock. Hash the PIN; it isn't real security, it just keeps friends from editing each other's picks.
- One card per race. The card header shows a **state outline icon** on the right: gray outline before a pick, filled with the picked party's color (red/blue) once a candidate is tapped. Use a simple per-state SVG path (a public-domain US states SVG set is fine).
- Tap the R or D candidate, then pick confidence: **Lean / Likely / Safe** (stored as 0.60 / 0.75 / 0.90).
- **Tiebreaker: House seat split.** "What will the House seat split be?" A slider (range 180–255 Republican seats; left = more D, right = more R) with a live readout "D 222 · R 213", a split bar with a marker at the 218 majority line, and "D majority"/"R majority" text. Stored as Democratic seats (D + R = 435). Untouched until the player drags it ("Drag to set"); Submit requires it.
- A progress indicator (e.g., "8 of 11 picked"). The Submit button is enabled only when all 11 races plus the tiebreaker are filled in.
- After submitting, the player stays "signed in" on that device (store the player id plus a session token in localStorage, wrapped in try/catch) and lands on the grid.
- Players can still edit their picks until lock (it's a friendly game, so copying isn't a concern). Show an "edited after seeing the grid" marker? **No.** Keep it simple.
- **Lock:** after `2026-11-03T17:00:00-06:00`, entry is read-only. Enforce the lock **server-side** (an API route that checks the current time), not just in the UI.
- Cap at ~15 players to be safe; expected ≤10.

### 2. Comparison grid (the core feature)
- **Gated:** the grid is visible only to players who have submitted a complete entry. Anyone else who opens it sees a "Make your picks to see everyone's" prompt. Enforce this server-side: the API returns other players' picks only to a request carrying a valid session for a submitted player. After lock, anyone with the link can view the grid.
- **Layout:** rows are the 11 races, columns are players. The current player's column comes first and is highlighted, then the others in order of submission. Race labels are sticky on the left, and the grid scrolls horizontally on phones. With ≤10 players, use compact columns that show initials or short names in the header.
- **Cells:** a colored chip showing R or D, with fill strength by confidence (Lean = light tint, Likely = medium, Safe = solid). Tapping a cell shows the candidate name and the confidence word.
- **Consensus column** at the right end (or a summary row per race): e.g., "4–2 D" with a small split bar. Highlight races where the group is split evenly, which are the most fun to argue about.
- **Disagreement highlight:** subtly mark cells where a player went against the group majority.
- **Tiebreaker row** at the bottom: each player's House Democratic seat guess.
- After results are in (see 4), cells show ✓ / ✗ and the race row shows the winner.

### 3. Share
- **Open Graph tags** for `/midterms` (title, description, 1200×630 image) so the link unfurls nicely in iMessage. A static OG image is fine.
- A **"Copy my picks"** button that produces a Wordle-style text block to paste into the group chat, e.g.:
  ```
  Duncan's 2026 picks 🗳️
  TX-S 🟥  TX-G 🟥  AK-S 🟦
  MI-S 🟦  ME-S 🟦  OH-S 🟦
  OH-G 🟥  KS-S 🟥  IA-S 🟥
  IA-G 🟦  GA-G 🟥
  House: D 222 – R 213
  duncanheidkamp.com/midterms
  ```
  (Emoji are illustrative. Generate them from the player's actual picks.)

### 4. Results and leaderboard
- **Admin page** `/midterms/admin`, protected by an env-var passcode. For each race: Pending / R won / D won / Too close to call. Plus a field for the final House Democratic seat count. Duncan updates it manually on election night. Maine and Alaska may stay pending for days.
- **Scoring (Brier):** for each resolved race, score = (p_assigned_to_winner − 1)², where p is the confidence if the player picked the winner and 1 − confidence otherwise. Lower is better.
  - Show it in a friendlier way: **points = round(100 × (1 − Brier))** per race, summed. A Safe correct pick = 99, Lean correct = 84, Lean wrong = 64, Safe wrong = 19.
  - Also show a simple **W–L record** column (correct winners).
- Leaderboard above the grid: rank, name, W–L, avg points per called race, total points, and races pending. Tiebreaker: closest to the actual House seat split.
- The page auto-refreshes about every 60 s on election night so friends can watch it update.
- A small "biggest upset" callout: the race where the group majority was most wrong.

### 5. Nate Silver base case
- A static `nate.ts` (or JSON) with Silver Bulletin's Democratic win probability per race, entered by hand. Snapshot as of Oct 30, 2026:

| race | pDem |
|---|---|
| tx-sen | 0.737 |
| ak-sen | 0.595 |
| mi-sen | 0.832 |
| me-sen | 0.704 |
| oh-sen | 0.712 |
| ks-sen | 0.612 |
| ia-sen | 0.589 |
| tx-gov | 0.283 |
| oh-gov | 0.789 |
| ia-gov | 0.926 |
| ga-gov | 0.631 |

  Include an `asOf` date and make it trivial for Duncan to update the numbers Tuesday afternoon.
- **Grid:** Nate is the **first column**, labeled "Nate / model", on a light gray band with a divider after it. His cell shows the favorite's probability rounded (e.g., "74") in that party's color, with shade by strength: <65% Lean, 65–85% Likely, ≥85% Safe. Races with no data show a dashed "—" cell. He is excluded from the group consensus tally. "You" is the second column, highlighted.
- **Leaderboard:** Nate is a pinned **benchmark row** below the ranked players, labeled "Base case · Silver Bulletin", not ranked. He's scored with the same Brier points using his exact probability (e.g., 0.737 correct → 93). Also show an **Avg points per called race** column for everyone (useful if any race lacks model data).
- See the mockup canvas "Midterms Pick'em" for layout.

## Data model (Supabase)
```
players(id uuid pk, name text unique, pin_hash text, session_token_hash text, tiebreaker_house_d int, submitted_at timestamptz null, created_at, updated_at)
picks(player_id fk, race_id text, side text check (side in ('R','D')), confidence numeric check (confidence in (0.60,0.75,0.90)), updated_at, primary key(player_id, race_id))
results(race_id text pk, winner text null check (winner in ('R','D')), status text, updated_at)
settings(key text pk, value jsonb)  -- lock time, final House D seat count
```
- All reads and writes of picks go through API routes using the service role key (server-side PIN/session check, lock check, and the grid gate). Do not expose the `picks` table to the client directly.

## Acceptance checklist
- [ ] `/midterms` live on duncanheidkamp.com, looks great at 390px wide
- [ ] Can create a player, make 11 picks plus the House-split slider, submit, and land on the grid
- [ ] A player who hasn't submitted cannot fetch other players' picks (verify via the API, not just the UI)
- [ ] Can return on another device with name + PIN to view the grid and edit picks before lock; edits are rejected server-side after lock
- [ ] The grid reads clearly on a phone with 10 players: sticky race labels, horizontal scroll, consensus column
- [ ] The link unfurls with a title and image when pasted into iMessage
- [ ] "Copy my picks" produces the emoji block
- [ ] Nate Silver column appears first in the grid and as a benchmark row on the leaderboard; a race with no model data shows "—"
- [ ] Admin can set results; the leaderboard computes correct points (unit-test the scoring function)
- [ ] Deployed to production via the existing Vercel project; env vars documented in the README

## Notes for Duncan (after build)
1. Send the link to the chain and make your own picks first.
2. Tuesday afternoon: refresh Nate's numbers in `nate.ts` from Silver Bulletin if they've moved.
3. Election night: open `/midterms/admin` and mark races as they're called.

// ============================================================
// scoring.js — Brier-based points, group consensus, leaderboard.
//
// Pure functions only (no DOM, no network) so they run in the
// browser AND in node for unit tests (midterms/test/scoring.test.js).
// ============================================================

import { RACES, HOUSE_TOTAL, SENATE_NOW, SENATE_MAJORITY } from './races.js';

/**
 * Points for one resolved race.
 *   Brier  = (pWinner − 1)²   (lower is better)
 *   points = round(100 × (1 − Brier))
 * where pWinner is the probability the forecaster gave to whoever won.
 * Safe right → 99, Likely right → 94, Lean right → 84,
 * Lean wrong → 64, Likely wrong → 44, Safe wrong → 19.
 */
export function points(pWinner) {
  const brier = (pWinner - 1) ** 2;
  return Math.round(100 * (1 - brier));
}

/** Probability a player assigned to `winner`, given their pick. */
export function pAssignedTo(winner, pick) {
  const conf = Number(pick.confidence);
  return pick.side === winner ? conf : 1 - conf;
}

/**
 * Score one player.
 * @param {Record<string, {side:'R'|'D', confidence:number}>} picks  by race id
 * @param {Record<string, 'R'|'D'>} winners  only resolved races appear here
 */
export function scorePlayer(picks, winners) {
  let pts = 0, w = 0, l = 0;
  for (const race of RACES) {
    const win = winners[race.id];
    const pick = picks[race.id];
    if (!win || !pick) continue;
    pts += points(pAssignedTo(win, pick));
    if (pick.side === win) w++; else l++;
  }
  const called = w + l;
  return { pts, w, l, called, avg: called ? pts / called : null };
}

/**
 * Score Nate on his exact probabilities. Races where he has no number
 * are skipped (that's why we also show avg-per-called-race).
 * @param {Record<string, number|null>} pDem
 */
export function scoreNate(pDem, winners) {
  let pts = 0, w = 0, l = 0;
  for (const race of RACES) {
    const win = winners[race.id];
    const p = pDem[race.id];
    if (!win || p == null) continue;
    const pw = win === 'D' ? p : 1 - p;
    pts += points(pw);
    if (pw > 0.5) w++; else l++;
  }
  const called = w + l;
  return { pts, w, l, called, avg: called ? pts / called : null };
}

/**
 * Group tally for one race (Nate excluded).
 * @returns {{nD:number, nR:number, majority:'R'|'D'|null}}
 */
export function consensus(raceId, players) {
  let nD = 0, nR = 0;
  for (const p of players) {
    const pick = p.picks[raceId];
    if (!pick) continue;
    if (pick.side === 'D') nD++; else nR++;
  }
  const majority = nD > nR ? 'D' : nR > nD ? 'R' : null;
  return { nD, nR, majority };
}

/**
 * Ranked leaderboard. Sort: total points desc, then closest House
 * guess (tiebreaker), then name.
 * @param {{id:string,name:string,picks:object,houseD:number}[]} players
 * @param {Record<string,'R'|'D'>} winners
 * @param {number|null} houseDFinal  actual Democratic seats, once known
 */
export function leaderboard(players, winners, houseDFinal) {
  const rows = players.map((p) => {
    const s = scorePlayer(p.picks, winners);
    const houseDiff = houseDFinal == null || p.houseD == null ? null : Math.abs(p.houseD - houseDFinal);
    return { ...s, id: p.id, name: p.name, houseD: p.houseD, houseDiff };
  });
  rows.sort((a, b) =>
    b.pts - a.pts ||
    (a.houseDiff ?? Infinity) - (b.houseDiff ?? Infinity) ||
    a.name.localeCompare(b.name)
  );
  // Shared rank for exact ties (same points and same House distance).
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.pts === r.pts && prev.houseDiff === r.houseDiff ? prev.rank : i + 1;
  });
  return rows;
}

/**
 * "Biggest upset": the resolved race where the group majority was most
 * wrong — i.e. the highest share of players who picked the loser.
 * Ties go to the race whose losers were more confident.
 * Returns null if the group got every called race right.
 */
export function biggestUpset(players, winners) {
  let best = null;
  for (const race of RACES) {
    const win = winners[race.id];
    if (!win) continue;
    const { nD, nR, majority } = consensus(race.id, players);
    const total = nD + nR;
    if (!total || majority === null || majority === win) continue;
    const wrong = players.filter((p) => p.picks[race.id] && p.picks[race.id].side !== win);
    const share = wrong.length / total;
    const heat = wrong.reduce((a, p) => a + Number(p.picks[race.id].confidence), 0);
    if (!best || share > best.share || (share === best.share && heat > best.heat)) {
      const right = players.filter((p) => p.picks[race.id] && p.picks[race.id].side === win);
      best = { race, winner: win, majority, nD, nR, share, heat, rightNames: right.map((p) => p.name) };
    }
  }
  return best;
}

/** House slider readout helpers (stored value is Democratic seats). */
export function houseSplit(houseD) {
  return { d: houseD, r: HOUSE_TOTAL - houseD };
}

/**
 * The 2027 Senate a set of picks implies. Starts from today's split and
 * flips each pick'em Senate seat to whichever side was picked. A race with
 * no pick (e.g. added after someone entered) is assumed to stay put.
 * Montana's non-R slot (Bodnar, I) counts with Democrats, as FLIPR treats him.
 * @param {(raceId:string) => ('R'|'D'|null|undefined)} sideFor
 * @returns {{D:number, R:number, control:'D'|'R', flips:{race:object, to:'R'|'D'}[]}}
 */
export function impliedSenate(sideFor) {
  let D = SENATE_NOW.D, R = SENATE_NOW.R;
  const flips = [];
  for (const race of RACES) {
    if (!race.held) continue;
    const side = sideFor(race.id) || race.held;
    if (side === race.held) continue;
    if (side === 'D') { D++; R--; } else { R++; D--; }
    flips.push({ race, to: side });
  }
  return { D, R, control: D >= SENATE_MAJORITY ? 'D' : 'R', flips };
}

// ============================================================
// races.js — the races in the pick'em, in display order.
//
// This file is shared: the browser imports it directly, and the
// API (api/midterms/[action].js) imports it too, so the server
// knows which race ids are valid. Edit names/notes here.
//
// Display order is alphabetical by state, Senate before Governor.
// ============================================================

/** @typedef {'R' | 'D'} Side */

/**
 * @typedef {Object} Race
 * @property {string} id      stable id, also the DB key — don't rename after picks exist
 * @property {string} st      two-letter state code (also picks the outline icon)
 * @property {string} state   full state name
 * @property {'Sen'|'Gov'} office
 * @property {string} title   card heading
 * @property {string} note    small gray line under the heading
 * @property {string} r       Republican nominee
 * @property {string} d       Democratic nominee — or, when `dParty` is set, the
 *                            main non-Republican candidate (e.g. an independent)
 * @property {string} [dParty] letter to show for the `d` slot (default 'D').
 *                            Picks for that slot are still stored as side 'D'.
 */

/** @type {Race[]} */
export const RACES = [
  { id: 'ak-sen', st: 'AK', state: 'Alaska',   office: 'Sen', title: 'Alaska Senate',         note: 'Incumbent: Sullivan · slow count',     r: 'Dan Sullivan',      d: 'Mary Peltola' },
  { id: 'ga-gov', st: 'GA', state: 'Georgia',  office: 'Gov', title: 'Georgia Governor',      note: 'Open seat',                            r: 'Rick Jackson',      d: 'Keisha Lance Bottoms' },
  { id: 'ia-sen', st: 'IA', state: 'Iowa',     office: 'Sen', title: 'Iowa Senate',           note: 'Open seat',                            r: 'Ashley Hinson',     d: 'Josh Turek' },
  { id: 'ia-gov', st: 'IA', state: 'Iowa',     office: 'Gov', title: 'Iowa Governor',         note: 'Open seat',                            r: 'Zach Lahn',         d: 'Rob Sand' },
  { id: 'ks-sen', st: 'KS', state: 'Kansas',   office: 'Sen', title: 'Kansas Senate',         note: 'Incumbent: Marshall',                  r: 'Roger Marshall',    d: 'Adam Hamilton' },
  { id: 'me-sen', st: 'ME', state: 'Maine',    office: 'Sen', title: 'Maine Senate',          note: 'Incumbent: Collins · ranked-choice',   r: 'Susan Collins',     d: 'Troy Jackson' },
  { id: 'mi-sen', st: 'MI', state: 'Michigan', office: 'Sen', title: 'Michigan Senate',       note: 'Open seat',                            r: 'Mike Rogers',       d: 'Abdul El-Sayed' },
  { id: 'mt-sen', st: 'MT', state: 'Montana',  office: 'Sen', title: 'Montana Senate',        note: 'Independent vs. R · a Democrat is also on the ballot', r: 'Kurt Alme',         d: 'Seth Bodnar', dParty: 'I' },
  { id: 'oh-sen', st: 'OH', state: 'Ohio',     office: 'Sen', title: 'Ohio Senate (special)', note: 'Incumbent: Husted (appointed)', r: 'Jon Husted',        d: 'Sherrod Brown' },
  { id: 'oh-gov', st: 'OH', state: 'Ohio',     office: 'Gov', title: 'Ohio Governor',         note: 'Open seat',                            r: 'Vivek Ramaswamy',   d: 'Amy Acton' },
  { id: 'tx-sen', st: 'TX', state: 'Texas',    office: 'Sen', title: 'Texas Senate',          note: 'Open seat · Cornyn lost the primary',  r: 'Ken Paxton',        d: 'James Talarico' },
  { id: 'tx-gov', st: 'TX', state: 'Texas',    office: 'Gov', title: 'Texas Governor',        note: 'Incumbent: Abbott',                    r: 'Greg Abbott',       d: 'Gina Hinojosa' },
];

export const RACE_IDS = RACES.map((r) => r.id);

/**
 * The letter to show for a side in a given race. Usually 'R'/'D', but a
 * race can relabel its non-Republican slot (Montana: 'I' for Bodnar).
 */
export function sideLabel(race, side) {
  return side === 'D' ? race.dParty || 'D' : 'R';
}

// Confidence levels. The DB stores the number; the UI shows the word.
export const CONFIDENCES = [
  { value: 0.6, label: 'Lean' },
  { value: 0.75, label: 'Likely' },
  { value: 0.9, label: 'Safe' },
];
export const CONFIDENCE_VALUES = CONFIDENCES.map((c) => c.value);

/** 0.6 → 'Lean', etc. */
export function confidenceLabel(value) {
  const c = CONFIDENCES.find((c) => Math.abs(c.value - Number(value)) < 1e-9);
  return c ? c.label : '';
}

// Picks lock Tuesday Nov 3, 2026 at 5:00 PM Central (CST, UTC−6).
// The server can override this with the MIDTERMS_LOCK_AT env var for testing.
export const LOCK_AT = '2026-11-03T17:00:00-06:00';

// House tiebreaker: slider range is in Republican seats.
export const HOUSE_TOTAL = 435;
export const HOUSE_MAJORITY = 218;
export const HOUSE_R_MIN = 180;
export const HOUSE_R_MAX = 255;

export const MAX_PLAYERS = 15;

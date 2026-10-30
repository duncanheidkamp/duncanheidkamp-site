// ============================================================
// nate.js — Nate Silver / Silver Bulletin base case.
//
// Hand-entered from the Silver Bulletin forecast. Each number is the
// DEMOCRAT's win probability (0–1). To update on Tuesday afternoon:
//   1. Change the numbers below (and `asOf`).
//   2. Commit + push — Vercel redeploys in ~30 seconds.
// Set a race to null if there's no model number; the grid shows "—".
// ============================================================

export const NATE = {
  asOf: 'Oct 30',
  pDem: {
    'tx-sen': 0.737,
    'ak-sen': 0.595,
    'mi-sen': 0.832,
    'me-sen': 0.704,
    'oh-sen': 0.712,
    'ks-sen': 0.612,
    'ia-sen': 0.589,
    'tx-gov': 0.283,
    'oh-gov': 0.789,
    'ia-gov': 0.926,
    'ga-gov': 0.631,
  },
};

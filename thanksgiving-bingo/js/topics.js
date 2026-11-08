// ============================================================
// topics.js — THE CURATED SQUARES. Edit this list, commit, push.
//
// • Keep each one short (≤ 40 characters) so it fits on a phone square.
// • Keep it even-handed: both uncles' greatest hits.
// • Order doesn't matter; boards are shuffled.
//
// Squares players add themselves live in Supabase (bingo_topics).
// To pull a bad one, set `hidden = true` on its row in the Supabase
// table editor.
//
// Shared by the browser and the API (the API uses it to de-duplicate).
// ============================================================

export const TOPICS = [
  // Wallet
  'Price of eggs',
  'Grocery prices',
  'Gas prices',
  'Inflation',
  'Tariffs',
  'Housing costs',
  'Student loans',
  'Taxes',
  'National debt',
  'Social Security running out',
  'Healthcare costs',
  'Minimum wage',
  'Unions and strikes',

  // Work and tech
  'Return to office',
  'AI taking jobs',
  'Crypto',
  'Billionaires',
  'Big Tech',
  'Kids and social media',
  'TikTok',
  'Electric cars',

  // The issues
  'The border',
  'Immigration',
  'Climate change',
  'Guns',
  'Abortion',
  'Crime in cities',
  'Policing',
  'Vaccines',
  'What kids learn in school',
  'Woke / culture wars',
  'Free speech',
  'Fake news / the media',

  // World
  'Ukraine',
  'The Middle East',
  'China',

  // Washington
  'Supreme Court',
  'Congress is too old',
  'Term limits',
  'Government shutdown',
  'Electoral College',
  'Voter ID',
  'Mail-in voting',
  'The midterms',
  '"The polls were wrong"',
  'Third-party candidate',

  // Table moves
  '"Both sides are the same"',
  '"I\'m moving to Canada"',
  '"I\'m not political, but…"',
  '"Not at the table!"',
  'Someone fact-checks on their phone',
  'Subject changed to football',
];

// The centre square. Always marked.
export const FREE = 'FREE';
export const FREE_LABEL = 'Free space';

export const MAX_TOPIC_LENGTH = 40;
export const MIN_TOPIC_LENGTH = 2;

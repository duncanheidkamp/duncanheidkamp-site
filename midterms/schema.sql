-- ============================================================
-- Midterms Pick'em — Supabase schema
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Row Level Security is ON with no policies, which means the public
-- (anon) key can't read or write anything. Only the API route, using
-- the service-role key, can touch these tables.
-- ============================================================

create table if not exists midterms_players (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  name_key              text not null unique,            -- lower-cased name, for case-insensitive login
  pin_hash              text not null,
  session_token_hashes  text[] not null default '{}',    -- sha256 of active session tokens (a few devices)
  tiebreaker_house_d    int check (tiebreaker_house_d between 180 and 255),
  submitted_at          timestamptz,                      -- first complete submission; sets grid column order
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists midterms_picks (
  player_id   uuid not null references midterms_players(id) on delete cascade,
  race_id     text not null,
  side        text not null check (side in ('R', 'D')),
  confidence  numeric not null check (confidence in (0.60, 0.75, 0.90)),
  updated_at  timestamptz not null default now(),
  primary key (player_id, race_id)
);

create table if not exists midterms_results (
  race_id     text primary key,
  winner      text check (winner in ('R', 'D')),
  status      text not null default 'pending' check (status in ('pending', 'called', 'too_close')),
  updated_at  timestamptz not null default now()
);

-- key/value settings: 'house_d_final' (int), optional 'lock_at' (ISO string)
create table if not exists midterms_settings (
  key    text primary key,
  value  jsonb
);

alter table midterms_players  enable row level security;
alter table midterms_picks    enable row level security;
alter table midterms_results  enable row level security;
alter table midterms_settings enable row level security;

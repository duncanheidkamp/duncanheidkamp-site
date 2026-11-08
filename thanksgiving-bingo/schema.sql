-- ============================================================
-- Thanksgiving Bingo — Supabase schema
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Lives in the same project as the midterms pick'em. RLS is ON with
-- no policies, so the public key can't touch these tables; only the
-- API route (service-role key) can. Saved boards are never updated or
-- deleted by the API.
-- ============================================================

create table if not exists bingo_boards (
  id            text primary key,                        -- 8-char random code used in share links
  created_at    timestamptz not null default now(),
  mode          text not null check (mode in ('random', 'custom')),
  squares       jsonb not null,                          -- 25 strings in grid order, index 12 = 'FREE'
  marked        jsonb not null,                          -- 25 booleans
  bingo_lines   jsonb not null default '[]',             -- e.g. ["row0","diag1"]
  display_name  text check (display_name is null or char_length(display_name) <= 30)
);

-- Squares players add. To pull a bad one: set hidden = true in the table editor.
create table if not exists bingo_topics (
  id          bigint generated always as identity primary key,
  text        text not null check (char_length(text) between 2 and 40),
  text_key    text not null unique,                      -- lower-cased, punctuation stripped, for de-dupe
  hidden      boolean not null default false,
  use_count   int not null default 0,                    -- boards submitted with this square
  created_at  timestamptz not null default now()
);

alter table bingo_boards enable row level security;
alter table bingo_topics enable row level security;

-- Called on submit: +1 for every player-added square on the board.
create or replace function bingo_bump_topics(keys text[])
returns void language sql security definer set search_path = public as $$
  update bingo_topics set use_count = use_count + 1 where text_key = any(keys);
$$;
revoke all on function bingo_bump_topics(text[]) from public, anon, authenticated;

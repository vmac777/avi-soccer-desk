create table if not exists public.tr_competition_players_cache (
  competition_id integer primary key,
  players_json jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.tr_competition_players_cache enable row level security;

create policy "admin_all" on public.tr_competition_players_cache
  for all using (is_admin()) with check (is_admin());

comment on table public.tr_competition_players_cache is
  'Cache of TR /players?competitionid=X responses. 24h TTL enforced in edge function code.';
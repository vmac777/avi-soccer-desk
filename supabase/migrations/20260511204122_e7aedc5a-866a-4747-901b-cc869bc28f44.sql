-- History table for daily snapshots of tr_competition_players_cache
create table if not exists public.tr_competition_players_history (
  competition_id integer not null,
  snapshot_date date not null,
  players_json jsonb not null,
  snapshotted_at timestamptz not null default now(),
  primary key (competition_id, snapshot_date)
);

alter table public.tr_competition_players_history enable row level security;

create policy "admin_all" on public.tr_competition_players_history
  for all using (is_admin()) with check (is_admin());

create index if not exists tr_competition_players_history_competition_idx
  on public.tr_competition_players_history (competition_id, snapshot_date desc);

comment on table public.tr_competition_players_history is
  'Daily snapshots of tr_competition_players_cache, taken at 03:00 UTC. Backs xTV trajectory queries. Composite PK makes daily inserts idempotent.';

-- Snapshot function
create or replace function public.snapshot_tr_competition_players()
returns table (competition_id integer, n_players integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.tr_competition_players_history (competition_id, snapshot_date, players_json)
  select c.competition_id, (now() at time zone 'UTC')::date, c.players_json
  from public.tr_competition_players_cache c
  on conflict (competition_id, snapshot_date) do update
    set players_json = excluded.players_json,
        snapshotted_at = now()
  returning
    tr_competition_players_history.competition_id,
    jsonb_array_length(tr_competition_players_history.players_json);
end;
$$;

-- Ensure pg_cron is available, then schedule the daily job
create extension if not exists pg_cron;

-- Unschedule any prior version of this job (idempotent re-runs of the migration)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'tr-competition-snapshot-daily') then
    perform cron.unschedule('tr-competition-snapshot-daily');
  end if;
end $$;

select cron.schedule(
  'tr-competition-snapshot-daily',
  '0 3 * * *',
  $$select public.snapshot_tr_competition_players();$$
);
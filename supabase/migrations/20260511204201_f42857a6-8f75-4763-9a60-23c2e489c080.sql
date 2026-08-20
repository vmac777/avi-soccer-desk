create or replace function public.snapshot_tr_competition_players()
returns table (competition_id integer, n_players integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
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
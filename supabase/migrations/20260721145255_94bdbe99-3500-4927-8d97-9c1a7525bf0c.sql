
CREATE TABLE public.squad_player_xtv_history (
  tr_player_id integer NOT NULL,
  year smallint NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  xtv bigint NOT NULL,
  snapshotted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tr_player_id, year, month)
);

GRANT SELECT ON public.squad_player_xtv_history TO authenticated;
GRANT ALL ON public.squad_player_xtv_history TO service_role;

ALTER TABLE public.squad_player_xtv_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read squad xtv history"
  ON public.squad_player_xtv_history FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX squad_player_xtv_history_player_idx
  ON public.squad_player_xtv_history (tr_player_id, year, month);

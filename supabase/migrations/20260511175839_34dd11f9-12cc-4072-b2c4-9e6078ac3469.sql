ALTER TABLE public.club_briefs
  ADD COLUMN assembled_context text,
  ADD COLUMN system_prompt_version text NOT NULL DEFAULT 'v1.0',
  ADD COLUMN model text,
  ADD COLUMN web_search_enabled boolean;
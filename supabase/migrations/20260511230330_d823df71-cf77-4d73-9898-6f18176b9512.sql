alter table public.club_briefs
add column if not exists position_scope text[] not null default '{}'::text[];

comment on column public.club_briefs.position_scope is
'Phase 1.5: TR position labels the user scoped the brief to. Empty array = no position scope. Values verbatim from TR taxonomy (GK, CB, LB, RB, LWB, RWB, DM, CM, AM, LW, RW, CF, ST, SS).';
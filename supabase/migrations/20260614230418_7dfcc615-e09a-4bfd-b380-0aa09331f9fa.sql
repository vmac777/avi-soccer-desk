-- Wipe buy-side pitch data. scouted_targets intentionally untouched.
TRUNCATE TABLE
  public.buy_pitch_documents,
  public.buy_negotiation_entries,
  public.buy_pitch_notes,
  public.buy_pitches
RESTART IDENTITY CASCADE;

-- follow_ups are polymorphic (no FK), so CASCADE misses them. Clean manually.
DELETE FROM public.follow_up_links
WHERE follow_up_id IN (
  SELECT id FROM public.follow_ups WHERE target_type = 'buy_pitch'
);
DELETE FROM public.follow_ups WHERE target_type = 'buy_pitch';
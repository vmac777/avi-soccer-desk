
-- Remove leftover old contacts not part of the new 898-contact seed
DELETE FROM interactions WHERE contact_id IN (SELECT id FROM contacts WHERE created_at < '2026-03-26');
DELETE FROM player_club_links WHERE contact_id IN (SELECT id FROM contacts WHERE created_at < '2026-03-26');
DELETE FROM contacts WHERE created_at < '2026-03-26';

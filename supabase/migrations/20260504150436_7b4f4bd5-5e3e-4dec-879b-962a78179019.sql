CREATE OR REPLACE VIEW public.contacts_enriched
WITH (security_invoker = true) AS
SELECT id, market, club, contact_person, who_spoke, last_contact, stage,
       players_offered, club_interest, needs, priority, created_at, updated_at,
       created_by, role, linkedin, phone1, phone2, phone3, is_primary,
       CASE WHEN last_contact IS NULL THEN NULL::integer
            ELSE CURRENT_DATE - last_contact END AS days_since_contact,
       CASE WHEN last_contact IS NULL THEN 'unknown'
            WHEN last_contact >= DATE '2026-04-01' THEN 'active'
            ELSE 'recent' END AS health_status,
       COALESCE((SELECT count(*) FROM interactions i WHERE i.contact_id = c.id), 0::bigint) AS interaction_count
FROM contacts c;
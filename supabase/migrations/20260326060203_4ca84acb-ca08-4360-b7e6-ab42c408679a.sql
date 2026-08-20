
DROP VIEW IF EXISTS public.contacts_enriched;

CREATE VIEW public.contacts_enriched AS
SELECT c.id,
    c.market,
    c.club,
    c.contact_person,
    c.who_spoke,
    c.last_contact,
    c.stage,
    c.players_offered,
    c.club_interest,
    c.needs,
    c.priority,
    c.created_at,
    c.updated_at,
    c.created_by,
    c.role,
    c.linkedin,
    c.phone1,
    c.phone2,
    c.phone3,
    CURRENT_DATE - c.last_contact AS days_since_contact,
    CASE
        WHEN c.last_contact IS NULL THEN 'unknown'::text
        WHEN (CURRENT_DATE - c.last_contact) < 90 THEN 'hot'::text
        WHEN (CURRENT_DATE - c.last_contact) < 180 THEN 'warm'::text
        WHEN (CURRENT_DATE - c.last_contact) < 365 THEN 'cold'::text
        ELSE 'frozen'::text
    END AS health_status,
    (SELECT count(*) FROM interactions i WHERE i.contact_id = c.id) AS interaction_count
FROM contacts c;


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
    c.is_primary,
    CASE
        WHEN c.last_contact IS NULL THEN NULL::integer
        ELSE CURRENT_DATE - c.last_contact
    END AS days_since_contact,
    COALESCE(i.interaction_count, 0::bigint) AS interaction_count,
    CASE
        WHEN c.last_contact IS NULL THEN 'unknown'::text
        WHEN (CURRENT_DATE - c.last_contact) <= 7 THEN 'active'::text
        WHEN (CURRENT_DATE - c.last_contact) <= 14 THEN 'recent'::text
        WHEN (CURRENT_DATE - c.last_contact) <= 30 THEN 'cooling'::text
        ELSE 'stale'::text
    END AS health_status
FROM contacts c
LEFT JOIN (
    SELECT interactions.contact_id,
        count(*) AS interaction_count
    FROM interactions
    GROUP BY interactions.contact_id
) i ON i.contact_id = c.id;

CREATE OR REPLACE VIEW contacts_enriched AS
SELECT id,
    market,
    club,
    contact_person,
    who_spoke,
    last_contact,
    stage,
    players_offered,
    club_interest,
    needs,
    priority,
    created_at,
    updated_at,
    created_by,
    role,
    linkedin,
    phone1,
    phone2,
    phone3,
    CURRENT_DATE - last_contact AS days_since_contact,
    CASE
        WHEN last_contact IS NULL THEN 'unknown'
        WHEN (CURRENT_DATE - last_contact) < 10 THEN 'active'
        WHEN (CURRENT_DATE - last_contact) < 30 THEN 'recent'
        WHEN (CURRENT_DATE - last_contact) < 90 THEN 'cooling'
        ELSE 'stale'
    END AS health_status,
    ( SELECT count(*) FROM interactions i WHERE i.contact_id = c.id) AS interaction_count
FROM contacts c;
DROP VIEW IF EXISTS contacts_enriched;
CREATE VIEW contacts_enriched AS
SELECT
    c.*,
    (CURRENT_DATE - c.last_contact) AS days_since_contact,
    CASE
        WHEN c.last_contact IS NULL THEN 'unknown'
        WHEN (CURRENT_DATE - c.last_contact) < 20 THEN 'active'
        WHEN (CURRENT_DATE - c.last_contact) < 40 THEN 'recent'
        WHEN (CURRENT_DATE - c.last_contact) < 90 THEN 'cooling'
        ELSE 'stale'
    END AS health_status,
    COALESCE(i.cnt, 0) AS interaction_count
FROM contacts c
LEFT JOIN (
    SELECT contact_id, COUNT(*) AS cnt
    FROM interactions
    GROUP BY contact_id
) i ON i.contact_id = c.id;
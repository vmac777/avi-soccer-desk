
-- Remove old duplicate contacts, keeping the newer ones (with role/linkedin/phone fields)
DELETE FROM contacts a
USING contacts b
WHERE a.id < b.id
  AND a.club = b.club
  AND a.market = b.market
  AND COALESCE(a.contact_person,'') = COALESCE(b.contact_person,'');

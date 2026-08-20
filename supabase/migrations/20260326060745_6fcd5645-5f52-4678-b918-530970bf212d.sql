-- Intentionally a no-op in this deployment.
--
-- Upstream, this migration seeded roughly 60 contact rows — named club
-- executives with direct phone numbers — belonging to a different desk. That is
-- another organisation's confidential contact list and must not exist in this
-- database.
--
-- Contains no DDL, so removing the data changes nothing structurally. The file
-- is kept so migration ordering and history stay intact.

SELECT 1;

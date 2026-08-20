-- Intentionally a no-op in this deployment.
--
-- Upstream, this migration re-filed and renamed specific seeded contact rows
-- from a different desk, and inserted a handful more. It operates purely on that
-- organisation's data, which this database does not and should not contain.
--
-- Contains no DDL. The file is kept so migration ordering and history stay
-- intact.

SELECT 1;

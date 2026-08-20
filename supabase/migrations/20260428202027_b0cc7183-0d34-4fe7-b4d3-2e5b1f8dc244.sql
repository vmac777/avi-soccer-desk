-- Intentionally a no-op in this deployment.
--
-- Upstream, this migration scheduled three pg_cron jobs for the news digest
-- emails (daily-news-digest, digest-retry, retry-super-urgent), each posting to
-- a hardcoded Supabase project URL.
--
-- The agent desk ships no news surface and deploys none of those functions, so
-- the jobs have nothing to call. Left more importantly, the hardcoded URL
-- pointed at a different project entirely — this database would have been
-- calling another tenant's edge functions on a schedule.
--
-- The file is kept so migration ordering and history stay intact.

SELECT 1;

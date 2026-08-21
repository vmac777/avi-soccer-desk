# Getting the clubs and the contact directory in

The `clubs` and `contacts` tables are created empty by the migrations and stay
that way. The club/league structure was never seeded in SQL — it was entered
through the app on the other desk, so it exists only in that database. Running
`supabase db push` here will never produce a single club.

Two steps: export from there, import here.

## 1. Export from the source project

`scripts/export-backup.mjs` reads through the API as a signed-in admin. Run it
against the **source** project, not this one:

```bash
SUPABASE_URL=https://<source-project>.supabase.co \
SUPABASE_ANON_KEY=<source publishable key> \
ADMIN_EMAIL=<your admin email there> \
ADMIN_PASSWORD=<that password> \
node scripts/export-backup.mjs
```

This writes `backups/<timestamp>/tables/*.json`.

**Run it off-peak.** A previous export of this database saturated it and took
the live CRM down with HTTP 522s. The script now pages small, times each request
out at 20s, throttles between calls, and skips the `tr_*` history tables unless
you pass `--include-tr` — but it is still reading a production database that
people are using. Off-hours, and watch the app while it runs.

You only need two of the files it produces: `clubs.json` and `contacts.json`.

## 2. Import here

Check what would come across first:

```bash
node scripts/import-clubs-contacts.mjs backups/<timestamp> --dry-run
```

Then, against this project:

```bash
ADMIN_EMAIL=<your admin email here> \
ADMIN_PASSWORD=<your password here> \
node scripts/import-clubs-contacts.mjs backups/<timestamp>
```

Clubs upsert on name and contacts skip pairs already present, so running it
twice is safe.

## What crosses and what does not

**Crosses:** club name, country, league and tier — public reference data, and
what the Country → League → Club pickers are built on. Plus each stakeholder's
**name and role**.

**Does not cross:**

- **Phone numbers and LinkedIn URLs.** Personal contact details that named
  people gave to that desk, not consent to be reachable from this one.
- **The CRM layer** — `who_spoke`, `last_contact`, `stage`, `needs`,
  `club_interest`, `players_offered`, `priority`. That is not a directory, it is
  one organisation's private read on each relationship: how warm it is, who owns
  it, what that club is hunting for, and which of its own players it has offered
  them. The two desks are counterparties in the same market.

`stage` lands as empty rather than the column default of
`Contacted - No Answer`, which would assert an approach that never happened.

The importer prints how many phone numbers and LinkedIn URLs it left behind, so
you can see the filter did its job.

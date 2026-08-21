# Getting the clubs and the contact directory in

The `clubs` and `contacts` tables are created empty by the migrations and stay
that way. The club/league structure was never seeded in SQL — it was entered
through the app on the other desk, so it exists only in that database. Running
`supabase db push` here will never produce a single club.

Two steps: export from there, import here.

## 1. Export from the source project

`scripts/export-backup.mjs` reads through the API as a signed-in admin. Run it
against the **source** project, not this one, and **ask it for only the two
tables this import needs**:

```bash
cd ~/avi-soccer-desk

SUPABASE_URL=https://<source-project-ref>.supabase.co \
SUPABASE_ANON_KEY=<source publishable/anon key> \
ADMIN_EMAIL=<your admin email there> \
ADMIN_PASSWORD=<that password> \
node scripts/export-backup.mjs --tables=clubs,contacts,settings --skip-storage
```

`--tables=clubs,contacts,settings` is the important part. Without it the script walks all
thirty-five tables, including the multi-megabyte TransferRoom history blobs. An
earlier full run of this script saturated that database and took the live CRM
down with HTTP 522s for its users. Two small reference tables is a completely
different amount of work — a few hundred rows, seconds, not minutes.

It still reads a production database people are using, so run it off-peak and
keep the app open in another tab while it goes. If the app slows, Ctrl-C it.

Output lands in `backups/<timestamp>/tables/` as `clubs.json`, `contacts.json`
and `settings.json`.

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
**name, role and LinkedIn URL**.

**Does not cross:**

- **Phone numbers.** A mobile number is something an identifiable person handed
  to that desk, not consent to be called from this one. LinkedIn is different
  and does come across — a public professional profile is the same thing a
  search for that person's name would return.
- **The CRM layer** — `who_spoke`, `last_contact`, `stage`, `needs`,
  `club_interest`, `players_offered`, `priority`. That is not a directory, it is
  one organisation's private read on each relationship: how warm it is, who owns
  it, what that club is hunting for, and which of its own players it has offered
  them. The two desks are counterparties in the same market.

`stage` lands as empty rather than the column default of
`Contacted - No Answer`, which would assert an approach that never happened.

The importer prints how many phone numbers it left behind and how many LinkedIn
URLs it is carrying, so you can see the filter did its job.

## Clubs the directory never had

The imported directory is one desk's contact list, so it does not contain every
club the roster points at — its own club least of all. Those clubs have no
TransferRoom identifiers, and a player at one cannot be enriched however his
club is spelled.

`scripts/resolve-club-tr-ids.mjs` fills them in. TransferRoom has no "look up a
team" endpoint; the API is organised by competition, and each player row carries
its team's id and name. So the script finds the competition matching the club's
league, reads it once, and pulls the distinct teams out.

```bash
TR_PROXY_BEARER_TOKEN=<the edge-function secret> \
ADMIN_EMAIL=... ADMIN_PASSWORD=... \
node scripts/resolve-club-tr-ids.mjs
```

Read-only. It prints three groups: resolved (the team name matches exactly
inside the competition), close-but-not-exact, and unresolved with the reason.
`--apply` writes only the first group — a wrong `tr_team_id` does not fail
loudly, it attaches another squad's valuations to your player.

Useful flags: `--only="Shakhtar"` for one club, `--list-competitions` to see
what TransferRoom offers when a league name is what is failing to match.

Competition rosters are written to `tr_competition_players_cache`, the same
24-hour cache enrichment reads, so running this makes the next enrichment
cheaper rather than more expensive.

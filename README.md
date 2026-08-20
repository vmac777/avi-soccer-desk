# AVI Soccer — Agent Desk

An operating desk for a football agency: the clubs they talk to, what those
clubs need, the players they represent, and the placements in progress.

Built from the same codebase family as the club-side trading desk, but inverted.
A club owns players and sells them; an agency represents players and places them.

## Sections

| Section | What it is |
|---|---|
| Dashboard | Club-network health, recent activity, and what is due |
| Contacts | Club-side people, conversation history, and what each club needs |
| Pending Actions | Follow-ups across contacts, roster, and pitches |
| Roster | The players we represent, with mandate terms |
| Pitches | Placements in progress, two-track with a negotiation log |

## Stack

Vite + React 18 + TypeScript + Tailwind/shadcn, Supabase (Postgres, auth, edge
functions), TanStack Query, React Router.

## Isolation

This deployment has **its own Supabase project**. It shares no database, no keys,
and no edge functions with any other deployment.

That is deliberate rather than incidental: clients are rival clubs and rival
agencies. Separate projects make cross-client leakage structurally impossible
instead of dependent on a policy being written correctly. Within one project,
row-level security is a shared-desk model — every authenticated user of that
project sees that project's data.

If you are standing up another agency, create another Supabase project. Do not
add a tenant column.

## Setup

```bash
npm install          # not `npm ci` until the lockfile is regenerated
cp .env.example .env # then fill in the Supabase values
npm run dev
```

### Backend

1. Create a Supabase project (**Pro tier** — the free tier has no backups).
2. `supabase db push` replays every migration into the empty database.
3. Deploy the three edge functions this app uses:
   `tm-fetch`, `scouted-target-enrich-tr`, `tr-proxy`.
4. Set function secrets: `TR_API_EMAIL`, `TR_API_PASSWORD`,
   `TR_PROXY_BEARER_TOKEN`, `APP_BASE_URL`.
5. **Disable public signup** under Authentication → Sign In / Providers, and
   invite users manually. Policies grant broad read access to any authenticated
   account, so open signup would expose the desk.

No auth redirect configuration is needed. Sign-in is `signInWithPassword` only —
no OAuth, no magic links, no redirects — so Supabase's Site URL and redirect
allowlist never come into play.

## Data provenance

Roster rows are seeded from Transfermarkt, which does not publish reliable
contract data. Fields filled in by hand are marked `placeholder` in
`data_provenance`.

Contract expiry decides when a player may talk to other clubs and where the
leverage sits, so a fabricated date must never read as a known one. Placeholder
fields are badged in the UI, **omitted from client-facing PDFs**, and ignored by
the matching engine. See `src/lib/rosterData.ts`.

## Branding

AVI Soccer: Ink Navy `#0F1B2D`, Faded Gold `#C99A2C`, Paper `#F2EFE6`, with
Bebas Neue for display and Inter for body. Tokens live in `src/index.css`, names
and logo paths in `src/config/client.ts`, assets in `public/brand/`.

Note the brand book specifies navy and gold **on paper** as the primary identity.
This product surface currently renders as a dark navy desk with gold accents,
using the reversed logo. A light-ground UI is a deliberate retheme, not a token
swap.

## Still to build

- Requirement 4 — structured `club_requirements` and roster/requirement matching.
- Requirement 5 — a roster detail route, and wiring the ported PDF export to it.
- Schema — replace `UNIQUE (scouted_target_id)` on `buy_pitches` with
  `(scouted_target_id, contact_id)`; an agent pitches one player to many clubs.
- Roster columns — `video_url`, `data_provenance`, and the mandate fields.
- Bulk paste-many-Transfermarkt-URLs import.

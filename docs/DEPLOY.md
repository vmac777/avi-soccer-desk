# Deploying the desk to Vercel

Once this is up you get a permanent URL instead of `localhost:8083`, and pushes
to `main` redeploy automatically.

## One-time setup

1. Go to <https://vercel.com/new> and import `vmac777/avi-soccer-desk`.
2. Vercel reads `vercel.json` and picks the right framework, build command and
   output directory on its own. Leave those alone.
3. Add two **Environment Variables**, for all three environments (Production,
   Preview, Development):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://mfxuxqfaybcbjfslmtav.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key from Supabase → Settings → API |

   Both are baked into the browser bundle at build time and are meant to be
   public — the publishable key is safe to expose, which is exactly why every
   table is behind RLS. **Never put the service-role key here.** It bypasses RLS
   entirely, and anything in a `VITE_` variable ships to every visitor.

4. Deploy.

**Nothing to configure on the Supabase side.** The app signs in with
`signInWithPassword` and never redirects, so there are no callback URLs to
allow-list. The new domain works the moment it exists.

## After the first deploy

Changing an environment variable does **not** affect the running site — the
values are compiled in. Redeploy after any change.

## Why `installCommand` is pinned to npm

`vercel.json` forces `npm ci`. The tree this repo was seeded from was built on
Lovable, whose lockfile resolves every dependency through a private registry
that returns 403 to anyone outside Lovable. Vercel auto-detects a `bun.lock` and
would use it. The bun lockfiles are deleted and git-ignored here, and the pinned
install command is the belt to that braces — a Vercel build that starts
resolving `europe-west4-npm.pkg.dev` has picked up bun and will fail.

## Before the agency starts working live deals on it

- **Upgrade the Supabase project off the free tier.** Free pauses after ~7 days
  of inactivity and keeps no backups. A quiet week taking the desk offline, or a
  bad week losing their deal records, is a client incident.
- **Confirm public signup is off** (Supabase → Authentication → Sign In / Up).
  Invite users by hand.
- **Run `scripts/export-backup.mjs` on a schedule** against this project, and
  keep the output somewhere off Vercel and off Supabase.

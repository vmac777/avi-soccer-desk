import { getClubTmLinks } from '@/lib/clubTmLinks';

/**
 * A club's crest, or an honest fallback.
 *
 * The board leads with the clubs doing the asking, and a grid of three-letter
 * discs reads like a spreadsheet. But nothing in this app ever stored a crest,
 * and filling in 485 of them by hand is not a thing anyone was going to do.
 *
 * The app already ships Transfermarkt club URLs for 481 clubs, and each one
 * ends in the club's Transfermarkt id — which is also the filename of its
 * crest. So the id we already have is the picture we did not have. A pasted
 * `crest_url` on the club row overrides it, for the clubs the lookup misses
 * and for the times the derived image is wrong.
 *
 * When neither exists, this returns null and the caller draws initials. That
 * is a designed state, not a hole.
 */

const TM_CLUB_ID = /\/verein\/(\d+)/;

/** Transfermarkt's crest CDN. `head` is the ~30px variant, right for a 26px disc. */
const TM_CREST = (id: string) => `https://tmssl.akamaized.net/images/wappen/head/${id}.png`;

export function tmClubId(clubName: string | null | undefined): string | null {
  if (!clubName) return null;
  const links = getClubTmLinks(clubName);
  return links?.tm.match(TM_CLUB_ID)?.[1] ?? null;
}

/**
 * @param stored the club row's `crest_url`, which always wins when usable
 */
export function crestUrl(
  clubName: string | null | undefined,
  stored?: string | null,
): string | null {
  // Only absolute. A schemeless URL is read as a relative path, so the image
  // resolves against our own origin and 404s — the Transfermarkt bug again,
  // and it would show up here as a club that mysteriously has no crest.
  const override = (stored ?? '').trim();
  if (/^https?:\/\//i.test(override)) return override;

  const id = tmClubId(clubName);
  return id ? TM_CREST(id) : null;
}

/**
 * The disc's letters when there is no image.
 *
 * Three letters, because that is what the design drew and what a club is
 * recognisable by — BOT, FLA, PAL. A one-word name gives its first three;
 * a multi-word one gives each word's initial, which is how people actually
 * abbreviate "Red Bull Bragantino".
 */
export function clubInitials(clubName: string | null | undefined): string {
  const name = (clubName ?? '').trim();
  if (!name) return '—';

  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 0)
    // Drop the noise words that would otherwise eat two of the three slots.
    .filter((w) => !/^(fc|afc|sc|cf|sfc|ac|bc|ec|fk|de|do|da|of|the)$/i.test(w));

  const source = words.length > 0 ? words : [name];
  if (source.length === 1) return source[0].slice(0, 3).toUpperCase();
  return source.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}

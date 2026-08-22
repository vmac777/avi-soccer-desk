/**
 * Transfermarkt links, normalised at every boundary they cross.
 *
 * A link was stored as `transfermarkt.com.br/gabriel/profil/spieler/435338` —
 * no scheme. Everything downstream then did the wrong thing, quietly:
 *
 *   * As an `href`, a browser reads a schemeless string as a *relative path*,
 *     so "open on Transfermarkt" went to
 *     `avi-soccer-desk.vercel.app/roster/transfermarkt.com.br/...` — the app's
 *     own 404, wearing the right-looking address.
 *   * The edge function's URL pattern requires `^https?://`, so enrichment
 *     rejected it as `invalid_url` before it ever made a request. A whole
 *     retry mechanism sat behind a door that never opened.
 *
 * Neither failure said "there is no scheme". One looked like Transfermarkt
 * being awkward, the other like the site 404ing.
 *
 * A pasted URL is user input arriving from a browser bar, an email, or a
 * spreadsheet, and any of those can drop the scheme. Normalise on the way in,
 * on the way out, and before fetching.
 */

/** `/<slug>/profil/spieler/<id>` — the id is what identifies the player. */
const TM_PATH = /transfermarkt\.[a-z.]+\/.+\/spieler\/(\d+)/i;

/**
 * A usable absolute Transfermarkt URL, or null if it is not one at all.
 *
 * Adds the scheme when it is missing rather than rejecting: the address is
 * right, and refusing it would only push the same correction onto a person.
 */
export function normaliseTmUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!TM_PATH.test(withScheme)) return null;

  try {
    // Round-trip through URL so a malformed host fails here rather than in a
    // fetch, and so the result is canonical.
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

/** The Transfermarkt player id, which is the part that identifies him. */
export function tmPlayerId(raw: string | null | undefined): string | null {
  const url = normaliseTmUrl(raw);
  return url ? (url.match(TM_PATH)?.[1] ?? null) : null;
}

/**
 * Safe for an `href`.
 *
 * Returns undefined rather than a broken string, so a link with nothing usable
 * behind it can be left out instead of navigating somewhere wrong.
 */
export function tmHref(raw: string | null | undefined): string | undefined {
  return normaliseTmUrl(raw) ?? undefined;
}

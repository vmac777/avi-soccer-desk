import { describe, it, expect } from 'vitest';
import { normaliseTmUrl, tmPlayerId, tmHref } from './tmUrl';

/**
 * The exact link that broke Gabriel's enrichment for a day:
 *
 *   transfermarkt.com.br/gabriel/profil/spieler/435338
 *
 * No scheme. As an href a browser read it as a relative path and went to
 * `avi-soccer-desk.vercel.app/roster/transfermarkt.com.br/...`; the edge
 * function's `^https?://` pattern rejected it before making a request. Two
 * different wrong answers, neither of which said "there is no scheme".
 */

const SCHEMELESS = 'transfermarkt.com.br/gabriel/profil/spieler/435338';
const FULL = 'https://www.transfermarkt.com.br/gabriel/profil/spieler/435338';

describe('normaliseTmUrl', () => {
  it('adds the scheme a pasted link is missing', () => {
    expect(normaliseTmUrl(SCHEMELESS))
      .toBe('https://transfermarkt.com.br/gabriel/profil/spieler/435338');
  });

  it('leaves a complete link alone', () => {
    expect(normaliseTmUrl(FULL)).toBe(FULL);
  });

  it('accepts every host Transfermarkt uses', () => {
    expect(normaliseTmUrl('https://www.transfermarkt.com/x/profil/spieler/1')).not.toBeNull();
    expect(normaliseTmUrl('https://www.transfermarkt.com.br/x/profil/spieler/1')).not.toBeNull();
    expect(normaliseTmUrl('https://www.transfermarkt.de/x/profil/spieler/1')).not.toBeNull();
  });

  it('copes with the whitespace a paste brings along', () => {
    expect(normaliseTmUrl(`  ${SCHEMELESS}  `)).not.toBeNull();
  });

  it('is null for anything that is not a player profile', () => {
    expect(normaliseTmUrl('')).toBeNull();
    expect(normaliseTmUrl(null)).toBeNull();
    expect(normaliseTmUrl('Gabriel Magalhaes')).toBeNull();
    expect(normaliseTmUrl('https://example.com/gabriel/profil/spieler/1')).toBeNull();
    // A club page is a Transfermarkt URL, but not a player.
    expect(normaliseTmUrl('https://www.transfermarkt.com/arsenal/startseite/verein/11')).toBeNull();
  });
});

describe('tmPlayerId', () => {
  it('reads the id through a missing scheme', () => {
    expect(tmPlayerId(SCHEMELESS)).toBe('435338');
    expect(tmPlayerId(FULL)).toBe('435338');
  });

  it('is null when there is no player behind the link', () => {
    expect(tmPlayerId('not a url')).toBeNull();
  });
});

describe('tmHref', () => {
  it('never returns a string a browser would treat as relative', () => {
    // This is the whole bug: an href must be absolute or absent.
    const href = tmHref(SCHEMELESS)!;
    expect(href.startsWith('https://')).toBe(true);
  });

  it('is undefined rather than broken, so the link can be left out', () => {
    expect(tmHref('rubbish')).toBeUndefined();
    expect(tmHref(null)).toBeUndefined();
  });
});

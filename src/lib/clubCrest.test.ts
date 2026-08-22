import { describe, it, expect } from 'vitest';
import { crestUrl, tmClubId, clubInitials } from './clubCrest';

describe('tmClubId', () => {
  it('reads the club id out of the shipped Transfermarkt lookup', () => {
    // Athletico PR is /verein/679 in t1_club_tm_lookup.json.
    expect(tmClubId('Athletico PR')).toBe('679');
  });

  it('is null for a club the lookup does not cover', () => {
    expect(tmClubId('A Club Nobody Has Heard Of')).toBeNull();
    expect(tmClubId(null)).toBeNull();
    expect(tmClubId('')).toBeNull();
  });
});

describe('crestUrl', () => {
  it('derives a crest from the club id we already ship', () => {
    expect(crestUrl('Athletico PR')).toBe(
      'https://tmssl.akamaized.net/images/wappen/head/679.png',
    );
  });

  it('lets a stored crest override the derived one', () => {
    expect(crestUrl('Athletico PR', 'https://example.com/crest.png'))
      .toBe('https://example.com/crest.png');
  });

  it('ignores a stored URL with no scheme rather than rendering a relative src', () => {
    // The Transfermarkt bug in a new place: a schemeless src resolves against
    // our own origin, so the crest 404s and the club looks like it has none.
    expect(crestUrl('Athletico PR', 'example.com/crest.png'))
      .toBe('https://tmssl.akamaized.net/images/wappen/head/679.png');
    expect(crestUrl('Unknown Club', 'example.com/crest.png')).toBeNull();
  });

  it('is null when there is neither, so the caller draws initials', () => {
    expect(crestUrl('Unknown Club')).toBeNull();
    expect(crestUrl(null, null)).toBeNull();
  });
});

describe('clubInitials', () => {
  it('takes one initial per word for a multi-word club', () => {
    expect(clubInitials('Red Bull Bragantino')).toBe('RBB');
    expect(clubInitials('Manchester United')).toBe('MU');
  });

  it('takes the first three letters of a single-word club', () => {
    expect(clubInitials('Botafogo')).toBe('BOT');
    expect(clubInitials('Palmeiras')).toBe('PAL');
  });

  it('drops the suffixes and articles that would eat the three slots', () => {
    // "Vasco da Gama" is VG to anyone who follows it, not VDG.
    expect(clubInitials('Vasco da Gama')).toBe('VG');
    expect(clubInitials('Arsenal FC')).toBe('ARS');
  });

  it('never renders an empty disc', () => {
    expect(clubInitials(null)).toBe('—');
    expect(clubInitials('   ')).toBe('—');
    // Punctuation-only would otherwise leave the disc blank.
    expect(clubInitials('!!!')).toBe('!!!'.slice(0, 3).toUpperCase());
  });
});

import { describe, it, expect } from 'vitest';
import { pitchArgsFromShortlist, requirementSummary } from './shortlistToPitch';
import type { PitchableContact, PitchablePlayer } from './shortlistToPitch';

/**
 * Picking the wrong counterparty is expensive and quiet: the pitch opens
 * against the wrong club, the pairing uniqueness accepts it because it is a
 * genuinely different triple, and nobody notices until somebody rings the
 * wrong sporting director.
 */

const contact = (over: Partial<PitchableContact> & { id: string; club: string }): PitchableContact => over;

const player = (over: Partial<PitchablePlayer> = {}): PitchablePlayer => ({
  id: 'player-1',
  name: 'A Player',
  ...over,
});

const base = {
  player: player({ current_club: 'Santos' }),
  buyingClubName: 'Palmeiras',
  reportedByContactId: null,
  contacts: [] as PitchableContact[],
  requirementSummary: 'LB, ≤ €4.0m',
};

describe('pitchArgsFromShortlist', () => {
  it('goes back to the person who reported the need', () => {
    const args = pitchArgsFromShortlist({
      ...base,
      reportedByContactId: 'sd-1',
      contacts: [
        contact({ id: 'sd-1', club: 'Palmeiras' }),
        contact({ id: 'scout-1', club: 'Palmeiras' }),
      ],
    });
    expect(args.buying_contact_id).toBe('sd-1');
  });

  it('falls back to the primary when that person has left', () => {
    const args = pitchArgsFromShortlist({
      ...base,
      reportedByContactId: 'departed-sd',
      contacts: [
        contact({ id: 'scout-1', club: 'Palmeiras' }),
        contact({ id: 'sd-2', club: 'Palmeiras', is_primary: true }),
      ],
    });
    expect(args.buying_contact_id).toBe('sd-2');
  });

  it('resolves the selling side when exactly one contact is there', () => {
    const args = pitchArgsFromShortlist({
      ...base,
      contacts: [contact({ id: 'santos-1', club: 'Santos' })],
    });
    expect(args.contact_id).toBe('santos-1');
  });

  it('leaves the selling side blank rather than guessing between several', () => {
    // Two people at the club and no primary: the agent picks, we do not.
    const args = pitchArgsFromShortlist({
      ...base,
      contacts: [
        contact({ id: 'santos-1', club: 'Santos' }),
        contact({ id: 'santos-2', club: 'Santos' }),
      ],
    });
    expect(args.contact_id).toBeNull();
  });

  it('prefers the primary when there are several', () => {
    const args = pitchArgsFromShortlist({
      ...base,
      contacts: [
        contact({ id: 'santos-1', club: 'Santos' }),
        contact({ id: 'santos-2', club: 'Santos', is_primary: true }),
      ],
    });
    expect(args.contact_id).toBe('santos-2');
  });

  it('sells from the parent club, not the club he is on loan at', () => {
    // Alerrandro plays for one club and belongs to another; the registration
    // holder is who you negotiate the fee with.
    const args = pitchArgsFromShortlist({
      ...base,
      player: player({ current_club: 'Vitória', owner_club: 'Internacional' }),
      contacts: [
        contact({ id: 'vitoria-1', club: 'Vitória' }),
        contact({ id: 'inter-1', club: 'Internacional' }),
      ],
    });
    expect(args.contact_id).toBe('inter-1');
  });

  it('matches club names case-insensitively', () => {
    const args = pitchArgsFromShortlist({
      ...base,
      contacts: [contact({ id: 'santos-1', club: '  santos ' })],
    });
    expect(args.contact_id).toBe('santos-1');
  });

  it('leaves a free agent with no selling side', () => {
    const args = pitchArgsFromShortlist({
      ...base,
      player: player({ current_club: null, owner_club: null }),
      contacts: [contact({ id: 'palmeiras-1', club: 'Palmeiras' })],
    });
    expect(args.contact_id).toBeNull();
    // Still a valid pitch: the buying side alone satisfies the counterparty rule.
    expect(args.buying_contact_id).toBe('palmeiras-1');
  });

  it('says where the pitch came from', () => {
    const args = pitchArgsFromShortlist(base);
    expect(args.notes).toBe('Shortlisted to Palmeiras for: LB, ≤ €4.0m');
  });
});

describe('requirementSummary', () => {
  const req = (over: Partial<Parameters<typeof requirementSummary>[0]> = {}) => ({
    position: 'LB', age_min: null, age_max: null, budget_max: null, foot: null, ...over,
  });

  it('reads as an agent would say it', () => {
    expect(requirementSummary(req({ age_min: 21, age_max: 26, budget_max: 4_000_000, foot: 'Left' })))
      .toBe('LB, 21–26, ≤ €4.0m, Left-footed');
  });

  it('handles a one-sided age band', () => {
    expect(requirementSummary(req({ age_max: 23 }))).toBe('LB, under 24');
    expect(requirementSummary(req({ age_min: 28 }))).toBe('LB, 28+');
  });

  it('is just the position when nothing else was stated', () => {
    expect(requirementSummary(req())).toBe('LB');
  });
});

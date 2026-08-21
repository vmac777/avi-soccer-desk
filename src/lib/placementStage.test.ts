import { describe, it, expect } from 'vitest';
import { deadSide, stageFromTracks, suggestedStage, suggestionReason, type Tracks } from './placementStage';

const t = (over: Partial<Tracks> = {}): Tracks =>
  ({ selling: 'none', buying: 'none', player: 'none', ...over });

describe('stageFromTracks', () => {
  it('says nothing when nothing has started', () => {
    expect(stageFromTracks(t())).toBeNull();
  });

  it('reads a first approach as an enquiry', () => {
    expect(stageFromTracks(t({ selling: 'enquired' }))).toBe('Enquiry');
    expect(stageFromTracks(t({ buying: 'sounded_out' }))).toBe('Enquiry');
  });

  it('reads a named price or a bid as a live negotiation', () => {
    expect(stageFromTracks(t({ selling: 'price_set' }))).toBe('Negotiation');
    expect(stageFromTracks(t({ buying: 'bid_made' }))).toBe('Negotiation');
  });

  it('reads either half agreed as closing', () => {
    expect(stageFromTracks(t({ selling: 'fee_agreed' }))).toBe('Closing');
    expect(stageFromTracks(t({ buying: 'terms_agreed' }))).toBe('Closing');
  });

  // Everything agreed still is not signed: a medical, a work permit and a
  // registration deadline all sit between here and done.
  it('does not call an all-agreed deal signed', () => {
    const all = t({ selling: 'fee_agreed', buying: 'terms_agreed', player: 'agreed' });
    expect(stageFromTracks(all)).toBe('Closing');
  });
});

describe('a party pulling out', () => {
  // Each refusal means something different, and an agent's next move differs
  // with it — another buyer, another club, or a conversation with the player.
  it('distinguishes who ended it', () => {
    expect(stageFromTracks(t({ selling: 'refused' }))).toBe('Rejected');
    expect(stageFromTracks(t({ buying: 'passed' }))).toBe('Lost');
    expect(stageFromTracks(t({ player: 'declined' }))).toBe('Walked');
  });

  it('outranks progress everywhere else', () => {
    const nearlyDone = t({ selling: 'fee_agreed', buying: 'terms_agreed', player: 'declined' });
    expect(stageFromTracks(nearlyDone)).toBe('Walked');
    expect(deadSide(nearlyDone)).toBe('player');
  });

  it('names the first party out when more than one is', () => {
    expect(deadSide(t({ selling: 'refused', buying: 'passed' }))).toBe('selling');
  });
});

describe('suggestedStage', () => {
  it('stays quiet when the stage already matches', () => {
    expect(suggestedStage(t({ selling: 'fee_agreed' }), 'Closing')).toBeNull();
  });

  it('speaks up when it does not', () => {
    expect(suggestedStage(t({ selling: 'fee_agreed' }), 'Enquiry')).toBe('Closing');
  });

  it('says why', () => {
    expect(suggestionReason(t({ player: 'declined' }))).toContain('player');
    expect(suggestionReason(t({ selling: 'fee_agreed', buying: 'terms_agreed' }))).toContain('both');
  });
});

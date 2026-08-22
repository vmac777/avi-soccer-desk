import { feeBandLabel, positionLabel } from '@/lib/matching';

/**
 * Turning a shortlisted player into a pitch.
 *
 * A pitch is a three-way conversation: the player, the club that holds him,
 * and the club being approached. A shortlist entry already knows two of those
 * — the player, and the club whose need he was shortlisted against. This works
 * out the third and hands the whole thing to `useAddBuyPitch`, which owns
 * everything after that: the opening stage, the three tracks, reopen
 * semantics, and the pairing uniqueness.
 *
 * Kept separate from the hook because picking the right counterparty out of a
 * thousand contacts is the part that can be wrong, and the part worth testing.
 */

export interface PitchableContact {
  id: string;
  club: string;
  is_primary?: boolean;
}

export interface PitchablePlayer {
  id: string;
  name: string;
  /** Who holds the registration. On loan, this is not who he plays for. */
  owner_club?: string | null;
  current_club?: string | null;
}

export interface PitchArgs {
  scouted_target_id: string;
  contact_id: string | null;
  buying_contact_id: string | null;
  notes: string;
}

/** Case-insensitive, because the contact book and the roster disagree on caps. */
function atClub(contacts: PitchableContact[], club: string | null | undefined) {
  if (!club) return [];
  const target = club.trim().toLowerCase();
  if (!target) return [];
  return contacts.filter((c) => (c.club ?? '').trim().toLowerCase() === target);
}

/**
 * One contact at a club, or none.
 *
 * With several people at a club, the primary is the one you ring. Without a
 * primary, guessing is worse than leaving it blank — the pitch panel lets the
 * agent pick, and a wrong counterparty on a live deal is expensive to notice.
 */
function soleOrPrimary(candidates: PitchableContact[]): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;
  const primary = candidates.find((c) => c.is_primary);
  return primary ? primary.id : null;
}

export function pitchArgsFromShortlist(input: {
  player: PitchablePlayer;
  /** The club whose need this is — the buying side. */
  buyingClubName: string | null;
  /** Who reported the need, if that person is still on the books. */
  reportedByContactId: string | null;
  contacts: PitchableContact[];
  /** Shorthand for the need, e.g. "LB, ≤€4m". Goes into the pitch note. */
  requirementSummary: string;
}): PitchArgs {
  const { player, buyingClubName, reportedByContactId, contacts, requirementSummary } = input;

  // The person who told us about the need is the right person to go back to.
  // If they have gone, fall back to whoever else is at that club.
  const buyingCandidates = atClub(contacts, buyingClubName);
  const buying_contact_id = reportedByContactId
    && buyingCandidates.some((c) => c.id === reportedByContactId)
      ? reportedByContactId
      : soleOrPrimary(buyingCandidates);

  // The selling side is whoever holds his registration, which on a loan is the
  // parent club and not the one he turns out for.
  const sellingClub = player.owner_club || player.current_club;
  const contact_id = soleOrPrimary(atClub(contacts, sellingClub));

  const where = buyingClubName ? ` to ${buyingClubName}` : '';
  return {
    scouted_target_id: player.id,
    contact_id,
    buying_contact_id,
    notes: `Shortlisted${where} for: ${requirementSummary}`,
  };
}

/** The need in one line, for a pitch note or a list row. */
export function requirementSummary(req: {
  position: string;
  age_min: number | null;
  age_max: number | null;
  budget_min?: number | null;
  budget_max: number | null;
  foot: string | null;
}): string {
  // The label the agent clicked, not the code we store — a card reading "CF"
  // for a chip that said "ST / CF" makes the reader check whether it took.
  const bits: string[] = [positionLabel(req.position) || 'Any position'];

  if (req.age_min != null && req.age_max != null) bits.push(`${req.age_min}–${req.age_max}`);
  else if (req.age_max != null) bits.push(`under ${req.age_max + 1}`);
  else if (req.age_min != null) bits.push(`${req.age_min}+`);

  // The band, when the club gave one. "≤ €10m" hides the half of the ask that
  // says which players are too small for it.
  const fee = feeBandLabel({ budget_min: req.budget_min ?? null, budget_max: req.budget_max });
  if (fee) bits.push(fee);
  if (req.foot) bits.push(`${req.foot}-footed`);

  return bits.join(', ');
}

/**
 * A pitch needs a club on one side or the other.
 *
 * Both are individually optional because real deals start one-sided — a free
 * agent has no selling club, and an approach usually begins with a buying club
 * before the current one hears anything about it. Neither side is not a deal,
 * and the database says the same thing with a CHECK constraint; this is the
 * same rule stated where the message can be a sentence rather than a
 * constraint violation.
 */
export function hasCounterparty(contactId?: string | null, buyingContactId?: string | null): boolean {
  return !!(contactId || buyingContactId);
}

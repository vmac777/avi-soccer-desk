import { useMemo, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import type { Club } from '@/hooks/useClubsAndSources';

export interface PickableContact {
  id: string;
  market: string;
  club: string;
  contact_person: string;
  role?: string;
}

/**
 * Country → club → person.
 *
 * A single select over the whole directory is roughly a thousand options, which
 * is not a list anyone reads — you scroll past Argentina looking for Ajax. An
 * agent already knows which country and which club before they know which
 * person, so ask in that order and each step stays short.
 *
 * Clubs come from the clubs table rather than from the contacts, so a club you
 * hold nobody at still appears. That is the useful case: it is the club you need
 * a way into, and it would be invisible if the list were built from contacts.
 */
export default function ClubContactPicker({
  contacts,
  clubs,
  value,
  onChange,
  onCreateAtClub,
  excludeClub,
  emptyLabel = 'None',
}: {
  contacts: PickableContact[];
  clubs: Club[];
  value: string;
  onChange: (contactId: string) => void;
  /**
   * Called with the club and the typed name when the chosen club has nobody in
   * it yet. Returning a contact id selects them.
   */
  onCreateAtClub?: (club: Club, personName: string) => Promise<string | null>;
  /** A club that cannot be the answer here — the other side of the same deal. */
  excludeClub?: string;
  emptyLabel?: string;
}) {
  const [country, setCountry] = useState('');
  const [club, setClub] = useState('');
  const [newPerson, setNewPerson] = useState('');
  const [creating, setCreating] = useState(false);

  // Re-entering an existing choice should land where that person is, not at the
  // top of the alphabet.
  const selected = contacts.find(c => c.id === value);
  useEffect(() => {
    if (!selected) return;
    const row = clubs.find(cl => cl.name === selected.club);
    setCountry(row?.country ?? countryFromMarket(selected.market));
    setClub(selected.club);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const countries = useMemo(() => {
    const set = new Set<string>();
    clubs.forEach(c => { if (c.country) set.add(c.country); });
    // A club with no country recorded would otherwise be unreachable.
    contacts.forEach(c => { const k = countryFromMarket(c.market); if (k) set.add(k); });
    return [...set].sort();
  }, [clubs, contacts]);

  const clubsInCountry = useMemo(() => {
    if (!country) return [];
    const fromTable = clubs.filter(c => (c.country ?? countryFromMarket(c.league ?? '')) === country);
    const names = new Set(fromTable.map(c => c.name));
    // Contacts filed under a club the table does not have still need reaching.
    const orphans = contacts
      .filter(c => countryFromMarket(c.market) === country && c.club && !names.has(c.club))
      .map(c => ({ id: c.club, name: c.club, country, league: c.market } as Club));
    const seen = new Set<string>();
    return [...fromTable, ...orphans]
      .filter(c => c.name !== excludeClub && !seen.has(c.name) && seen.add(c.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [country, clubs, contacts, excludeClub]);

  const peopleAtClub = useMemo(
    () => contacts
      .filter(c => c.club === club && c.contact_person)
      .sort((a, b) => a.contact_person.localeCompare(b.contact_person)),
    [contacts, club],
  );

  const clubRow = clubs.find(c => c.name === club);

  const addPerson = async () => {
    const name = newPerson.trim();
    if (!name || !clubRow || !onCreateAtClub || creating) return;
    setCreating(true);
    try {
      const id = await onCreateAtClub(clubRow, name);
      if (id) { onChange(id); setNewPerson(''); }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <select
        value={country}
        onChange={e => { setCountry(e.target.value); setClub(''); onChange(''); }}
        className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
      >
        <option value="">{emptyLabel} — pick a country…</option>
        {countries.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {country && (
        <select
          value={club}
          onChange={e => { setClub(e.target.value); onChange(''); setNewPerson(''); }}
          className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
        >
          <option value="">Pick a club… ({clubsInCountry.length})</option>
          {clubsInCountry.map(c => (
            <option key={c.name} value={c.name}>
              {c.name}{c.league ? ` — ${c.league}` : ''}
            </option>
          ))}
        </select>
      )}

      {club && peopleAtClub.length > 0 && (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
        >
          <option value="">Pick who you are dealing with…</option>
          {peopleAtClub.map(c => (
            <option key={c.id} value={c.id}>
              {c.contact_person}{c.role ? ` — ${c.role}` : ''}
            </option>
          ))}
        </select>
      )}

      {/* Always available, not only when the club is empty.
          Holding one person at a club does not mean they are the person for
          this deal — a sporting director is not the academy lead — and being
          able to name someone here is the difference between logging the deal
          now and going to the Contacts page first. */}
      {club && onCreateAtClub && clubRow && (
        <div className="flex gap-1.5">
          <Input
            value={newPerson}
            onChange={e => setNewPerson(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addPerson(); } }}
            placeholder={peopleAtClub.length === 0
              ? `Nobody at ${club} yet — name them`
              : `Someone else at ${club}`}
            className="h-8 text-xs flex-1"
          />
          <button
            type="button"
            disabled={!newPerson.trim() || creating}
            onClick={() => void addPerson()}
            className="h-8 px-2 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {creating ? '…' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "Argentina - LPF" → "Argentina". The directory files leagues this way.
 *
 * Split on a hyphen with space around it, not a bare one — "Bosnia-Herzegovina"
 * would otherwise be cut in half and its clubs filed under a country that does
 * not exist.
 */
export function countryFromMarket(market?: string | null): string {
  if (!market) return '';
  const [country] = market.split(/\s+[-–]\s+/);
  return (country ?? '').trim();
}

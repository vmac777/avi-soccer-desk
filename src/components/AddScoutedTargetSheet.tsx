import { useState, useMemo, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link as LinkIcon, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { normaliseTmUrl } from '@/lib/tmUrl';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useContacts } from '@/hooks/useData';
import { useAddScoutedTarget } from '@/hooks/useBuyData';
import { useEnrichScoutedTarget } from '@/hooks/useEnrichScoutedTarget';

const TM_URL_RE = /^https?:\/\/[^\s]*transfermarkt\.[a-z.]+\/.+\/spieler\/(\d+)/i;

function parseTmUrl(url: string): { name: string; tmPlayerId: string } | null {
  const m = url.match(TM_URL_RE);
  if (!m) return null;
  const tmPlayerId = m[1];
  // Slug is the path segment before "/spieler/"
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const spielerIdx = parts.findIndex(p => p === 'spieler');
    // TM URLs are /{name-slug}/profil/spieler/{id}. The slug sits TWO segments
    // before "spieler"; the segment immediately before is always the literal
    // word "profil" (or a localized variant). Fall back gracefully.
    let slug = '';
    if (spielerIdx >= 2) {
      const prev = parts[spielerIdx - 1]?.toLowerCase() ?? '';
      slug = /^(profil|profile|perfil|profilo)$/.test(prev)
        ? parts[spielerIdx - 2]
        : parts[spielerIdx - 1];
    } else if (spielerIdx === 1) {
      slug = parts[0];
    }
    const name = slug
      .split('-')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return { name, tmPlayerId };
  } catch {
    return null;
  }
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const CLUB_NOT_LISTED = '__OTHER__';

export function AddScoutedTargetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: contacts = [] } = useContacts();
  const addMutation = useAddScoutedTarget();
  const { start: startEnrichment } = useEnrichScoutedTarget();

  const [country, setCountry] = useState('');
  const [league, setLeague] = useState('');
  const [club, setClub] = useState('');
  const [customClub, setCustomClub] = useState('');
  const [tmUrl, setTmUrl] = useState('');
  const [parsed, setParsed] = useState<{ name: string; tmPlayerId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset when sheet closes
  useEffect(() => {
    if (!open) {
      setCountry(''); setLeague(''); setClub(''); setCustomClub('');
      setTmUrl(''); setParsed(null); setSubmitting(false);
    }
  }, [open]);

  // Derive Country -> League -> Club from contacts.market (split on " - ")
  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      const m = (c.market || '').split(' - ');
      if (m[0]) set.add(m[0].trim());
    }
    return Array.from(set).sort();
  }, [contacts]);

  const leagues = useMemo(() => {
    if (!country) return [];
    const set = new Set<string>();
    for (const c of contacts) {
      const [co, ...rest] = (c.market || '').split(' - ');
      const lg = rest.join(' - ').trim();
      if (co?.trim() === country && lg) set.add(lg);
    }
    return Array.from(set).sort();
  }, [contacts, country]);

  const clubs = useMemo(() => {
    if (!country || !league) return [];
    const market = `${country} - ${league}`;
    const set = new Set<string>();
    for (const c of contacts) {
      if (c.market === market && c.club) set.add(c.club);
    }
    return Array.from(set).sort();
  }, [contacts, country, league]);

  const tmValid = !!parsed;
  const teamValue = club === CLUB_NOT_LISTED ? customClub.trim() : club;
  const market = country && league ? `${country} - ${league}` : '';

  // Look up TR mapping for the selected team so the user knows up-front
  // whether TR enrichment will work.
  const { data: trMapping, isFetching: trMappingLoading } = useQuery({
    queryKey: ['scouted-target-tr-mapping', teamValue, market],
    enabled: !!teamValue && !!market,
    queryFn: async () => {
      const { data } = await supabase
        .from('clubs')
        .select('name, tr_team_id, tr_competition_id')
        .eq('name', teamValue)
        .eq('league', market)
        .maybeSingle();
      if (data) return data as any;
      // Fallback: name only
      const { data: fb } = await supabase
        .from('clubs')
        .select('name, tr_team_id, tr_competition_id')
        .eq('name', teamValue)
        .limit(1)
        .maybeSingle();
      return (fb as any) ?? null;
    },
  });

  const trMappingStatus: 'mapped' | 'unmapped' | 'unknown' = !teamValue || trMappingLoading
    ? 'unknown'
    : trMapping?.tr_team_id && trMapping?.tr_competition_id
      ? 'mapped'
      : 'unmapped';

  const canSubmit = !!country && !!league && !!teamValue && tmValid && !submitting;

  const handleTmBlur = () => {
    const p = parseTmUrl(tmUrl.trim());
    setParsed(p);
    if (tmUrl && !p) toast.error('Not a valid Transfermarkt player URL');
  };

  const handleSubmit = async () => {
    if (!canSubmit || !parsed) return;
    setSubmitting(true);
    try {
      const market = `${country} - ${league}`;
      const created = await addMutation.mutateAsync({
        name: parsed.name,
        slug: `${slugify(parsed.name)}-${parsed.tmPlayerId}`,
        position: '',
        age: null,
        date_of_birth: null,
        nationality: '',
        league: market,
        current_club: teamValue,
        contract_end: null,
        market_value: null,
        height: '',
        foot: '',
        photo_url: '',
        salary_estimate: null,
        agent_name: '',
        agent_contact: '',
        priority_ranking: 'Medium',
        notes: '',
        tm_link: normaliseTmUrl(tmUrl) ?? tmUrl.trim(),
        has_valuation: false,
        valuation_url: '',
        tm_player_id: parsed.tmPlayerId,
        tm_status: 'pending',
        tr_status: 'pending',
      } as any) as any;
      toast.success(`Added ${parsed.name} — enriching…`);
      onClose();
      const newId = created?.id as string | undefined;
      if (newId) {
        startEnrichment({
          targetId: newId,
          tmUrl: tmUrl.trim(),
          name: parsed.name,
          current_club: teamValue,
          league: market,
        }).catch(() => { /* hook handles failures */ });
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to add target');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none p-0 flex flex-col"
        style={{ width: '500px' }}
      >
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <SheetTitle className="text-[11px] tracking-[0.15em] font-bold text-primary uppercase">
              Add Scouted Target
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Pick the player's current club, then paste their Transfermarkt link.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Step 1: Cascade */}
            <section className="space-y-3">
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Step 1 — Club
              </h3>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Country</label>
                <Select value={country} onValueChange={(v) => { setCountry(v); setLeague(''); setClub(''); setCustomClub(''); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {countries.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">League</label>
                <Select value={league} onValueChange={(v) => { setLeague(v); setClub(''); setCustomClub(''); }} disabled={!country}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={country ? 'Select league' : 'Pick a country first'} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {leagues.length === 0 && country && (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No leagues for this country in contacts</div>
                    )}
                    {leagues.map(l => <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                {country && leagues.length === 0 && (
                  <Input
                    autoComplete="off"
                    value={league}
                    onChange={(e) => setLeague(e.target.value)}
                    placeholder="Type league name"
                    className="h-9 text-xs mt-1"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Team</label>
                <Select value={club} onValueChange={(v) => { setClub(v); if (v !== CLUB_NOT_LISTED) setCustomClub(''); }} disabled={!league}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={league ? 'Select team' : 'Pick a league first'} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {clubs.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    <SelectItem value={CLUB_NOT_LISTED} className="text-xs text-primary">+ Club not listed</SelectItem>
                  </SelectContent>
                </Select>
                {club === CLUB_NOT_LISTED && (
                  <Input
                    autoComplete="off"
                    value={customClub}
                    onChange={(e) => setCustomClub(e.target.value)}
                    placeholder="Type club name"
                    className="h-9 text-xs mt-1"
                  />
                )}
                {teamValue && (
                  <div className="text-[11px] pt-1 flex items-center gap-1.5">
                    {trMappingStatus === 'mapped' && (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                        <span className="text-muted-foreground">
                          TR team mapped — enrichment will run
                        </span>
                      </>
                    )}
                    {trMappingStatus === 'unmapped' && (
                      <>
                        <AlertCircle className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Club not mapped to TR — TR enrichment will be skipped
                        </span>
                      </>
                    )}
                    {trMappingStatus === 'unknown' && trMappingLoading && (
                      <span className="text-muted-foreground">Checking TR mapping…</span>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Step 2: TM link */}
            <section className="space-y-3">
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Step 2 — Transfermarkt
              </h3>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <LinkIcon className="h-3 w-3" /> TM Player URL
                </label>
                <Input
                  autoComplete="off"
                  value={tmUrl}
                  onChange={(e) => { setTmUrl(e.target.value); setParsed(null); }}
                  onBlur={handleTmBlur}
                  placeholder="https://www.transfermarkt.com/.../spieler/12345"
                  className="h-9 text-xs font-mono"
                />
                {parsed && (
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-1">
                    <span>Parsed:</span>
                    <span className="text-foreground">{parsed.name}</span>
                    <span className="font-mono text-primary">#{parsed.tmPlayerId}</span>
                    <a
                      href={tmUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} className="h-9 text-xs">Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit} className="h-9 text-xs">
              {submitting ? 'Adding…' : 'Add & Enrich'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

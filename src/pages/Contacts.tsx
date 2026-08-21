import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useContacts, useLogTouch, useSetPrimaryContact } from '@/hooks/useData';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { healthColor, healthBg, stagePill, formatDaysAgo } from '@/lib/contactUtils';
import ContactDetail from '@/components/ContactDetail';
import NewContactDialog from '@/components/NewContactDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Phone, Pencil, Plus, ChevronRight, Linkedin, MessageCircle, Star } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import type { ContactEnriched } from '@/lib/supabase';
import ClubTmLinks from '@/components/ClubTmLinks';
import { useClubNewsCounts, urgencyClasses } from '@/hooks/useNewsCounts';
import NewsFlagBadge from '@/components/NewsFlagBadge';
import { usePromotedClubs, useRelegatedClubs } from '@/hooks/usePromotedClubs';
import { useClubs } from '@/hooks/useClubsAndSources';

const STAGES = ['', 'Contacted - No Answer', 'Contacted', 'Offered', 'Negotiating', 'Closed Won', 'Closed Lost', 'Dormant'];

type Level = 'leagues' | 'clubs' | 'contacts';

interface ClubData {
  club: string;
  contacts: ContactEnriched[];
  contactCount: number;
}

interface LeagueData {
  league: string;
  clubs: ClubData[];
  totalContacts: number;
  stageCounts: Record<string, number>;
}

const PrimaryStarButton = ({ contact }: { contact: ContactEnriched }) => {
  const setPrimary = useSetPrimaryContact();
  const isPrimary = !!(contact as any).is_primary;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setPrimary.mutate({ contactId: contact.id!, club: contact.club!, value: !isPrimary });
      }}
      className="p-0 border-0 bg-transparent cursor-pointer hover:opacity-80"
      title={isPrimary ? 'Remove as primary contact' : 'Set as primary contact'}
    >
      <Star className={cn('h-3.5 w-3.5', isPrimary ? 'fill-current' : '')} style={{ color: isPrimary ? '#c8952a' : 'var(--muted-foreground)' }} />
    </button>
  );
};

const ContactsPage = () => {
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: contacts = [], isLoading } = useContacts();
  const logTouch = useLogTouch();
  const { displayName, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  const [level, setLevel] = useState<Level>('leagues');
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedClub, setSelectedClub] = useState('');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [whoFilter, setWhoFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('selected') || null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Build hierarchy
  const { data: allClubs = [] } = useClubs();

  const leagues = useMemo(() => {
    const leagueMap: Record<string, Record<string, ContactEnriched[]>> = {};

    // Seed from the clubs table first, so a league shows every club in it and
    // not only the ones somebody has already spoken to. A club you hold no
    // contact for is the most useful cell on this page — it is the gap in the
    // network — and building the grid from contacts alone hides exactly those.
    allClubs.forEach(c => {
      if (!c.league || !c.name) return;
      if (!leagueMap[c.league]) leagueMap[c.league] = {};
      if (!leagueMap[c.league][c.name]) leagueMap[c.league][c.name] = [];
    });

    contacts.forEach(c => {
      if (!leagueMap[c.market]) leagueMap[c.market] = {};
      if (!leagueMap[c.market][c.club]) leagueMap[c.market][c.club] = [];
      leagueMap[c.market][c.club].push(c);
    });

    return Object.entries(leagueMap)
      .map(([league, clubsMap]): LeagueData => {
        const clubs = Object.entries(clubsMap)
          .map(([club, clubContacts]): ClubData => ({
            club,
            contacts: clubContacts,
            contactCount: clubContacts.length,
          }))
          .sort((a, b) => a.club.localeCompare(b.club));

        const stageCounts: Record<string, number> = {};
        STAGES.forEach(s => { stageCounts[s] = 0; });
        clubs.forEach(cl => cl.contacts.forEach(c => {
          if (c.stage && stageCounts[c.stage] !== undefined) stageCounts[c.stage]++;
        }));

        return {
          league,
          clubs,
          totalContacts: clubs.reduce((s, cl) => s + cl.contactCount, 0),
          stageCounts,
        };
      })
      .sort((a, b) => a.league.localeCompare(b.league));
  }, [contacts, allClubs]);

  const globalStageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGES.forEach(s => { counts[s] = contacts.filter(c => c.stage === s).length; });
    return counts;
  }, [contacts]);

  // Filtered leagues
  const filteredLeagues = useMemo(() => {
    let result = leagues;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        l.league.toLowerCase().includes(s) ||
        l.clubs.some(cl => cl.club.toLowerCase().includes(s) ||
          cl.contacts.some(c =>
            c.contact_person?.toLowerCase().includes(s)
          )
        )
      );
    }
    if (stageFilter) {
      const actualStage = stageFilter === '__blank' ? '' : stageFilter;
      result = result.filter(l => l.clubs.some(cl => cl.contacts.some(c => c.stage === actualStage)));
    }
    if (whoFilter) {
      result = result.filter(l => l.clubs.some(cl => cl.contacts.some(c => c.who_spoke === whoFilter)));
    }
    return result;
  }, [leagues, search, stageFilter, whoFilter]);

  // Current league/club data
  const currentLeague = leagues.find(l => l.league === selectedLeague);
  const currentClub = currentLeague?.clubs.find(cl => cl.club === selectedClub);

  const filteredClubs = useMemo(() => {
    if (!currentLeague) return [];
    let clubs = currentLeague.clubs;
    if (stageFilter) { const actualStage = stageFilter === '__blank' ? '' : stageFilter; clubs = clubs.filter(cl => cl.contacts.some(c => c.stage === actualStage)); }
    if (whoFilter) clubs = clubs.filter(cl => cl.contacts.some(c => c.who_spoke === whoFilter));
    if (search) {
      const s = search.toLowerCase();
      clubs = clubs.filter(cl =>
        cl.club.toLowerCase().includes(s) ||
        cl.contacts.some(c => c.contact_person?.toLowerCase().includes(s))
      );
    }
    return clubs;
  }, [currentLeague, stageFilter, whoFilter, search]);

  const filteredContacts = useMemo(() => {
    if (!currentClub) return [];
    let list = currentClub.contacts;
    if (stageFilter) { const actualStage = stageFilter === '__blank' ? '' : stageFilter; list = list.filter(c => c.stage === actualStage); }
    if (whoFilter) list = list.filter(c => c.who_spoke === whoFilter);
    return list;
  }, [currentClub, stageFilter, whoFilter]);

  // Per-club news flags (admin only, only when viewing the clubs grid for a league)
  const newsLeague = isAdmin && level === 'clubs' ? selectedLeague : null;
  const { data: clubNewsCounts = {} } = useClubNewsCounts(newsLeague);
  const { isPromoted } = usePromotedClubs();
  const { isRelegated } = useRelegatedClubs();

  const { existingClubs, relegatedClubs, promotedClubs } = useMemo(() => {
    const existing: ClubData[] = [];
    const relegated: ClubData[] = [];
    const promoted: ClubData[] = [];
    filteredClubs.forEach((cl) => {
      if (isPromoted(selectedLeague, cl.club)) promoted.push(cl);
      else if (isRelegated(selectedLeague, cl.club)) relegated.push(cl);
      else existing.push(cl);
    });
    return { existingClubs: existing, relegatedClubs: relegated, promotedClubs: promoted };
  }, [filteredClubs, isPromoted, isRelegated, selectedLeague]);

  const handleLogTouch = (e: React.MouseEvent, contactId: string, club: string) => {
    e.stopPropagation();
    setFlashId(contactId);
    setTimeout(() => setFlashId(null), 1000);
    logTouch.mutate(
      { contactId, loggedBy: displayName, club },
      { onSuccess: () => toast.success(`✓ Logged touch with ${club}`) }
    );
  };

  // Auto-navigate to a league if ?market= param is set (only on initial load)
  const [hasAutoNavigated, setHasAutoNavigated] = useState(false);
  useEffect(() => {
    if (hasAutoNavigated) return;
    const marketParam = searchParams.get('market');
    if (marketParam && leagues.length > 0) {
      const match = leagues.find(l => l.league === marketParam);
      if (match) {
        setSelectedLeague(match.league);
        setLevel('clubs');
        setHasAutoNavigated(true);
      }
    }
  }, [searchParams, leagues, hasAutoNavigated]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !isTyping) {
        e.preventDefault();
        document.getElementById('contacts-search')?.focus();
      }
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !isTyping && !selectedId) {
        setShowNewDialog(true);
      }
      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else if (level === 'contacts') { setLevel('clubs'); setSelectedClub(''); }
        else if (level === 'clubs') { setLevel('leagues'); setSelectedLeague(''); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [level, selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[11px] tracking-[0.15em] font-bold text-primary uppercase">CONTACTS</h1>
        <Button
          onClick={() => setShowNewDialog(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs rounded-md"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> New Contact
        </Button>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs">
        <button
          onClick={() => { setLevel('leagues'); setSelectedLeague(''); setSelectedClub(''); }}
          className={cn('hover:text-primary transition-colors', level === 'leagues' ? 'text-primary font-medium' : 'text-muted-foreground')}
        >
          All Leagues
        </button>
        {level !== 'leagues' && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              onClick={() => { setLevel('clubs'); setSelectedClub(''); }}
              className={cn('hover:text-primary transition-colors', level === 'clubs' ? 'text-primary font-medium' : 'text-muted-foreground')}
            >
              {selectedLeague}
            </button>
          </>
        )}
        {level === 'contacts' && currentClub && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-primary font-medium">{selectedClub}</span>
            <ClubTmLinks clubName={selectedClub} />
            <span>{selectedClub}</span>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          id="contacts-search"
          placeholder={level === 'leagues' ? 'Search leagues, clubs, or contacts... ( / )' : 'Search... ( / )'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 h-8 text-xs bg-card border-border"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="h-8 text-xs bg-card border border-border rounded-md px-2 text-foreground"
        >
          <option value="">All Stages</option>
          {STAGES.map((s) => <option key={s || '__blank'} value={s}>{s || '— No Stage'}</option>)}
        </select>
        <select
          value={whoFilter}
          onChange={(e) => setWhoFilter(e.target.value)}
          className="h-8 text-xs bg-card border border-border rounded-md px-2 text-foreground"
        >
          <option value="">All Team</option>
          {teamMembers.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* Stage pills */}
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const filterVal = s === '' ? '__blank' : s;
          return (
            <button
              key={s || '__blank'}
              onClick={() => setStageFilter(stageFilter === filterVal ? '' : filterVal)}
              className={cn(
                stagePill(s),
                'cursor-pointer transition-opacity',
                stageFilter && stageFilter !== filterVal && 'opacity-40'
              )}
            >
              {s || '— No Stage'} <span className="ml-1 font-mono text-[10px]">{globalStageCounts[s]}</span>
            </button>
          );
        })}
      </div>

      {/* LEVEL 1: Leagues */}
      {level === 'leagues' && (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">League</th>
                  <th className="px-3 py-2 text-left font-medium">Clubs</th>
                  <th className="px-3 py-2 text-left font-medium">Contacts</th>
                  {STAGES.map(s => (
                    <th key={s || '__blank'} className="px-3 py-2 text-center font-medium">{s || '—'}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={3 + STAGES.length} className="px-3 py-8 text-center text-muted-foreground font-mono">Loading...</td></tr>
                ) : filteredLeagues.length === 0 ? (
                  <tr><td colSpan={3 + STAGES.length} className="px-3 py-8 text-center text-muted-foreground font-mono">0 leagues</td></tr>
                ) : (
                  filteredLeagues.map((l, i) => (
                    <tr
                      key={l.league}
                      onClick={() => { setSelectedLeague(l.league); setLevel('clubs'); }}
                      className={cn('border-b border-border/50 cursor-pointer hover:bg-surface-hover transition-colors', i % 2 === 0 && 'bg-card/50')}
                    >
                      <td className="px-3 py-2 font-medium text-foreground flex items-center gap-1">
                        {l.league} <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </td>
                      <td className="px-3 py-2 font-mono text-foreground">{l.clubs.length}</td>
                      <td className="px-3 py-2 font-mono text-foreground">{l.totalContacts}</td>
                      {STAGES.map(s => (
                        <td key={s || '__blank'} className="px-3 py-2 text-center font-mono text-muted-foreground">
                          {l.stageCounts[s] > 0 ? l.stageCounts[s] : ''}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground font-mono">
            {filteredLeagues.length} leagues · {filteredLeagues.reduce((s, l) => s + l.clubs.length, 0)} clubs · {filteredLeagues.reduce((s, l) => s + l.totalContacts, 0)} contacts
          </div>
        </div>
      )}

      {/* LEVEL 2: Clubs */}
      {level === 'clubs' && currentLeague && (() => {
        const renderCard = (club: ClubData) => {
          const stagesInClub = STAGES.filter(s => club.contacts.some(c => c.stage === s));
          const contactDates = club.contacts
            .map(c => c.last_contact)
            .filter((d): d is string => !!d)
            .map(d => new Date(d).getTime())
            .filter(t => !isNaN(t));
          const mostRecentDate = contactDates.length > 0 ? Math.max(...contactDates) : null;
          const teamDaysAgo = mostRecentDate !== null ? Math.floor((Date.now() - mostRecentDate) / (1000 * 60 * 60 * 24)) : null;
          const teamFreshnessLabel = teamDaysAgo === null ? 'Never' : `${teamDaysAgo}d ago`;
          const teamFreshnessColor = teamDaysAgo === null
            ? 'text-muted-foreground bg-muted'
            : teamDaysAgo < 10
              ? 'text-status-hot bg-status-hot/10'
              : teamDaysAgo < 30
                ? 'text-status-recent bg-status-recent/10'
                : teamDaysAgo < 90
                  ? 'text-status-warm bg-status-warm/10'
                  : 'text-status-cold bg-status-cold/10';
          const news = clubNewsCounts[club.club.toLowerCase()];
          const newsUrgency = news?.unread_count ? news.max_urgency : null;
          const { border: newsBorder } = urgencyClasses(newsUrgency);
          const phoneContacts = club.contacts.filter(c => c.phone1);
          return (
            <div
              key={club.club}
              onClick={() => { setSelectedClub(club.club); setLevel('contacts'); }}
              className={cn(
                'group bg-card border rounded-md p-3 cursor-pointer hover:bg-surface-hover hover:border-primary/30 transition-colors flex flex-col gap-2.5',
                newsBorder || 'border-border',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                  <NewsFlagBadge count={news?.unread_count ?? 0} urgency={newsUrgency} />
                  <span className="text-sm font-semibold text-foreground truncate">{club.club}</span>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                  {club.contactCount} {club.contactCount === 1 ? 'contact' : 'contacts'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  {stagesInClub.map(s => (
                    <span key={s || '__blank'} className={cn(stagePill(s), 'text-[9px] px-1.5 py-0')}>
                      {s || '—'} {club.contacts.filter(c => c.stage === s).length}
                    </span>
                  ))}
                  <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded', teamFreshnessColor)}>
                    {teamFreshnessLabel}
                  </span>
                </div>
                {phoneContacts.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {phoneContacts.slice(0, 3).map((c, i) => (
                      <TooltipProvider key={i}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`https://wa.me/${c.phone1!.replace('+', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:opacity-80"
                              onClick={e => e.stopPropagation()}
                            >
                              <MessageCircle className="h-3.5 w-3.5" style={{ color: '#25D366' }} />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">{c.contact_person}: {c.phone1}</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                    {phoneContacts.length > 3 && (
                      <span className="text-[10px] text-muted-foreground font-mono">+{phoneContacts.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-x-3 gap-y-1 flex-wrap pt-1.5 border-t border-border/50">
                <ClubTmLinks
                  clubName={club.club}
                  clubId={news?.club_id}
                  unreadCount={news?.unread_count ?? 0}
                />
                <span>{club.club}</span>
              </div>
            </div>
          );
        };

        if (filteredClubs.length === 0) {
          return <p className="text-xs text-muted-foreground font-mono text-center py-8">No clubs match filters</p>;
        }

        return (
          <div className="space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium mb-2">
                Existing Clubs <span className="font-mono ml-1">({existingClubs.length})</span>
              </div>
              {existingClubs.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono py-4">No existing clubs match filters</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {existingClubs.map(renderCard)}
                </div>
              )}
            </div>
            {relegatedClubs.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-destructive font-medium mb-2 flex items-center gap-1.5">
                  ⬇ Relegated Clubs <span className="font-mono ml-1 text-muted-foreground">({relegatedClubs.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {relegatedClubs.map(renderCard)}
                </div>
              </div>
            )}
            {promotedClubs.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium mb-2 flex items-center gap-1.5">
                  ⬆ Promoted Clubs <span className="font-mono ml-1 text-muted-foreground">({promotedClubs.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {promotedClubs.map(renderCard)}
                </div>
              </div>
            )}
          </div>
        );
      })()}


      {/* LEVEL 3: Contacts */}
      {level === 'contacts' && currentClub && (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                 <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Contact</th>
                  <th className="px-3 py-2 text-left font-medium">Who</th>
                  <th className="px-3 py-2 text-left font-medium">Stage</th>
                  <th className="px-3 py-2 text-left font-medium">Days Ago</th>
                  <th className="px-3 py-2 text-left font-medium">Interest</th>
                  <th className="px-3 py-2 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      'h-11 border-b border-border/50 cursor-pointer transition-colors duration-150',
                      'hover:bg-surface-hover',
                      i % 2 === 0 && 'bg-card/50',
                      flashId === c.id && 'animate-flash-green'
                    )}
                  >
                    <td className="px-3">
                      {c.contact_person ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <PrimaryStarButton contact={c} />
                            <span className="text-foreground">{c.contact_person}</span>
                            {c.linkedin && (
                              <a href={c.linkedin} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#0A66C2] hover:opacity-80">
                                <Linkedin className="h-3 w-3" />
                              </a>
                            )}
                            {[c.phone1, c.phone2, c.phone3].filter(Boolean).map((phone, idx) => (
                              <TooltipProvider key={idx}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a href={`https://wa.me/${phone!.replace('+', '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:opacity-80">
                                      <MessageCircle className="h-3 w-3" style={{ color: '#25D366' }} />
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">{phone}</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))}
                          </div>
                          {c.role && <span className="text-[10px] text-muted-foreground">{c.role}</span>}
                        </div>
                      ) : (
                        <span className="italic text-muted-foreground">no contact</span>
                      )}
                    </td>
                    <td className="px-3 text-muted-foreground">{c.who_spoke}</td>
                    <td className="px-3">{c.stage ? <span className={stagePill(c.stage)}>{c.stage}</span> : <span className="text-muted-foreground text-[10px]">—</span>}</td>
                    <td className="px-3">
                      <span className={cn(
                        'font-mono text-[11px] px-1.5 py-0.5 rounded',
                        healthColor(c.health_status),
                        healthBg(c.health_status)
                      )}>
                        {formatDaysAgo(c.days_since_contact)}
                      </span>
                    </td>
                    <td className="px-3">
                      {c.club_interest && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-status-hot/10 text-status-hot border border-status-hot/20">
                          {c.club_interest}
                        </span>
                      )}
                    </td>
                    <td className="px-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleLogTouch(e, c.id, c.club)}
                          className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                          title="Log Touch"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }}
                          className="p-1 rounded hover:bg-foreground/10 text-muted-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground font-mono">
            {filteredContacts.length} contacts at {selectedClub}
          </div>
        </div>
      )}

      {/* Slide-over */}
      {selectedId && (
        <ContactDetail
          contactId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showNewDialog && (
        <NewContactDialog onClose={() => setShowNewDialog(false)} />
      )}
    </div>
  );
};

export default ContactsPage;

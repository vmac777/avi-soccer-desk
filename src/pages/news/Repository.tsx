import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClubs, useClubSources, Club, ClubSource } from '@/hooks/useClubsAndSources';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronRight, ExternalLink, Newspaper, Pencil, Plus, Trash2, X, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { generateLabel } from '@/lib/sourceImport';

const norm = (s: string) =>
  s.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const isValidUrl = (u: string) => /^https?:\/\/.+/i.test(u.trim());

export default function Repository() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const clubIdParam = searchParams.get('club');
  const { data: clubs = [] } = useClubs();
  const { data: sources = [] } = useClubSources();

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [openLeagues, setOpenLeagues] = useState<Set<string>>(new Set());
  const [openClubs, setOpenClubs] = useState<Set<string>>(new Set());

  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Honor ?club=<id> deep link: auto-expand that club's league + the club itself
  useEffect(() => {
    if (!clubIdParam || clubs.length === 0) return;
    const target = clubs.find(c => c.id === clubIdParam);
    if (!target) return;
    const leagueKey = target.league || '— No league —';
    setOpenLeagues(prev => {
      const n = new Set(prev);
      n.add(leagueKey);
      return n;
    });
    setOpenClubs(prev => {
      const n = new Set(prev);
      n.add(target.id);
      return n;
    });
    if (target.league) setLeagueFilter(target.league);
    setTierFilter('all');
    setSearch('');
  }, [clubIdParam, clubs]);

  const clearClubFocus = () => {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      n.delete('club');
      return n;
    });
  };

  const sourcesByClub = useMemo(() => {
    const m: Record<string, ClubSource[]> = {};
    for (const s of sources) {
      if (!m[s.club_id]) m[s.club_id] = [];
      m[s.club_id].push(s);
    }
    return m;
  }, [sources]);

  const leagues = useMemo(() => {
    const set = new Set<string>();
    for (const c of clubs) if (c.league) set.add(c.league);
    return Array.from(set).sort();
  }, [clubs]);

  const focusedClub = useMemo(
    () => (clubIdParam ? clubs.find(c => c.id === clubIdParam) ?? null : null),
    [clubIdParam, clubs],
  );

  const filtered = useMemo(() => {
    if (focusedClub) return [focusedClub];
    const q = norm(search.trim());
    return clubs.filter((c) => {
      if (tierFilter !== 'all' && String(c.tier) !== tierFilter) return false;
      if (leagueFilter !== 'all' && c.league !== leagueFilter) return false;
      if (q && !norm(c.name).includes(q)) return false;
      return true;
    });
  }, [clubs, search, tierFilter, leagueFilter, focusedClub]);

  const grouped = useMemo(() => {
    const m: Record<string, Club[]> = {};
    for (const c of filtered) {
      const k = c.league || '— No league —';
      if (!m[k]) m[k] = [];
      m[k].push(c);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.name.localeCompare(b.name));
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const expandedLeagues = useMemo(() => {
    if (search.trim()) return new Set(grouped.map(([k]) => k));
    return openLeagues;
  }, [search, grouped, openLeagues]);

  const toggleLeague = (k: string) =>
    setOpenLeagues((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  const toggleClub = (id: string) =>
    setOpenClubs((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const handleAdd = async (clubId: string) => {
    const url = newUrl.trim();
    if (!isValidUrl(url)) {
      toast.error('Invalid URL — must start with http:// or https://');
      return;
    }
    const label = newLabel.trim() || generateLabel(url);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('club_sources')
      .insert({ club_id: clubId, url, label, created_by: user?.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Source added');
    setAddingFor(null);
    setNewUrl('');
    setNewLabel('');
    qc.invalidateQueries({ queryKey: ['club-sources'] });
  };

  const handleEditSave = async (id: string) => {
    const url = editUrl.trim();
    if (!isValidUrl(url)) {
      toast.error('Invalid URL');
      return;
    }
    const { error } = await supabase
      .from('club_sources')
      .update({ url, label: editLabel.trim() || generateLabel(url) })
      .eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Source updated');
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ['club-sources'] });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('club_sources').delete().eq('id', deleteId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Source deleted');
    setDeleteId(null);
    qc.invalidateQueries({ queryKey: ['club-sources'] });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-medium text-foreground mb-1">News Source Repository</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Your daily reading list — grouped by league and club.
      </p>

      {focusedClub && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Filtered to club: </span>
            <span className="font-medium text-foreground">{focusedClub.name}</span>
            {focusedClub.league && (
              <span className="text-xs text-muted-foreground ml-2">({focusedClub.league})</span>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearClubFocus}>
            Clear filter
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          placeholder="Search clubs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          disabled={!!focusedClub}
        />
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="1">Tier 1</SelectItem>
            <SelectItem value="2">Tier 2</SelectItem>
          </SelectContent>
        </Select>
        <Select value={leagueFilter} onValueChange={setLeagueFilter}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Leagues</SelectItem>
            {leagues.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {grouped.map(([league, leagueClubs]) => {
          const isOpen = expandedLeagues.has(league);
          return (
            <div key={league} className="rounded-md border border-border bg-card">
              <button
                onClick={() => toggleLeague(league)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30"
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium text-sm">{league}</span>
                <span className="text-xs text-muted-foreground ml-1">({leagueClubs.length} clubs)</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-1">
                  {leagueClubs.map((club) => {
                    const cs = sourcesByClub[club.id] ?? [];
                    const cOpen = openClubs.has(club.id);
                    return (
                      <div key={club.id} className="border-t border-border/50 pt-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleClub(club.id)}
                            className="flex items-center gap-2 text-left text-sm hover:text-primary flex-1"
                          >
                            {cOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            <span>{club.name}</span>
                            {club.tier === 1 && (
                              <Badge variant="outline" className="text-[10px] border-primary text-primary">T1</Badge>
                            )}
                            {club.tier === 2 && (
                              <Badge variant="outline" className="text-[10px] border-muted-foreground text-muted-foreground">T2</Badge>
                            )}
                            <span className={cs.length === 0 ? 'text-xs text-muted-foreground' : 'text-xs text-primary'}>
                              — {cs.length === 0 ? 'No sources' : `${cs.length} source${cs.length === 1 ? '' : 's'}`}
                            </span>
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); navigate(`/clubs/${club.id}/news`); }}
                            className="h-7 text-xs text-primary"
                            title={cs.length === 0
                              ? 'Add a source first — a report needs something to read'
                              : `Read ${cs.length} source${cs.length === 1 ? '' : 's'} and write a report`}
                          >
                            <Newspaper className="h-3 w-3 mr-1" /> News report
                          </Button>
                        </div>
                        {cOpen && (
                          <div className="ml-5 mt-2 space-y-1">
                            {cs.length === 0 && addingFor !== club.id && (
                              <p className="text-xs text-muted-foreground italic">No sources yet for this club.</p>
                            )}
                            {cs.map((s) => (
                              <div key={s.id} className="flex items-center gap-2 text-xs">
                                {editingId === s.id ? (
                                  <>
                                    <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Label" className="h-7 text-xs flex-1 max-w-[180px]" />
                                    <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://..." className="h-7 text-xs flex-1" />
                                    <button onClick={() => handleEditSave(s.id)} className="text-primary hover:underline" aria-label="Save"><Check className="h-3.5 w-3.5" /></button>
                                    <button onClick={() => setEditingId(null)} className="text-muted-foreground" aria-label="Cancel"><X className="h-3.5 w-3.5" /></button>
                                  </>
                                ) : (
                                  <>
                                    <span className="font-medium min-w-[140px]">{s.label || '—'}</span>
                                    <a
                                      href={s.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-muted-foreground hover:text-primary truncate flex-1 inline-flex items-center gap-1"
                                    >
                                      {s.url} <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                    <button
                                      onClick={() => { setEditingId(s.id); setEditUrl(s.url); setEditLabel(s.label ?? ''); }}
                                      className="text-muted-foreground hover:text-foreground"
                                      aria-label="Edit source"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteId(s.id)}
                                      className="text-muted-foreground hover:text-destructive"
                                      aria-label="Delete source"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            ))}
                            {addingFor === club.id ? (
                              <div className="flex items-center gap-2 text-xs">
                                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (optional)" className="h-7 text-xs max-w-[180px]" />
                                <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." className="h-7 text-xs flex-1" />
                                <Button size="sm" onClick={() => handleAdd(club.id)} className="h-7">Add</Button>
                                <button onClick={() => { setAddingFor(null); setNewUrl(''); setNewLabel(''); }} className="text-muted-foreground" aria-label="Cancel"><X className="h-3.5 w-3.5" /></button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAddingFor(club.id); setNewUrl(''); setNewLabel(''); }}
                                className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                              >
                                <Plus className="h-3 w-3" /> Add source
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete source?</AlertDialogTitle>
            <AlertDialogDescription>This is permanent.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

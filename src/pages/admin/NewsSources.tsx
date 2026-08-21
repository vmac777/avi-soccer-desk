import { useMemo, useState } from 'react';
import { useClubs, useClubSources, Club, ClubSource } from '@/hooks/useClubsAndSources';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { ChevronDown, ChevronRight, ExternalLink, Pencil, Plus, Trash2, X, Check } from 'lucide-react';
import ImportSourcesModal from '@/components/news/ImportSourcesModal';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { generateLabel } from '@/lib/sourceImport';

const norm = (s: string) =>
  s.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function NewsSources() {
  const { data: clubs = [] } = useClubs();
  const { data: sources = [] } = useClubSources();
  const qc = useQueryClient();

  const [importOpen, setImportOpen] = useState(false);
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

  const filteredClubs = useMemo(() => {
    const q = norm(search.trim());
    return clubs.filter((c) => {
      if (tierFilter !== 'all' && String(c.tier) !== tierFilter) return false;
      if (leagueFilter !== 'all' && c.league !== leagueFilter) return false;
      if (q && !norm(c.name).includes(q)) return false;
      return true;
    });
  }, [clubs, search, tierFilter, leagueFilter]);

  const grouped = useMemo(() => {
    const m: Record<string, Club[]> = {};
    for (const c of filteredClubs) {
      const k = c.league || '— No league —';
      if (!m[k]) m[k] = [];
      m[k].push(c);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.name.localeCompare(b.name));
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredClubs]);

  // auto-expand leagues with search hits
  const expandedLeagues = useMemo(() => {
    if (search.trim()) return new Set(grouped.map(([k]) => k));
    return openLeagues;
  }, [search, grouped, openLeagues]);

  const toggleLeague = (k: string) => {
    setOpenLeagues((p) => {
      const n = new Set(p);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };
  const toggleClub = (id: string) => {
    setOpenClubs((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const isValidUrl = (u: string) => /^https?:\/\/.+/i.test(u.trim());

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium text-foreground">Club Source Repository</h1>
        <Button onClick={() => setImportOpen(true)}>Import from xlsx</Button>
      </div>

      <>
          <div className="flex flex-wrap gap-2 mb-4">
            <Input
              placeholder="Search clubs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
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
                            <button
                              onClick={() => toggleClub(club.id)}
                              className="w-full flex items-center gap-2 text-left text-sm hover:text-primary"
                            >
                              {cOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              <span>{club.name}</span>
                              <span className={cs.length === 0 ? 'text-xs text-muted-foreground' : 'text-xs text-primary'}>
                                — {cs.length === 0 ? 'No sources' : `${cs.length} source${cs.length === 1 ? '' : 's'}`}
                              </span>
                            </button>
                            {cOpen && (
                              <div className="ml-5 mt-2 space-y-1">
                                {cs.map((s) => (
                                  <div key={s.id} className="flex items-center gap-2 text-xs">
                                    {editingId === s.id ? (
                                      <>
                                        <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Label" className="h-7 text-xs flex-1 max-w-[180px]" />
                                        <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://..." className="h-7 text-xs flex-1" />
                                        <button onClick={() => handleEditSave(s.id)} className="text-primary hover:underline"><Check className="h-3.5 w-3.5" /></button>
                                        <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="font-medium min-w-[140px]">{s.label || '—'}</span>
                                        <a href={s.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary truncate flex-1 inline-flex items-center gap-1">
                                          {s.url} <ExternalLink className="h-3 w-3 shrink-0" />
                                        </a>
                                        <button onClick={() => { setEditingId(s.id); setEditUrl(s.url); setEditLabel(s.label ?? ''); }} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                                        <button onClick={() => setDeleteId(s.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                                      </>
                                    )}
                                  </div>
                                ))}
                                {addingFor === club.id ? (
                                  <div className="flex items-center gap-2 text-xs">
                                    <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (optional)" className="h-7 text-xs max-w-[180px]" />
                                    <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." className="h-7 text-xs flex-1" />
                                    <Button size="sm" onClick={() => handleAdd(club.id)} className="h-7">Add</Button>
                                    <button onClick={() => { setAddingFor(null); setNewUrl(''); setNewLabel(''); }} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                                  </div>
                                ) : (
                                  <button onClick={() => setAddingFor(club.id)} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
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
        </>

      <ImportSourcesModal
        open={importOpen}
        onOpenChange={setImportOpen}
        clubs={clubs}
        existingSources={sources}
      />

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

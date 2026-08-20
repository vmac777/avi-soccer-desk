import { useState, useMemo } from 'react';
import {
  useBuyPitches, useAddBuyPitch, useUpdateBuyPitch, useScoutedTargets,
  useSetLossReason,
  BUY_ACTIVE_STAGES, BUY_CLOSED_STAGES, BUY_ALL_STAGES,
  CLOSED_STAGE_TO_LOSS_REASON,
  type BuyPitch, type BuyPitchStage, type ScoutedTarget, type BallInCourt,
} from '@/hooks/useBuyData';
import { useContacts, useCreateContact } from '@/hooks/useData';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Plus, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import BuyPitchDetailModal from '@/components/BuyPitchDetailModal';
import BuyPitchCard from '@/components/BuyPitchCard';
import { exportBuyKanbanPdf } from '@/lib/exportBuyKanbanPdf';

const COLUMN_DEFAULT_GLOW: Record<typeof BUY_ACTIVE_STAGES[number], BallInCourt | null> = {
  Enquiry: 'them',
  Negotiation: null,   // ball ping-pongs; per-card only
  Closing: 'them',
};

const POSITION_FILTERS = ['All', 'GK', 'DEF', 'MID', 'FWD'] as const;
type PosFilter = typeof POSITION_FILTERS[number];

function getPositionGroup(pos: string | null | undefined): string {
  const p = (pos || '').toUpperCase();
  if (p === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p)) return 'DEF';
  if (['DM', 'CM', 'AM', 'RM', 'LM'].includes(p)) return 'MID';
  if (['CF', 'ST', 'LW', 'RW', 'FW', 'SS'].includes(p)) return 'FWD';
  return 'MID';
}

const closedReasonLabels: { value: BuyPitchStage; label: string }[] = [
  { value: 'Signed', label: 'Signed' },
  { value: 'Walked', label: 'Walked' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Lost', label: 'Lost' },
  { value: 'Collapsed', label: 'Collapsed' },
];

function CreateBuyPitchDialog({ open, onClose, targets, contacts, onSubmit }: {
  open: boolean;
  onClose: () => void;
  targets: ScoutedTarget[];
  contacts: { id: string; club: string; contact_person: string | null }[];
  onSubmit: (data: { scouted_target_id: string; contact_id: string; notes: string }) => Promise<void> | void;
}) {
  const [form, setForm] = useState({ scouted_target_id: '', contact_id: '', notes: '' });
  const [newAgentName, setNewAgentName] = useState<string | null>(null);
  const createContact = useCreateContact();
  const { session } = useAuth();

  const target = targets.find(t => t.id === form.scouted_target_id);
  const teamContacts = target
    ? contacts.filter(c => c.club && target.current_club && c.club.toLowerCase() === target.current_club.toLowerCase())
    : [];
  const otherContacts = target
    ? contacts.filter(c => !teamContacts.find(tc => tc.id === c.id))
    : contacts;

  const reset = () => {
    setForm({ scouted_target_id: '', contact_id: '', notes: '' });
    setNewAgentName(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.scouted_target_id) { toast.error('Select a scouted target'); return; }
    try {
      let contactId = form.contact_id;
      if (newAgentName !== null) {
        const name = newAgentName.trim();
        if (!name) { toast.error('Agent name required'); return; }
        const created = await createContact.mutateAsync({
          market: 'Agents',
          club: name,
          contact_person: name,
          created_by: session?.user?.id,
        } as any);
        contactId = created.id;
      }
      if (!contactId) { toast.error('Select a counterparty'); return; }
      await onSubmit({ scouted_target_id: form.scouted_target_id, contact_id: contactId, notes: form.notes });
      reset();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Buy-Side Pitch</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Scouted Target *</label>
            <select
              value={form.scouted_target_id}
              onChange={e => { setForm(p => ({ ...p, scouted_target_id: e.target.value, contact_id: '' })); setNewAgentName(null); }}
              className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
            >
              <option value="">Select target...</option>
              {targets.map(t => <option key={t.id} value={t.id}>{t.name} — {t.current_club}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Counterparty (club / agent) *</label>
            <select
              value={newAgentName !== null ? '__new_agent__' : form.contact_id}
              onChange={e => {
                const v = e.target.value;
                if (v === '__new_agent__') { setNewAgentName(''); setForm(p => ({ ...p, contact_id: '' })); }
                else { setNewAgentName(null); setForm(p => ({ ...p, contact_id: v })); }
              }}
              className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
            >
              <option value="">Select contact...</option>
              {target && teamContacts.length > 0 && (
                <optgroup label={target.current_club}>
                  {teamContacts.map(c => <option key={c.id} value={c.id}>{c.contact_person || c.club}</option>)}
                </optgroup>
              )}
              <option value="__new_agent__">＋ Create New — Agent</option>
              {otherContacts.length > 0 && (
                <optgroup label={target ? 'Other contacts' : 'Contacts'}>
                  {otherContacts.map(c => <option key={c.id} value={c.id}>{c.contact_person || c.club} — {c.club}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          {newAgentName !== null && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent Name *</label>
              <Input
                value={newAgentName}
                onChange={e => setNewAgentName(e.target.value)}
                placeholder="e.g. Giuliano Bertolucci"
                className="h-8 text-xs"
                autoComplete="off"
                autoFocus
              />
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} autoComplete="off" className="w-full h-16 text-xs bg-background border border-border rounded-md p-2 resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset} className="h-8 text-xs">Cancel</Button>
            <Button onClick={handleSubmit} disabled={createContact.isPending} className="h-8 text-xs">Create Pitch</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CloseReasonDialog({ open, onCancel, onConfirm }: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (stage: BuyPitchStage) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Close pitch as…</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {closedReasonLabels.map(r => (
            <Button key={r.value} variant="outline" className="h-9 text-xs" onClick={() => onConfirm(r.value)}>{r.label}</Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BuyPitchesPage() {
  const { data: pitches = [], isLoading } = useBuyPitches();
  const { data: targets = [] } = useScoutedTargets();
  const { data: contacts = [] } = useContacts();
  const updateMutation = useUpdateBuyPitch();
  const setLoss = useSetLossReason();
  const addMutation = useAddBuyPitch();

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPitchId, setSelectedPitchId] = useState<string | null>(null);

  // Ball-in-court filter chips (replaces closed-stage chips)
  const [bicFilter, setBicFilter] = useState<'all' | 'us' | 'them'>('all');
  const [posFilter, setPosFilter] = useState<PosFilter>('All');
  const [showClosed, setShowClosed] = useState(false);
  const [viewMode, setViewMode] = useState<'detailed' | 'short'>('detailed');

  // Close-reason prompt state
  const [closingPitchId, setClosingPitchId] = useState<string | null>(null);

  const targetMap = useMemo(() => {
    const m: Record<string, ScoutedTarget> = {};
    targets.forEach(t => { m[t.id] = t; });
    return m;
  }, [targets]);

  const contactMap = useMemo(() => {
    const m: Record<string, { name: string; club: string }> = {};
    contacts.forEach(c => { if (c.id) m[c.id] = { name: c.contact_person || c.club, club: c.club }; });
    return m;
  }, [contacts]);

  const matchesSearch = (p: BuyPitch) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const t = targetMap[p.scouted_target_id];
    const c = contactMap[p.contact_id];
    return (t?.name || '').toLowerCase().includes(s) || (c?.name || '').toLowerCase().includes(s) || (c?.club || '').toLowerCase().includes(s);
  };

  const activeStrings = BUY_ACTIVE_STAGES as readonly string[];
  const closedStrings = BUY_CLOSED_STAGES as readonly string[];

  const activePitches = useMemo(() => {
    return pitches.filter(p => {
      if (!activeStrings.includes(p.stage)) return false;
      if (!matchesSearch(p)) return false;
      if (posFilter !== 'All') {
        const t = targetMap[p.scouted_target_id];
        if (!t || getPositionGroup(t.position) !== posFilter) return false;
      }
      if (bicFilter !== 'all') {
        const colGlow = COLUMN_DEFAULT_GLOW[p.stage as typeof BUY_ACTIVE_STAGES[number]];
        const effective = p.ball_in_court ?? colGlow;
        if (effective !== bicFilter) return false;
      }
      return true;
    });
  }, [pitches, search, targetMap, contactMap, bicFilter, posFilter]);
  const closedPitches = useMemo(() => pitches.filter(p => {
    if (!closedStrings.includes(p.stage)) return false;
    if (!matchesSearch(p)) return false;
    if (posFilter !== 'All') {
      const t = targetMap[p.scouted_target_id];
      if (!t || getPositionGroup(t.position) !== posFilter) return false;
    }
    return true;
  }), [pitches, search, targetMap, contactMap, posFilter]);

  const signedPitches = useMemo(() => closedPitches.filter(p => p.stage === 'Signed'), [closedPitches]);
  const unsuccessfulClosed = useMemo(() => closedPitches.filter(p => p.stage !== 'Signed'), [closedPitches]);

  const visibleClosed = showClosed ? unsuccessfulClosed : [];

  const handleDrop = (target: BuyPitchStage, pitchId: string) => {
    const pitch = pitches.find(p => p.id === pitchId);
    if (!pitch) return;
    if (closedStrings.includes(target)) {
      // Prompt for the reason instead of force-setting whatever was dropped.
      setClosingPitchId(pitchId);
      return;
    }
    // Entering Negotiation: default ball-in-court to 'us' if unset.
    const patch: Partial<BuyPitch> & { id: string } = { id: pitchId, stage: target };
    if (target === 'Negotiation' && pitch.ball_in_court == null) patch.ball_in_court = 'us';
    updateMutation.mutate(patch);
  };

  const handleCreate = async (form: { scouted_target_id: string; contact_id: string; notes: string }) => {
    try {
      const { pitch, action } = await addMutation.mutateAsync(form);
      if (action === 'reopened') toast.success('Pitch re-opened');
      else if (action === 'opened') toast.info('Pitch already exists — opening');
      else toast.success('Pitch created');
      setShowCreate(false);
      setSelectedPitchId(pitch.id);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const closedCounts = useMemo(() => {
    const m: Record<string, number> = {};
    closedPitches.forEach(p => { m[p.stage] = (m[p.stage] || 0) + 1; });
    return m;
  }, [closedPitches]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><span className="text-muted-foreground font-mono text-sm">Loading...</span></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[11px] tracking-[0.15em] font-bold text-primary uppercase">BUY-SIDE PITCHES</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const cols: { title: string; pitches: any[] }[] = BUY_ACTIVE_STAGES.map(stage => ({
                title: stage,
                pitches: activePitches.filter(p => p.stage === stage).map(p => ({
                  pitch: p,
                  targetName: targetMap[p.scouted_target_id]?.name || 'Unknown',
                  targetClub: targetMap[p.scouted_target_id]?.current_club || '',
                  contactName: contactMap[p.contact_id]?.name || 'Unknown',
                  contactClub: contactMap[p.contact_id]?.club || '',
                  columnDefaultGlow: COLUMN_DEFAULT_GLOW[stage],
                })),
              }));
              cols.push({
                title: 'Signed',
                pitches: signedPitches.map(p => ({
                  pitch: p,
                  targetName: targetMap[p.scouted_target_id]?.name || 'Unknown',
                  targetClub: targetMap[p.scouted_target_id]?.current_club || '',
                  contactName: contactMap[p.contact_id]?.name || 'Unknown',
                  contactClub: contactMap[p.contact_id]?.club || '',
                  columnDefaultGlow: null,
                })),
              });
              if (showClosed) {
                cols.push({
                  title: 'Closed',
                  pitches: visibleClosed.map(p => ({
                    pitch: p,
                    targetName: targetMap[p.scouted_target_id]?.name || 'Unknown',
                    targetClub: targetMap[p.scouted_target_id]?.current_club || '',
                    contactName: contactMap[p.contact_id]?.name || 'Unknown',
                    contactClub: contactMap[p.contact_id]?.club || '',
                    columnDefaultGlow: null,
                  })),
                });
              }
              exportBuyKanbanPdf(cols, viewMode);
            }}
            className="h-8 text-xs"
          >
            <FileDown className="h-3.5 w-3.5 mr-1" /> Export PDF ({viewMode})
          </Button>
          <Button onClick={() => setShowCreate(true)} className="h-8 text-xs bg-primary text-primary-foreground">
            <Plus className="h-3.5 w-3.5 mr-1" /> New Pitch
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search pitches..." value={search} onChange={e => setSearch(e.target.value)} autoComplete="off" className="w-48 h-8 text-xs bg-card border-border pl-7" />
        </div>

        {/* Position filter */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-md p-0.5">
          {POSITION_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setPosFilter(f)}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wider transition-colors',
                posFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Ball-in-court filter */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-md p-0.5">
          {(['all', 'us', 'them'] as const).map(v => (
            <button
              key={v}
              onClick={() => setBicFilter(v)}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wider transition-colors',
                bicFilter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v === 'all' ? 'All' : v === 'us' ? 'Us' : 'Them'}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-md p-0.5">
          {(['detailed', 'short'] as const).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wider transition-colors',
                viewMode === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Show closed toggle */}
        <button
          onClick={() => setShowClosed(s => !s)}
          className={cn(
            'px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wider border transition-colors',
            showClosed ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'
          )}
        >
          {showClosed ? 'Hide' : 'Show'} closed ({unsuccessfulClosed.length})
        </button>
      </div>


      {/* Kanban — 4 active columns + Signed column + optional Closed column */}
      <div id="buy-kanban-export" className={cn('grid grid-cols-1 md:grid-cols-2 gap-3', showClosed ? 'lg:grid-cols-6' : 'lg:grid-cols-5')}>
        {BUY_ACTIVE_STAGES.map(stage => {
          const stagePitches = activePitches.filter(p => p.stage === stage);
          const colGlow = COLUMN_DEFAULT_GLOW[stage];
          const headerGlow =
            stage === 'Enquiry' ? 'border-[hsl(36_40%_55%/0.45)] text-[hsl(36_30%_90%)]'
            : stage === 'Negotiation' ? 'border-[hsl(36_40%_55%/0.45)] text-[hsl(36_30%_90%)]'
            : stage === 'Closing' ? 'border-[hsl(36_40%_55%/0.45)] text-[hsl(36_30%_90%)]'
            : 'border-border text-muted-foreground';
          return (
            <div
              key={stage}
              className="bg-card/50 border border-border rounded-lg p-3 min-h-[320px]"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const id = e.dataTransfer.getData('pitchId'); if (id) handleDrop(stage, id); }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border', headerGlow)}>{stage}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{stagePitches.length}</span>
              </div>
              <div className="space-y-2">
                {stagePitches.map(pitch => (
                  <div key={pitch.id} draggable onDragStart={e => e.dataTransfer.setData('pitchId', pitch.id)}>
                    <BuyPitchCard
                      pitch={pitch}
                      targetName={targetMap[pitch.scouted_target_id]?.name || 'Unknown'}
                      targetClub={targetMap[pitch.scouted_target_id]?.current_club || ''}
                      contactName={contactMap[pitch.contact_id]?.name || 'Unknown'}
                      contactClub={contactMap[pitch.contact_id]?.club || ''}
                      columnDefaultGlow={colGlow}
                      onOpen={() => setSelectedPitchId(pitch.id)}
                      viewMode={viewMode}
                    />
                  </div>
                ))}
                {stagePitches.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic py-4 text-center">No pitches</p>
                )}
              </div>
            </div>
          );
        })}

        {/* Signed column — always visible, successful outcomes */}
        <div
          className="bg-card/50 border border-[hsl(var(--gold)/0.35)] rounded-lg p-3 min-h-[320px]"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { const id = e.dataTransfer.getData('pitchId'); if (id) handleDrop('Signed' as BuyPitchStage, id); }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-[hsl(var(--gold)/0.6)] text-[hsl(var(--gold))]">Signed</span>
            <span className="text-[10px] text-muted-foreground font-mono">{signedPitches.length}</span>
          </div>
          <div className="space-y-2">
            {signedPitches.map(pitch => (
              <BuyPitchCard
                key={pitch.id}
                pitch={pitch}
                targetName={targetMap[pitch.scouted_target_id]?.name || 'Unknown'}
                targetClub={targetMap[pitch.scouted_target_id]?.current_club || ''}
                contactName={contactMap[pitch.contact_id]?.name || 'Unknown'}
                contactClub={contactMap[pitch.contact_id]?.club || ''}
                columnDefaultGlow={null}
                onOpen={() => setSelectedPitchId(pitch.id)}
                viewMode={viewMode}
              />
            ))}
            {signedPitches.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic py-4 text-center">No signings yet</p>
            )}
          </div>
        </div>

        {/* Closed column (rightmost) */}
        {showClosed && (
          <div className="bg-card/50 border border-border rounded-lg p-3 min-h-[320px]">
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-[hsl(36_40%_55%/0.45)] text-[hsl(36_30%_90%)]">Closed</span>
              <span className="text-[10px] text-muted-foreground font-mono">{visibleClosed.length}</span>
            </div>
            <div className="space-y-2">
              {visibleClosed.map(pitch => (
                <div key={pitch.id} className="relative">
                  <BuyPitchCard
                    pitch={pitch}
                    targetName={targetMap[pitch.scouted_target_id]?.name || 'Unknown'}
                    targetClub={targetMap[pitch.scouted_target_id]?.current_club || ''}
                    contactName={contactMap[pitch.contact_id]?.name || 'Unknown'}
                    contactClub={contactMap[pitch.contact_id]?.club || ''}
                    columnDefaultGlow={null}
                    onOpen={() => setSelectedPitchId(pitch.id)}
                    viewMode={viewMode}
                  />
                  <span className="absolute top-1.5 right-7 inline-flex items-center px-1 py-0.5 rounded text-[8px] font-medium border border-border bg-card text-muted-foreground uppercase tracking-wider pointer-events-none">
                    {pitch.stage}
                  </span>
                </div>
              ))}
              {visibleClosed.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic py-4 text-center">No closed pitches</p>
              )}
            </div>
          </div>
        )}
      </div>



      {showCreate && (
        <CreateBuyPitchDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          targets={targets}
          contacts={contacts.filter(c => c.id).map(c => ({ id: c.id!, club: c.club, contact_person: c.contact_person }))}
          onSubmit={handleCreate}
        />
      )}

      {selectedPitchId && (
        <BuyPitchDetailModal pitchId={selectedPitchId} onClose={() => setSelectedPitchId(null)} />
      )}

      <CloseReasonDialog
        open={!!closingPitchId}
        onCancel={() => setClosingPitchId(null)}
        onConfirm={stage => {
          if (!closingPitchId) return;
          const reason = CLOSED_STAGE_TO_LOSS_REASON[stage] ?? null;
          setLoss.mutate({ id: closingPitchId, stage, loss_reason: reason });
          setClosingPitchId(null);
        }}
      />
    </div>
  );
}

import { useState, useRef } from 'react';
import {
  useBuyPitches, useBuyPitchNotes, useAddBuyPitchNote, useUpdateBuyPitch,
  useBuyNegotiationEntries, useAddBuyNegotiationEntry, useDeleteBuyNegotiationEntry,
  useScoutedTargets, useSetBallInCourt, useSetTracks, useSetMilestone, useSetLossReason,
  useChangeBuyPitchCounterparty,
  BUY_ACTIVE_STAGES, BUY_CLOSED_STAGES,
  CLOSED_STAGE_TO_LOSS_REASON,
  NEGOTIATION_TYPES, LOAN_TYPES_WITH_TRIGGER,
  type BuyPitchStage, type BallInCourt, type ClubTrack, type PlayerTrack,
  type MilestoneKey, type MilestoneEntry, type NegotiationType, type BuyPitchAttachment,
} from '@/hooks/useBuyData';
import { useContacts, useCreateContact } from '@/hooks/useData';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCompactEur } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Trash2, Paperclip, X, Download } from 'lucide-react';
import SetReminderButton from '@/components/SetReminderButton';

const ENTRY_TYPES = ['Our Offer', 'Their Counter', 'Their Ask', 'Agreement', 'Note'] as const;

const CLUB_TRACKS: { v: ClubTrack; label: string }[] = [
  { v: 'none', label: '—' },
  { v: 'enquiring', label: 'Enquiring' },
  { v: 'bid_in', label: 'Bid in' },
  { v: 'fee_agreed', label: 'Fee agreed' },
];
const PLAYER_TRACKS: { v: PlayerTrack; label: string }[] = [
  { v: 'none', label: '—' },
  { v: 'talking', label: 'Talking' },
  { v: 'agreed', label: 'Agreed' },
];

const MILESTONES: { key: MilestoneKey; label: string; withAmount?: boolean; withInProgress?: boolean }[] = [
  { key: 'enquiry_sent', label: 'Enquiry sent' },
  { key: 'bid_submitted', label: 'Bid submitted', withAmount: true },
  { key: 'fee_agreed', label: 'Fee agreed' },
  { key: 'terms_agreed', label: 'Terms agreed' },
  { key: 'medical', label: 'Medical', withInProgress: true },
  { key: 'registered', label: 'Registered' },
];

const CLOSED_STAGES_UI: { value: BuyPitchStage; label: string }[] = [
  { value: 'Signed', label: 'Signed' },
  { value: 'Walked', label: 'Walked' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Lost', label: 'Lost' },
  { value: 'Collapsed', label: 'Collapsed' },
];

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function BuyPitchDetailModal({ pitchId, onClose }: { pitchId: string; onClose: () => void }) {
  const { displayName } = useAuth();
  const { data: pitches = [] } = useBuyPitches();
  const { data: targets = [] } = useScoutedTargets();
  const { data: contacts = [] } = useContacts();
  const { data: notes = [] } = useBuyPitchNotes(pitchId);
  const { data: negotiations = [] } = useBuyNegotiationEntries(pitchId);
  const addNote = useAddBuyPitchNote();
  const addNegEntry = useAddBuyNegotiationEntry();
  const deleteNegEntry = useDeleteBuyNegotiationEntry();
  const updatePitch = useUpdateBuyPitch();
  const setBic = useSetBallInCourt();
  const setTracks = useSetTracks();
  const setMilestone = useSetMilestone();
  const setLoss = useSetLossReason();
  const changeCounterparty = useChangeBuyPitchCounterparty();
  const createContact = useCreateContact();
  const [showCounterpartyEdit, setShowCounterpartyEdit] = useState(false);
  const [newAgentName, setNewAgentName] = useState<string | null>(null);

  const [noteText, setNoteText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = useState<'mwp' | 'asking' | 'offer' | 'final' | null>(null);
  const [fieldInput, setFieldInput] = useState('');
  const [negType, setNegType] = useState<string>('Our Offer');
  const [negAmount, setNegAmount] = useState('');
  const [negNote, setNegNote] = useState('');
  const [closePromptOpen, setClosePromptOpen] = useState(false);

  // Milestone draft state (per key)
  const [msDraft, setMsDraft] = useState<{ key: MilestoneKey; at: string; amount: string; inProgress: boolean } | null>(null);

  const pitch = pitches.find(p => p.id === pitchId);
  if (!pitch) return null;

  const target = targets.find(t => t.id === pitch.scouted_target_id);
  const contact = contacts.find(c => c.id === pitch.contact_id);

  const handleAddNote = async () => {
    if (!noteText.trim() && pendingFiles.length === 0) return;
    setUploading(true);
    try {
      const attachments: BuyPitchAttachment[] = [];
      for (const f of pendingFiles) {
        const path = `${pitchId}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('pitch-attachments').upload(path, f, { upsert: false });
        if (upErr) throw upErr;
        attachments.push({ path, name: f.name, size: f.size, type: f.type });
      }
      await addNote.mutateAsync({ buy_pitch_id: pitchId, note: noteText.trim(), logged_by: displayName, attachments });
      setNoteText('');
      setPendingFiles([]);
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const downloadAttachment = async (att: BuyPitchAttachment) => {
    try {
      const { data, error } = await supabase.storage.from('pitch-attachments').createSignedUrl(att.path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddNegEntry = async () => {
    if (!negAmount && !negNote.trim()) { toast.error('Enter an amount or note'); return; }
    try {
      await addNegEntry.mutateAsync({
        buy_pitch_id: pitchId,
        entry_type: negType,
        amount: negAmount ? Number(negAmount) : null,
        note: negNote.trim(),
        logged_by: displayName,
      });
      // Auto-sync price fields (skip Note).
      if (negType === 'Our Offer' && negAmount) updatePitch.mutate({ id: pitchId, current_offer: Number(negAmount) });
      else if ((negType === 'Their Ask' || negType === 'Their Counter') && negAmount) updatePitch.mutate({ id: pitchId, asking_price: Number(negAmount) });
      else if (negType === 'Agreement' && negAmount) updatePitch.mutate({ id: pitchId, final_price: Number(negAmount) });
      setNegAmount(''); setNegNote('');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleStageChange = (stage: BuyPitchStage) => {
    if ((BUY_CLOSED_STAGES as readonly string[]).includes(stage)) {
      setClosePromptOpen(true);
      return;
    }
    const patch: any = { id: pitchId, stage };
    if (stage === 'Negotiation' && pitch.ball_in_court == null) patch.ball_in_court = 'us';
    updatePitch.mutate(patch);
  };

  const handlePriceSave = (field: 'mwp' | 'asking_price' | 'current_offer' | 'final_price') => {
    const val = fieldInput ? Number(fieldInput) : null;
    updatePitch.mutate({ id: pitchId, [field]: val });
    setEditingField(null); setFieldInput('');
  };

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const flipBic = (v: BallInCourt) => {
    setBic.mutate({ id: pitchId, value: pitch.ball_in_court === v ? null : v });
  };

  return (
    <>
      <Sheet open onOpenChange={v => { if (!v) onClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-[500px] overflow-y-auto">
          <SheetHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base text-foreground truncate">{target?.name || 'Unknown Target'}</SheetTitle>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">from {contact?.contact_person || contact?.club || 'Unknown'} at {contact?.club || '—'}</p>
                  <button
                    onClick={() => { setShowCounterpartyEdit(s => !s); setNewAgentName(null); }}
                    className="text-[10px] underline text-muted-foreground hover:text-foreground"
                  >
                    {showCounterpartyEdit ? 'cancel' : 'change'}
                  </button>
                </div>
                {showCounterpartyEdit && (
                  <div className="mt-2 space-y-2">
                    {(() => {
                      const teamContacts = target
                        ? contacts.filter(c => c.club && target.current_club && c.club.toLowerCase() === target.current_club.toLowerCase())
                        : [];
                      const otherContacts = contacts.filter(c => c.id && !teamContacts.find(tc => tc.id === c.id));
                      const handleSelect = async (v: string) => {
                        if (v === '__new_agent__') { setNewAgentName(''); return; }
                        if (!v || v === pitch.contact_id) { setShowCounterpartyEdit(false); return; }
                        const next = contacts.find(c => c.id === v);
                        const toLabel = next?.contact_person || next?.club || 'Unknown';
                        const fromLabel = contact?.contact_person || contact?.club || 'Unknown';
                        try {
                          await changeCounterparty.mutateAsync({ id: pitchId, contact_id: v, fromLabel, toLabel });
                          toast.success('Counterparty updated');
                          setShowCounterpartyEdit(false);
                        } catch (e: any) { toast.error(e.message); }
                      };
                      return (
                        <select
                          value={newAgentName !== null ? '__new_agent__' : pitch.contact_id}
                          onChange={e => handleSelect(e.target.value)}
                          className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
                        >
                          {target && teamContacts.length > 0 && (
                            <optgroup label={target.current_club}>
                              {teamContacts.map(c => <option key={c.id} value={c.id!}>{c.contact_person || c.club}</option>)}
                            </optgroup>
                          )}
                          <option value="__new_agent__">＋ Create New — Agent</option>
                          {otherContacts.length > 0 && (
                            <optgroup label={target ? 'Other contacts' : 'Contacts'}>
                              {otherContacts.map(c => <option key={c.id} value={c.id!}>{c.contact_person || c.club} — {c.club}</option>)}
                            </optgroup>
                          )}
                        </select>
                      );
                    })()}
                    {newAgentName !== null && (
                      <div className="flex items-center gap-2">
                        <Input
                          value={newAgentName}
                          onChange={e => setNewAgentName(e.target.value)}
                          placeholder="Agent name"
                          autoComplete="off"
                          autoFocus
                          className="h-7 text-xs flex-1"
                        />
                        <Button
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          disabled={!newAgentName.trim() || createContact.isPending || changeCounterparty.isPending}
                          onClick={async () => {
                            const name = newAgentName.trim();
                            try {
                              const created = await createContact.mutateAsync({
                                market: 'Agents', club: name, contact_person: name,
                              } as any);
                              const fromLabel = contact?.contact_person || contact?.club || 'Unknown';
                              await changeCounterparty.mutateAsync({ id: pitchId, contact_id: created.id, fromLabel, toLabel: name });
                              toast.success('Agent created and assigned');
                              setNewAgentName(null);
                              setShowCounterpartyEdit(false);
                            } catch (e: any) { toast.error(e.message); }
                          }}
                        >Save</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <SetReminderButton
                target={{ type: 'buy_pitch', id: pitch.id, label: `Buy: ${target?.name || 'Target'}`, sublabel: contact?.club || undefined }}
                className="mt-1"
              />
            </div>
          </SheetHeader>

          {/* Stage chips */}
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Stage</p>
            <div className="flex flex-wrap gap-1.5">
              {BUY_ACTIVE_STAGES.map(s => (
                <button key={s} onClick={() => handleStageChange(s)}
                  className={cn('px-2 py-1 rounded text-[10px] font-medium border transition-colors uppercase tracking-wider',
                    pitch.stage === s
                      ? 'border-[hsl(var(--gold))] bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))]'
                      : 'border-border text-muted-foreground hover:text-foreground')}>
                  {s}
                </button>
              ))}
              <span className="w-px bg-border mx-1" />
              {CLOSED_STAGES_UI.map(s => (
                <button key={s.value} onClick={() => handleStageChange(s.value)}
                  className={cn('px-2 py-1 rounded text-[10px] font-medium border transition-colors uppercase tracking-wider',
                    pitch.stage === s.value
                      ? 'border-[hsl(var(--gold))] bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))]'
                      : 'border-border text-muted-foreground hover:text-foreground')}>
                  {s.label}
                </button>
              ))}
            </div>
            {pitch.loss_reason && (
              <p className="text-[10px] text-muted-foreground mt-1">Loss reason: <span className="text-foreground uppercase">{pitch.loss_reason}</span></p>
            )}
          </div>

          {/* Ball in court */}
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ball in court:</span>
            <button onClick={() => flipBic('us')}
              className={cn('px-2 py-1 rounded text-[10px] font-mono border transition-colors',
                pitch.ball_in_court === 'us'
                  ? 'border-[hsl(var(--glow-action-us))] bg-[hsl(var(--glow-action-us)/0.15)] text-[hsl(var(--glow-action-us))]'
                  : 'border-border text-muted-foreground')}>
              US (action)
            </button>
            <button onClick={() => flipBic('them')}
              className={cn('px-2 py-1 rounded text-[10px] font-mono border transition-colors',
                pitch.ball_in_court === 'them'
                  ? 'border-[hsl(var(--glow-action-them))] bg-[hsl(var(--glow-action-them)/0.15)] text-[hsl(var(--glow-action-them))]'
                  : 'border-border text-muted-foreground')}>
              THEM (waiting)
            </button>
            {pitch.ball_in_court && (
              <button onClick={() => setBic.mutate({ id: pitchId, value: null })} className="text-[10px] text-muted-foreground hover:text-foreground">clear</button>
            )}
          </div>

          {/* Tracks */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Club track</p>
              <div className="flex flex-wrap gap-1">
                {CLUB_TRACKS.map(t => (
                  <button key={t.v} onClick={() => setTracks.mutate({ id: pitchId, club_track: t.v })}
                    className={cn('font-mono px-1.5 py-0.5 text-[10px] rounded border transition-colors',
                      pitch.club_track === t.v
                        ? 'border-[hsl(var(--gold))] bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))]'
                        : 'border-border text-muted-foreground hover:text-foreground')}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Player track</p>
              <div className="flex flex-wrap gap-1">
                {PLAYER_TRACKS.map(t => (
                  <button key={t.v} onClick={() => setTracks.mutate({ id: pitchId, player_track: t.v })}
                    className={cn('font-mono px-1.5 py-0.5 text-[10px] rounded border transition-colors',
                      pitch.player_track === t.v
                        ? 'border-[hsl(var(--gold))] bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))]'
                        : 'border-border text-muted-foreground hover:text-foreground')}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* MWP / Ask / Offer / Final */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            {([
              { key: 'mwp' as const, dbKey: 'mwp' as const, label: 'MWP', value: pitch.mwp, edit: 'mwp' as const, accent: 'text-foreground' },
              { key: 'asking_price' as const, dbKey: 'asking_price' as const, label: 'ASK', value: pitch.asking_price, edit: 'asking' as const, accent: 'text-foreground' },
              { key: 'current_offer' as const, dbKey: 'current_offer' as const, label: 'OFFER', value: pitch.current_offer, edit: 'offer' as const, accent: 'text-[hsl(var(--gold))]' },
              { key: 'final_price' as const, dbKey: 'final_price' as const, label: 'FINAL', value: pitch.final_price, edit: 'final' as const, accent: 'text-foreground' },
            ]).map(({ key, dbKey, label, value, edit, accent }) => (
              <div key={key} className="bg-muted/30 rounded-md p-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
                {editingField === edit ? (
                  <div className="flex gap-1">
                    <Input value={fieldInput} onChange={e => setFieldInput(e.target.value)} type="number" autoComplete="off"
                      className="h-6 text-[11px]" autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handlePriceSave(dbKey); if (e.key === 'Escape') setEditingField(null); }} />
                  </div>
                ) : (
                  <button onClick={() => { setEditingField(edit); setFieldInput(value?.toString() || ''); }}
                    className={cn('font-mono text-[13px] font-bold hover:opacity-80 transition-opacity', accent)}>
                    {formatCompactEur(value)}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Negotiation Type */}
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Negotiation Type</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pitch.negotiation_type || ''}
                onChange={e => updatePitch.mutate({ id: pitchId, negotiation_type: (e.target.value || null) as NegotiationType | null })}
                className="h-7 text-[11px] bg-background border border-border rounded-md px-2"
              >
                <option value="">— select —</option>
                {NEGOTIATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {pitch.negotiation_type && (LOAN_TYPES_WITH_TRIGGER.includes(pitch.negotiation_type) || pitch.negotiation_type === 'Free Agent') && (
                <>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {pitch.negotiation_type === 'Free Agent' ? 'Agent Fee' : 'Trigger value'}
                  </span>
                  <Input
                    type="number"
                    defaultValue={pitch.loan_trigger_value ?? ''}
                    key={pitch.negotiation_type + String(pitch.loan_trigger_value ?? '')}
                    placeholder="€"
                    autoComplete="off"
                    className="h-7 w-32 text-[11px]"
                    onBlur={e => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      if (v !== pitch.loan_trigger_value) updatePitch.mutate({ id: pitchId, loan_trigger_value: v });
                    }}
                  />
                </>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Milestones</h3>
            <div className="space-y-1.5">
              {MILESTONES.map(m => {
                const current = pitch.milestones?.[m.key];
                const isSet = !!current;
                const isEditing = msDraft?.key === m.key;
                return (
                  <div key={m.key} className="flex items-center gap-2 text-[11px]">
                    <input
                      type="checkbox"
                      checked={isSet}
                      onChange={e => {
                        if (e.target.checked) {
                          setMsDraft({ key: m.key, at: todayISO(), amount: '', inProgress: false });
                        } else {
                          setMilestone.mutate({ id: pitchId, key: m.key, entry: null, milestones: pitch.milestones || {} });
                        }
                      }}
                      className="h-3 w-3"
                    />
                    <span className={cn('w-28', isSet ? 'text-foreground' : 'text-muted-foreground')}>{m.label}</span>
                    {isSet && !isEditing && (
                      <button onClick={() => setMsDraft({ key: m.key, at: current?.at?.slice(0, 10) || todayISO(), amount: String(current?.amount ?? ''), inProgress: !!current?.in_progress })}
                        className="font-mono text-[10px] text-muted-foreground hover:text-foreground">
                        {fmtDate(current?.at)}
                        {m.withAmount && current?.amount ? ` · ${formatCompactEur(current.amount)}` : ''}
                        {m.withInProgress && current?.in_progress ? ' · in progress' : ''}
                      </button>
                    )}
                    {isEditing && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Input type="date" value={msDraft.at} onChange={e => setMsDraft(d => d && { ...d, at: e.target.value })} className="h-6 text-[10px] w-32" />
                        {m.withAmount && (
                          <Input type="number" value={msDraft.amount} placeholder="€"
                            onChange={e => setMsDraft(d => d && { ...d, amount: e.target.value })}
                            autoComplete="off" className="h-6 text-[10px] w-20" />
                        )}
                        {m.withInProgress && (
                          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <input type="checkbox" checked={msDraft.inProgress} onChange={e => setMsDraft(d => d && { ...d, inProgress: e.target.checked })} className="h-3 w-3" />
                            in progress
                          </label>
                        )}
                        <Button size="sm" className="h-6 text-[10px] px-2"
                          onClick={() => {
                            const entry: MilestoneEntry = { at: new Date(msDraft.at).toISOString() };
                            if (m.withAmount && msDraft.amount) entry.amount = Number(msDraft.amount);
                            if (m.withInProgress) entry.in_progress = msDraft.inProgress;
                            setMilestone.mutate({ id: pitchId, key: m.key, entry, milestones: pitch.milestones || {} });
                            setMsDraft(null);
                          }}>✓</Button>
                        <button onClick={() => setMsDraft(null)} className="text-[10px] text-muted-foreground">cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Negotiation History */}
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Negotiation History</h3>
            <div className="flex gap-1.5 mb-2 flex-wrap">
              <select value={negType} onChange={e => setNegType(e.target.value)} className="h-7 text-[11px] bg-background border border-border rounded-md px-2">
                {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <Input value={negAmount} onChange={e => setNegAmount(e.target.value)} type="number" placeholder="€" autoComplete="off" className="h-7 text-[11px] w-24" />
              <Input value={negNote} onChange={e => setNegNote(e.target.value)} placeholder="Note" autoComplete="off" className="h-7 text-[11px] flex-1 min-w-[100px]"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNegEntry(); } }} />
              <Button onClick={handleAddNegEntry} className="h-7 text-[11px] px-2">Add</Button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {negotiations.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No entries yet</p>
              ) : (
                negotiations.map(entry => (
                  <div key={entry.id} className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded hover:bg-muted/20">
                    <span className="font-mono text-[10px] text-muted-foreground w-14 shrink-0">{fmtDate(entry.created_at)}</span>
                    <span className="text-[10px] text-muted-foreground w-20 shrink-0 truncate">{entry.entry_type}</span>
                    {entry.amount != null && <span className="font-mono text-foreground">{formatCompactEur(entry.amount)}</span>}
                    {entry.note && <span className="text-muted-foreground flex-1 truncate">{entry.note}</span>}
                    <button onClick={() => deleteNegEntry.mutate({ id: entry.id, buy_pitch_id: pitchId })} className="text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="mt-4 border-t border-border pt-3 pb-6">
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Notes</h3>
            <div className="space-y-2 mb-3">
              <Textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Add a note... (Shift+Enter for new paragraph)"
                autoComplete="off"
                className="min-h-[120px] text-[12px] resize-y whitespace-pre-wrap"
              />
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pendingFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/40 border border-border text-[10px]">
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-[140px] truncate">{f.name}</span>
                      <button onClick={() => setPendingFiles(p => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    setPendingFiles(p => [...p, ...files]);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 text-[11px] px-2"
                >
                  <Paperclip className="h-3 w-3 mr-1" /> Attach
                </Button>
                <Button
                  onClick={handleAddNote}
                  disabled={uploading || (!noteText.trim() && pendingFiles.length === 0)}
                  className="h-7 text-[11px] px-3"
                >
                  {uploading ? 'Saving…' : 'Add Note'}
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No notes</p>
              ) : (
                notes.map(n => (
                  <div key={n.id} className="px-2 py-2 rounded border border-border bg-card/50 space-y-1">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono">{fmtDate(n.created_at)}</span>
                      <span className="flex-1">{n.logged_by}</span>
                    </div>
                    {n.note && <p className="text-[12px] text-foreground whitespace-pre-wrap break-words">{n.note}</p>}
                    {n.attachments && n.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {n.attachments.map((att, i) => (
                          <button
                            key={i}
                            onClick={() => downloadAttachment(att)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/40 border border-border text-[10px] hover:bg-muted/60"
                          >
                            <Download className="h-3 w-3" />
                            <span className="max-w-[180px] truncate">{att.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </SheetContent>
      </Sheet>

      {/* Close-as prompt */}
      <Dialog open={closePromptOpen} onOpenChange={v => { if (!v) setClosePromptOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Close pitch as…</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {CLOSED_STAGES_UI.map(s => (
              <Button key={s.value} variant="outline" className="h-9 text-xs"
                onClick={() => {
                  const reason = CLOSED_STAGE_TO_LOSS_REASON[s.value] ?? null;
                  setLoss.mutate({ id: pitchId, stage: s.value, loss_reason: reason });
                  setClosePromptOpen(false);
                }}>
                {s.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

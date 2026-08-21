import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScoutedTargets, useAddScoutedTarget, useUpdateScoutedTarget, useDeleteScoutedTarget, useAddBuyPitch, type ScoutedTarget } from '@/hooks/useBuyData';
import { useContacts, useCreateContact } from '@/hooks/useData';
import { useAuth } from '@/hooks/useAuth';
import { useEnrichScoutedTarget } from '@/hooks/useEnrichScoutedTarget';
import { useBulkEnrich, needsEnrichment } from '@/hooks/useBulkEnrich';
import { AddScoutedTargetSheet } from '@/components/AddScoutedTargetSheet';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Plus, LayoutGrid, List, Trash2, Pencil, X, Link as LinkIcon, SendHorizonal, RefreshCw, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';

const POSITION_FILTERS = ['All', 'GK', 'DEF', 'MID', 'FWD'] as const;
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];

function getPositionGroup(pos: string): string {
  if (['GK'].includes(pos)) return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(pos)) return 'DEF';
  if (['DM', 'CM', 'AM', 'RM', 'LM'].includes(pos)) return 'MID';
  if (['CF', 'ST', 'LW', 'RW', 'FW', 'SS'].includes(pos)) return 'FWD';
  return 'MID';
}

const positionPillColor = (group: string) => {
  switch (group) {
    case 'GK': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
    case 'DEF': return 'bg-blue-500/15 text-blue-400 border-blue-500/25';
    case 'MID': return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
    case 'FWD': return 'bg-red-500/15 text-red-400 border-red-500/25';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const positionAvatarBg = (group: string) => {
  switch (group) {
    case 'GK': return 'bg-emerald-600';
    case 'DEF': return 'bg-blue-600';
    case 'MID': return 'bg-amber-600';
    case 'FWD': return 'bg-red-600';
    default: return 'bg-muted';
  }
};

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function contractEndDisplay(dateStr?: string | null) {
  if (!dateStr) return { text: '—', className: '' };
  const d = new Date(dateStr);
  const text = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30);
  if (diffMonths <= 6) return { text, className: 'text-red-400' };
  if (diffMonths <= 12) return { text, className: 'text-amber-400' };
  return { text, className: '' };
}

const tenureBadge = (tenure: string | null) => {
  switch (tenure) {
    case 'loan':       return { label: 'LOAN',      className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    case 'free_agent': return { label: 'FREE',      className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' };
    case 'permanent':  return { label: 'PERMANENT', className: 'bg-muted text-muted-foreground border-border' };
    default:           return { label: '—',         className: 'bg-muted text-muted-foreground border-border' };
  }
};

const priorityColor = (p: string) => {
  switch (p) {
    case 'High': return 'bg-red-500/15 text-red-400 border-red-500/25';
    case 'Medium': return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
    case 'Low': return 'bg-blue-500/15 text-blue-400 border-blue-500/25';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

interface TargetFormData {
  name: string;
  position: string;
  age: string;
  date_of_birth: string;
  nationality: string;
  league: string;
  current_club: string;
  contract_end: string;
  market_value: string;
  height: string;
  foot: string;
  photo_url: string;
  salary_estimate: string;
  agent_name: string;
  agent_contact: string;
  priority_ranking: string;
  notes: string;
  tm_link: string;
  has_valuation: string;
  valuation_url: string;
}

const emptyForm: TargetFormData = {
  name: '', position: '', age: '', date_of_birth: '', nationality: '', league: '', current_club: '',
  contract_end: '', market_value: '', height: '', foot: '', photo_url: '',
  salary_estimate: '', agent_name: '', agent_contact: '', priority_ranking: 'Medium', notes: '',
  tm_link: '', has_valuation: 'No', valuation_url: '',
};

function TargetFormDialog({ open, onClose, initial, onSubmit, title, leagueClubMap }: {
  open: boolean; onClose: () => void; initial: TargetFormData; onSubmit: (d: TargetFormData) => void; title: string;
  leagueClubMap: Record<string, string[]>;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof TargetFormData, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const leagues = useMemo(() => Object.keys(leagueClubMap).sort(), [leagueClubMap]);
  const clubsForLeague = useMemo(() => {
    if (!form.league) return [];
    return (leagueClubMap[form.league] || []).sort();
  }, [form.league, leagueClubMap]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        {/* TM Link */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <LinkIcon className="h-3 w-3" /> Transfermarkt Link
          </label>
          <Input
            value={form.tm_link}
            onChange={e => set('tm_link', e.target.value)}
            placeholder="https://www.transfermarkt.com/..."
            className="h-8 text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name *</label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Position</label>
            <Input value={form.position} onChange={e => set('position', e.target.value)} placeholder="e.g. CB, LW" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Age</label>
            <Input value={form.age} onChange={e => set('age', e.target.value)} type="number" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Date of Birth</label>
            <Input value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} type="date" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nationality</label>
            <Input value={form.nationality} onChange={e => set('nationality', e.target.value)} className="h-8 text-xs" />
          </div>

          {/* League dropdown */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">League</label>
            <select
              value={form.league}
              onChange={e => { set('league', e.target.value); set('current_club', ''); }}
              className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
            >
              <option value="">— Select League —</option>
              {leagues.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Club dropdown */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Club</label>
            {form.league ? (
              <select
                value={form.current_club}
                onChange={e => set('current_club', e.target.value)}
                className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
              >
                <option value="">— Select Club —</option>
                {clubsForLeague.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <Input value={form.current_club} onChange={e => set('current_club', e.target.value)} placeholder="Select league first or type" className="h-8 text-xs" />
            )}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Contract End</label>
            <Input value={form.contract_end} onChange={e => set('contract_end', e.target.value)} type="date" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Market Value (€)</label>
            <Input value={form.market_value} onChange={e => set('market_value', e.target.value)} type="number" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Salary Est. (€/yr)</label>
            <Input value={form.salary_estimate} onChange={e => set('salary_estimate', e.target.value)} type="number" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Height</label>
            <Input value={form.height} onChange={e => set('height', e.target.value)} placeholder="e.g. 185cm" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Foot</label>
            <select value={form.foot} onChange={e => set('foot', e.target.value)} className="w-full h-8 text-xs bg-background border border-border rounded-md px-2">
              <option value="">—</option>
              <option value="Left">Left</option>
              <option value="Right">Right</option>
              <option value="Both">Both</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</label>
            <select value={form.priority_ranking} onChange={e => set('priority_ranking', e.target.value)} className="w-full h-8 text-xs bg-background border border-border rounded-md px-2">
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Photo URL</label>
            <Input value={form.photo_url} onChange={e => set('photo_url', e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent Name</label>
            <Input value={form.agent_name} onChange={e => set('agent_name', e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent Contact</label>
            <Input value={form.agent_contact} onChange={e => set('agent_contact', e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Valuation Study */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valuation Study</label>
            <select
              value={form.has_valuation}
              onChange={e => set('has_valuation', e.target.value)}
              className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
          {form.has_valuation === 'Yes' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valuation Link</label>
              <Input value={form.valuation_url} onChange={e => set('valuation_url', e.target.value)} placeholder="https://..." className="h-8 text-xs" />
            </div>
          )}

          <div className="col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="w-full h-20 text-xs bg-background border border-border rounded-md p-2 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose} className="h-8 text-xs">Cancel</Button>
          <Button onClick={() => { if (!form.name.trim()) { toast.error('Name is required'); return; } onSubmit(form); }} className="h-8 text-xs">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fmtEur(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n.toFixed(0)}`;
}
function fmtDDMMYYYY(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Plain-English version of the reason TransferRoom enrichment gave up.
 *
 * These need genuinely different fixes — an unmapped club is a data-import job,
 * a proxy 401 is a credentials job, no_match is a per-player judgement call — so
 * saying which one it is saves a trip to the function logs.
 */
function trFailMessage(reason?: string | null): string {
  switch (reason) {
    case 'club_not_in_clubs_table':   return "TR: this club isn't in the clubs table yet";
    case 'club_not_mapped_to_tr':     return 'TR: club has no TransferRoom mapping';
    case 'team_not_in_competition_pool': return "TR: team not in that competition's squad list";
    case 'no_match':                  return 'TR: no player matched this name';
    case 'proxy_not_configured':      return 'TR: proxy token not set';
    case 'proxy_401':
    case 'proxy_403':                 return 'TR: TransferRoom rejected our credentials';
    case undefined:
    case null:
    case 'unknown':                   return "Couldn't fetch from TR";
    default:                          return `TR: ${reason}`;
  }
}

function TargetCard({ target, onOpen, onEdit, onDelete, onCreatePitch, onRetry, isRetrying }: {
  target: ScoutedTarget; onOpen: () => void; onEdit: () => void; onDelete: () => void; onCreatePitch: () => void;
  onRetry: (sources: ('tm' | 'tr')[]) => void; isRetrying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const group = getPositionGroup(target.position);
  const contract = contractEndDisplay(target.contract_end);
  const initials = getInitials(target.name);
  const tmPending = target.tm_status === 'pending';
  const trPending = target.tr_status === 'pending';
  const tmFailed = target.tm_status === 'failed';
  const trFailed = target.tr_status === 'failed';
  const anyFailed = tmFailed || trFailed;
  const failedSources: ('tm' | 'tr')[] = [
    ...(tmFailed ? ['tm' as const] : []),
    ...(trFailed ? ['tr' as const] : []),
  ];

  return (
    <div
      onDoubleClick={() => setExpanded(e => !e)}
      title="Double-click to expand"
      className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary/40 transition-colors relative group select-none"
    >
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onCreatePitch(); }} className="w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-primary/20" title="Create Pitch">
          <SendHorizonal className="h-3 w-3 text-muted-foreground" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-accent">
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-destructive/20">
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
      {/* Transfermarkt portraits are 3:4 head-and-shoulders; a square card crops
          a quarter of the height. Take it off the bottom, not the top, or the
          hairline gets clipped and every player looks cut off. */}
      <div className="aspect-square relative overflow-hidden bg-muted">
        {target.photo_url ? (
          <img src={target.photo_url} alt={target.name} className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} />
        ) : tmPending ? (
          <Skeleton className="w-full h-full" />
        ) : (
          <div className={cn('w-full h-full flex items-center justify-center', positionAvatarBg(group))}>
            <span className="text-3xl font-bold text-white/90">{initials}</span>
          </div>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          {/* The card keeps double-click for expand, so the name is the way in
              to the dossier — a single click here can't be mistaken for one. */}
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="text-sm font-medium text-foreground truncate text-left hover:text-primary hover:underline"
          >
            {target.name}
          </button>
          {target.position ? (
            <span className={cn('shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', positionPillColor(group))}>
              {target.position}
            </span>
          ) : tmPending ? (
            <Skeleton className="h-4 w-8" />
          ) : (
            <span className="shrink-0 text-[10px] text-muted-foreground">—</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{target.current_club || 'Unknown Club'}</p>
        {target.league && <p className="text-[10px] text-muted-foreground">{target.league}</p>}
        {target.contract_end ? (
          <p className={cn('text-xs', contract.className || 'text-muted-foreground')}>Contract: {contract.text} <span className="text-[9px] text-muted-foreground/70 font-mono">TM</span></p>
        ) : tmPending ? <Skeleton className="h-3 w-24" /> : null}

        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border', priorityColor(target.priority_ranking))}>
            {target.priority_ranking}
          </span>
          {target.market_value ? (
            <span className="text-[10px] text-muted-foreground font-mono">{fmtEur(target.market_value)} <span className="text-muted-foreground/70">TM</span></span>
          ) : tmPending ? <Skeleton className="h-3 w-14" /> : null}
        </div>

        {/* TR enrichment row */}
        {(target.xtv != null || target.gbe_score || target.tr_asking_price != null || target.tr_availability || trPending) && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/50">
            {target.xtv != null ? (
              <span className="text-[10px] font-mono text-foreground">
                xTV {fmtEur(target.xtv)}
                {target.xtv_as_of && <span className="text-muted-foreground/70"> · {fmtDDMMYYYY(target.xtv_as_of)}</span>}
                <span className="text-muted-foreground/70"> TR</span>
              </span>
            ) : trPending ? <Skeleton className="h-3 w-20" /> : null}
            {target.tr_asking_price != null && (
              <span className="text-[10px] font-mono text-foreground">
                Ask {fmtEur(target.tr_asking_price)} <span className="text-muted-foreground/70">TR</span>
              </span>
            )}
            {target.gbe_score ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border border-primary/30 text-primary">
                GBE {target.gbe_score}
              </span>
            ) : trPending ? <Skeleton className="h-3 w-10" /> : null}
            {target.tr_availability && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border border-border text-muted-foreground">
                {target.tr_availability}
              </span>
            )}
          </div>
        )}

        {/* Failure banner + retry */}
        {anyFailed && (
          <div className="flex items-center gap-1.5 pt-1 text-[10px] text-amber-500/90">
            <AlertTriangle className="h-3 w-3" />
            <span>
              {tmFailed && trFailed ? "Couldn't fetch TM or TR"
                : tmFailed ? "Couldn't fetch from TM"
                : trFailMessage(target.tr_fail_reason)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(failedSources); }}
              disabled={isRetrying}
              className="ml-auto inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', isRetrying && 'animate-spin')} /> Retry
            </button>
          </div>
        )}

        {target.enrichment_notes && (
          <p className="text-[10px] text-amber-500/80 italic">{target.enrichment_notes}</p>
        )}

        {target.agent_name && (
          <p className="text-[10px] text-muted-foreground">Agent: {target.agent_name}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {target.tm_link && (
            <a href={target.tm_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-primary hover:underline">
              Open TM
            </a>
          )}
          {target.has_valuation && target.valuation_url && (
            <a href={target.valuation_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-primary hover:underline">
              📊 Valuation Study
            </a>
          )}
        </div>

        {expanded && (() => {
          const tr = (target.tr_data ?? {}) as Record<string, unknown>;
          const trContract = (tr.ContractExpiry ?? tr.ContractEnd) as string | undefined;
          const trMV = (tr.MarketValue ?? tr.Marketvalue) as number | undefined;
          const trSalLow = tr.EstimatedSalaryLow as number | undefined;
          const trSalHigh = tr.EstimatedSalaryHigh as number | undefined;
          return (
            <div className="pt-2 mt-1 border-t border-border/50 space-y-1 text-[10px] text-muted-foreground">
              {target.date_of_birth && <p>DOB: <span className="text-foreground font-mono">{fmtDDMMYYYY(target.date_of_birth)}</span>{target.age ? ` · Age ${target.age}` : ''}</p>}
              {target.nationality && <p>Nationality: <span className="text-foreground">{target.nationality}</span></p>}
              {(target.height || target.foot) && (
                <p>{target.height && <>Height: <span className="text-foreground">{target.height}</span></>}{target.height && target.foot ? ' · ' : ''}{target.foot && <>Foot: <span className="text-foreground">{target.foot}</span></>}</p>
              )}
              {target.salary_estimate != null && <p>Salary est: <span className="text-foreground font-mono">{fmtEur(target.salary_estimate)}/yr</span> <span className="text-muted-foreground/70">TM</span></p>}
              {target.tr_salary != null && <p>TR salary: <span className="text-foreground font-mono">{fmtEur(target.tr_salary)}/yr</span> <span className="text-muted-foreground/70">TR</span></p>}
              {(trSalLow != null || trSalHigh != null) && (
                <p>TR salary range: <span className="text-foreground font-mono">{fmtEur(trSalLow ?? null)} – {fmtEur(trSalHigh ?? null)}</span></p>
              )}
              {trMV != null && <p>TR market value: <span className="text-foreground font-mono">{fmtEur(trMV)}</span></p>}
              {target.tr_asking_price != null && <p>Asking price: <span className="text-foreground font-mono">{fmtEur(target.tr_asking_price)}</span> <span className="text-muted-foreground/70">TR</span></p>}
              {trContract && <p>TR contract end: <span className="text-foreground font-mono">{fmtDDMMYYYY(trContract)}</span></p>}
              {target.tr_availability && <p>Availability: <span className="text-foreground">{target.tr_availability}</span></p>}
              {target.agent_contact && <p>Agent contact: <span className="text-foreground">{target.agent_contact}</span></p>}
              {target.gbe_score && <p>GBE detail: <span className="text-foreground">{target.gbe_score}</span></p>}
              {target.notes && <p className="italic text-foreground/80 whitespace-pre-wrap">"{target.notes}"</p>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/**
 * Runs the whole roster through enrichment.
 *
 * An imported roster is names and links; everything a club document needs is
 * still to be fetched. The count is the point of the label — it says how much
 * of the roster is still only a name.
 */
function BulkEnrichButton({ targets, bulk }: {
  targets: ScoutedTarget[];
  bulk: ReturnType<typeof useBulkEnrich>;
}) {
  const pending = useMemo(() => targets.filter(needsEnrichment).length, [targets]);
  const { running, done, total, failed, current } = bulk.progress;

  if (running) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground font-mono">
          {done}/{total}
          {current && <span className="ml-1.5 text-muted-foreground/70">{current}</span>}
          {failed > 0 && <span className="ml-1.5 text-amber-400">{failed} failed</span>}
        </span>
        <Button variant="outline" onClick={bulk.cancel} className="h-8 text-xs">
          Stop
        </Button>
      </div>
    );
  }

  if (pending === 0) return null;

  return (
    <Button
      variant="outline"
      className="h-8 text-xs"
      onClick={async () => {
        const r = await bulk.run(targets);
        if (r.failed > 0) {
          toast.warning(`Enriched ${r.done - r.failed} of ${r.total}. ${r.failed} could not be read.`);
        } else {
          toast.success(`Enriched ${r.done} ${r.done === 1 ? 'player' : 'players'}.`);
        }
      }}
      title="Fetch photo, date of birth, height, foot, contract and valuation from each player's Transfermarkt link"
    >
      <Sparkles className="h-3.5 w-3.5 mr-1" /> Enrich {pending}
    </Button>
  );
}

export default function ScoutedTargetsPage() {
  const navigate = useNavigate();
  const { data: targets = [], isLoading } = useScoutedTargets();
  const bulk = useBulkEnrich();
  const { data: contacts = [] } = useContacts();
  const addMutation = useAddScoutedTarget();
  const updateMutation = useUpdateScoutedTarget();
  const deleteMutation = useDeleteScoutedTarget();
  const addPitch = useAddBuyPitch();
  const createContact = useCreateContact();
  const { session } = useAuth();
  const { retry: retryEnrichment, isRetrying } = useEnrichScoutedTarget();

  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ScoutedTarget | null>(null);
  const [pitchTarget, setPitchTarget] = useState<ScoutedTarget | null>(null);
  const [pitchContactId, setPitchContactId] = useState('');
  const [newAgentName, setNewAgentName] = useState<string | null>(null);

  // Build league → clubs map from contacts
  const leagueClubMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const c of contacts) {
      if (!c.market || !c.club) continue;
      if (!map[c.market]) map[c.market] = new Set();
      map[c.market].add(c.club);
    }
    const result: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(map)) {
      result[k] = Array.from(v);
    }
    return result;
  }, [contacts]);

  const filtered = useMemo(() => {
    let list = targets;
    if (posFilter !== 'All') list = list.filter(t => getPositionGroup(t.position) === posFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(s) || t.current_club.toLowerCase().includes(s) || t.nationality.toLowerCase().includes(s));
    }
    return list;
  }, [targets, posFilter, search]);

  const handleCreate = async (form: TargetFormData) => {
    try {
      await addMutation.mutateAsync({
        name: form.name,
        position: form.position,
        age: form.age ? Number(form.age) : null,
        date_of_birth: form.date_of_birth || null,
        nationality: form.nationality,
        league: form.league,
        current_club: form.current_club,
        contract_end: form.contract_end || null,
        market_value: form.market_value ? Number(form.market_value) : null,
        height: form.height,
        foot: form.foot,
        photo_url: form.photo_url,
        salary_estimate: form.salary_estimate ? Number(form.salary_estimate) : null,
        agent_name: form.agent_name,
        agent_contact: form.agent_contact,
        priority_ranking: form.priority_ranking,
        notes: form.notes,
        tm_link: form.tm_link,
        has_valuation: form.has_valuation === 'Yes',
        valuation_url: form.valuation_url,
      });
      toast.success(`Added ${form.name}`);
      setShowCreate(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleUpdate = async (form: TargetFormData) => {
    if (!editTarget) return;
    try {
      await updateMutation.mutateAsync({
        id: editTarget.id,
        name: form.name,
        position: form.position,
        age: form.age ? Number(form.age) : null,
        date_of_birth: form.date_of_birth || null,
        nationality: form.nationality,
        league: form.league,
        current_club: form.current_club,
        contract_end: form.contract_end || null,
        market_value: form.market_value ? Number(form.market_value) : null,
        height: form.height,
        foot: form.foot,
        photo_url: form.photo_url,
        salary_estimate: form.salary_estimate ? Number(form.salary_estimate) : null,
        agent_name: form.agent_name,
        agent_contact: form.agent_contact,
        priority_ranking: form.priority_ranking,
        notes: form.notes,
        tm_link: form.tm_link,
        has_valuation: form.has_valuation === 'Yes',
        valuation_url: form.valuation_url,
      });
      toast.success(`Updated ${form.name}`);
      setEditTarget(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (target: ScoutedTarget) => {
    if (!confirm(`Delete ${target.name}?`)) return;
    try {
      await deleteMutation.mutateAsync(target.id);
      toast.success(`Deleted ${target.name}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground font-mono text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[11px] tracking-[0.15em] font-bold text-primary uppercase">ROSTER</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-card border border-border rounded-md p-0.5">
            <button onClick={() => setViewMode('card')} className={cn('p-1.5 rounded transition-colors', viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode('table')} className={cn('p-1.5 rounded transition-colors', viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <BulkEnrichButton targets={targets} bulk={bulk} />
          <Button onClick={() => setShowCreate(true)} className="h-8 text-xs bg-primary text-primary-foreground">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Player
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border rounded-md p-0.5">
          {POSITION_FILTERS.map(f => (
            <button key={f} onClick={() => setPosFilter(f)} className={cn('px-2.5 py-1 rounded text-xs font-medium transition-colors', posFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {f}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search roster..." value={search} onChange={e => setSearch(e.target.value)} className="w-48 h-8 text-xs bg-card border-border pl-7" />
        </div>
      </div>

      {viewMode === 'card' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {filtered.length === 0 ? (
            <p className="col-span-full text-center text-muted-foreground font-mono text-sm py-8">No players yet yet</p>
          ) : (
            filtered.map(t => (
              <TargetCard key={t.id} target={t} onOpen={() => navigate(`/roster/${t.id}`)} onEdit={() => setEditTarget(t)} onDelete={() => handleDelete(t)} onCreatePitch={() => setPitchTarget(t)} onRetry={(sources) => retryEnrichment({ target: t, sources })} isRetrying={isRetrying} />
            ))
          )}
        </div>
      )}

      {viewMode === 'table' && (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Pos</th>
                <th className="px-3 py-2 text-left font-medium">League</th>
                <th className="px-3 py-2 text-left font-medium">Club</th>
                <th className="px-3 py-2 text-left font-medium">Nationality</th>
                <th className="px-3 py-2 text-left font-medium">Contract</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Agent</th>
                <th className="px-3 py-2 text-center font-medium">TM</th>
                <th className="px-3 py-2 text-center font-medium">Val.</th>
                <th className="px-3 py-2 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground font-mono">No players yet</td></tr>
              ) : (
                filtered.map((t, i) => {
                  const group = getPositionGroup(t.position);
                  const contract = contractEndDisplay(t.contract_end);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/roster/${t.id}`)}
                      className={cn('h-11 border-b border-border/50 hover:bg-accent/50 transition-colors cursor-pointer', i % 2 === 0 && 'bg-card/50')}
                    >
                      <td className="px-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            {t.photo_url ? <AvatarImage src={t.photo_url} alt={t.name} className="object-cover object-top" /> : null}
                            <AvatarFallback className={cn('text-[10px] font-medium text-white', positionAvatarBg(group))}>{getInitials(t.name)}</AvatarFallback>
                          </Avatar>
                          {t.name}
                        </div>
                      </td>
                      <td className="px-3"><span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', positionPillColor(group))}>{t.position || '—'}</span></td>
                      <td className="px-3 text-muted-foreground">{t.league || '—'}</td>
                      <td className="px-3 text-muted-foreground">
                        <div>{t.current_club || '—'}</div>
                        {t.tenure === 'loan' && t.owner_club && (
                          <div className="text-[10px] text-muted-foreground/70 italic">from {t.owner_club}</div>
                        )}
                      </td>
                      <td className="px-3 text-muted-foreground">{t.nationality || '—'}</td>
                      <td className={cn('px-3', contract.className)}>
                        <div>{contract.text}</div>
                        {t.tenure === 'loan' && t.loan_contract_end && (
                          <div className="text-[10px] text-muted-foreground/70">
                            loan ends {contractEndDisplay(t.loan_contract_end).text}
                          </div>
                        )}
                      </td>
                      <td className="px-3 text-right text-foreground">{t.market_value ? `€${(t.market_value / 1000000).toFixed(1)}M` : '—'}</td>
                      <td className="px-3">
                        {(() => {
                          const b = tenureBadge(t.tenure);
                          return <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border', b.className)}>{b.label}</span>;
                        })()}
                      </td>
                      <td className="px-3 text-muted-foreground">{t.agent_name || '—'}</td>
                      <td className="px-3 text-center">
                        {t.tm_link ? (
                          <a href={t.tm_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-primary hover:underline text-[10px]">TM</a>
                        ) : '—'}
                      </td>
                      <td className="px-3 text-center">
                        {t.has_valuation && t.valuation_url ? (
                          <a href={t.valuation_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-primary hover:underline text-[10px]">📊</a>
                        ) : t.has_valuation ? '✓' : '—'}
                      </td>
                      <td className="px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); setPitchTarget(t); }} className="p-1 rounded hover:bg-primary/20" title="Create Pitch"><SendHorizonal className="h-3 w-3 text-muted-foreground" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setEditTarget(t); }} className="p-1 rounded hover:bg-accent"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(t); }} className="p-1 rounded hover:bg-destructive/20"><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground font-mono">{filtered.length} players</div>
        </div>
      )}

      <AddScoutedTargetSheet open={showCreate} onClose={() => setShowCreate(false)} />
      {editTarget && (
        <TargetFormDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          initial={{
            name: editTarget.name,
            position: editTarget.position,
            age: editTarget.age?.toString() || '',
            date_of_birth: editTarget.date_of_birth || '',
            nationality: editTarget.nationality,
            league: editTarget.league || '',
            current_club: editTarget.current_club,
            contract_end: editTarget.contract_end || '',
            market_value: editTarget.market_value?.toString() || '',
            height: editTarget.height,
            foot: editTarget.foot,
            photo_url: editTarget.photo_url,
            salary_estimate: editTarget.salary_estimate?.toString() || '',
            agent_name: editTarget.agent_name,
            agent_contact: editTarget.agent_contact,
            priority_ranking: editTarget.priority_ranking,
            notes: editTarget.notes,
            tm_link: editTarget.tm_link || '',
            has_valuation: editTarget.has_valuation ? 'Yes' : 'No',
            valuation_url: editTarget.valuation_url || '',
          }}
          onSubmit={handleUpdate}
          title="Edit Scouted Target"
          leagueClubMap={leagueClubMap}
        />
      )}

      {/* Quick Create Pitch Dialog */}
      {pitchTarget && (() => {
        const teamContacts = contacts.filter(c => c.club && pitchTarget.current_club && c.club.toLowerCase() === pitchTarget.current_club.toLowerCase());
        const reset = () => { setPitchTarget(null); setPitchContactId(''); setNewAgentName(null); };
        return (
        <Dialog open onOpenChange={reset}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Create Pitch for {pitchTarget.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Contact (selling club/agent) *</label>
                <select
                  value={newAgentName !== null ? '__new_agent__' : pitchContactId}
                  onChange={e => {
                    if (e.target.value === '__new_agent__') { setNewAgentName(''); setPitchContactId(''); }
                    else { setNewAgentName(null); setPitchContactId(e.target.value); }
                  }}
                  className="w-full h-8 text-xs bg-background border border-border rounded-md px-2"
                >
                  <option value="">Select contact...</option>
                  {teamContacts.length > 0 && (
                    <optgroup label={pitchTarget.current_club}>
                      {teamContacts.map(c => <option key={c.id} value={c.id}>{c.contact_person || c.club}</option>)}
                    </optgroup>
                  )}
                  <option value="__new_agent__">＋ Create New — Agent</option>
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
                    autoFocus
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={reset} className="h-8 text-xs">Cancel</Button>
                <Button className="h-8 text-xs" onClick={async () => {
                  try {
                    let contactId = pitchContactId;
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
                    if (!contactId) { toast.error('Select a contact'); return; }
                    const { action } = await addPitch.mutateAsync({
                      scouted_target_id: pitchTarget.id,
                      contact_id: contactId,
                    });
                    if (action === 'reopened') toast.success(`Re-opened pitch for ${pitchTarget.name}`);
                    else if (action === 'opened') toast.info(`Pitch already exists for ${pitchTarget.name}`);
                    else toast.success(`Pitch created for ${pitchTarget.name}`);
                    reset();
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}>Create Pitch</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        );
      })()}
    </div>
  );
}

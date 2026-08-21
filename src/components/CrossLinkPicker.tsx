import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useContacts } from '@/hooks/useData';
import { useScoutedTargets, useBuyPitches } from '@/hooks/useBuyData';
import {
  useAddFollowUpLink,
  type FollowUpTarget,
  type FollowUpTargetType,
} from '@/hooks/useFollowUps';
import { toast } from 'sonner';

interface CrossLinkPickerProps {
  /** Existing follow-up id — when present, picker writes links to DB on select. */
  followUpId?: string;
  /** Existing primary + cross-link keys ("type:id") to exclude from results. */
  excludeKeys: Set<string>;
  /** Creation-mode callback — bubble picked target up to caller (no DB write). */
  onSelect?: (target: FollowUpTarget) => void;
  onClose: () => void;
}

const TYPE_LABEL: Record<FollowUpTargetType, string> = {
  contact: 'Contact',
  scouted_target: 'Scouted',
  buy_pitch: 'Buy Pitch',
};

const TYPE_BADGE: Record<FollowUpTargetType, string> = {
  contact: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  scouted_target: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  buy_pitch: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
};

const TYPE_FILTERS: Array<{ key: 'all' | FollowUpTargetType; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'contact', label: 'Contacts' },
  { key: 'scouted_target', label: 'Scouted' },
  { key: 'buy_pitch', label: 'Buy' },
];

const CrossLinkPicker = ({ followUpId, excludeKeys, onSelect, onClose }: CrossLinkPickerProps) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | FollowUpTargetType>('all');

  const { data: contacts = [] } = useContacts();
  const { data: scoutedTargets = [] } = useScoutedTargets();
  const { data: buyPitches = [] } = useBuyPitches();

  const addLink = useAddFollowUpLink();

  const allOptions: FollowUpTarget[] = useMemo(() => {
    const opts: FollowUpTarget[] = [];

    contacts.forEach((c: any) => {
      const label = c.contact_person?.trim() || c.club || 'Contact';
      opts.push({
        type: 'contact',
        id: c.id,
        label,
        sublabel: c.club || undefined,
      });
    });

    scoutedTargets.forEach((s: any) => {
      opts.push({
        type: 'scouted_target',
        id: s.id,
        label: s.name,
        sublabel: s.current_club || undefined,
      });
    });

    const scoutedById: Record<string, any> = {};
    scoutedTargets.forEach((s: any) => { scoutedById[s.id] = s; });
    const contactById: Record<string, any> = {};
    contacts.forEach((c: any) => { contactById[c.id] = c; });

    buyPitches.forEach((p: any) => {
      const playerName = scoutedById[p.scouted_target_id]?.name || 'Player';
      const club = contactById[p.contact_id]?.club || 'Club';
      opts.push({
        type: 'buy_pitch',
        id: p.id,
        label: `${playerName} ← ${club}`,
        sublabel: p.stage,
      });
    });

    return opts;
  }, [contacts, scoutedTargets, buyPitches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allOptions
      .filter((o) => filter === 'all' || o.type === filter)
      .filter((o) => !excludeKeys.has(`${o.type}:${o.id}`))
      .filter((o) => {
        if (q.length < 2) return false;
        return (
          o.label.toLowerCase().includes(q) ||
          (o.sublabel || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 25);
  }, [allOptions, query, filter, excludeKeys]);

  const handlePick = async (opt: FollowUpTarget) => {
    if (onSelect) {
      onSelect(opt);
      setQuery('');
      return;
    }
    if (!followUpId) return;
    try {
      await addLink.mutateAsync({ follow_up_id: followUpId, link: opt });
      toast.success('🔗 Linked');
      setQuery('');
    } catch {
      toast.error('Failed to add link');
    }
  };

  return (
    <div className="mt-2 p-3 rounded-md border border-border bg-background space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">Add cross-link</p>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'text-[10px] px-2 py-0.5 rounded border font-medium uppercase tracking-wide transition-colors',
              filter === f.key
                ? 'border-primary text-primary bg-primary/10'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or club…"
          className="h-8 text-xs pl-7 bg-background border-border"
        />
      </div>

      {query.trim().length < 2 ? (
        <p className="text-[10px] text-muted-foreground italic px-1">
          Type at least 2 characters to search.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic px-1">
          No matches.
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map((opt) => (
            <button
              key={`${opt.type}:${opt.id}`}
              onClick={() => handlePick(opt)}
              disabled={addLink.isPending}
              className="w-full flex items-center gap-2 p-1.5 rounded border border-border bg-background/40 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left disabled:opacity-50"
            >
              <span
                className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide',
                  TYPE_BADGE[opt.type]
                )}
              >
                {TYPE_LABEL[opt.type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{opt.label}</p>
                {opt.sublabel && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {opt.sublabel}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CrossLinkPicker;

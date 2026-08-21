import { useState, useMemo } from 'react';
import { useFollowUps, useCompleteFollowUp, useDeleteFollowUp, type FollowUp, type FollowUpTargetType } from '@/hooks/useFollowUps';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Trash2, CheckSquare, Square, List, CalendarDays } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import ContactDetail from '@/components/ContactDetail';
import FollowUpDetailPanel from '@/components/FollowUpDetailPanel';
import FollowUpCalendar from '@/components/FollowUpCalendar';
import { TYPE_BADGE } from '@/lib/followUpDisplay';
import { parseDateKey, todayKey } from '@/lib/dateKeys';

type TabKey = 'all' | 'contact' | 'player' | 'pitch';

/** Reminder cards, as many abreast as the screen has room for. */
const REMINDER_GRID = 'grid gap-2 sm:grid-cols-2 2xl:grid-cols-3';

const TAB_DEFS: { key: TabKey; label: string; types: FollowUpTargetType[] }[] = [
  { key: 'all', label: 'All', types: ['contact', 'scouted_target', 'buy_pitch'] },
  { key: 'contact', label: 'Contacts', types: ['contact'] },
  { key: 'player', label: 'Players', types: ['scouted_target'] },
  { key: 'pitch', label: 'Pitches', types: ['buy_pitch'] },
];

interface ReminderCardProps {
  item: FollowUp;
  isCompleted?: boolean;
  today: string;
  onSelect: (item: FollowUp) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

const ReminderCard = ({ item, isCompleted = false, today, onSelect, onComplete, onDelete }: ReminderCardProps) => {
  const badge = TYPE_BADGE[item.target_type];
  const dateColor =
    item.due_date < today ? 'text-destructive'
    : item.due_date === today ? 'text-[#c8952a]'
    : 'text-muted-foreground';
  return (
    <div
      className={cn(
        'group relative rounded-lg p-3 transition-colors cursor-pointer',
        isCompleted ? 'opacity-50' : 'hover:bg-accent/30',
        item.due_date < today && !isCompleted && 'border-l-[3px] border-l-destructive',
        item.due_date === today && !isCompleted && 'border-l-[3px] border-l-[#c8952a]',
      )}
      style={{ background: isCompleted ? 'transparent' : 'rgba(255,255,255,0.03)' }}
      onClick={() => onSelect(item)}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={(e) => { e.stopPropagation(); if (!isCompleted) onComplete(item.id); }}
          className="mt-0.5 shrink-0"
          disabled={isCompleted}
        >
          {isCompleted ? (
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide shrink-0', badge.className)}>
              {badge.label}
            </span>
            <span className="text-sm font-medium text-foreground truncate">{item.target_label}</span>
            {item.target_sublabel && (
              <>
                <span className="text-xs text-muted-foreground">—</span>
                <span className="text-xs text-muted-foreground truncate">{item.target_sublabel}</span>
              </>
            )}
          </div>
          <p className={cn('text-xs mt-0.5', isCompleted ? 'line-through text-muted-foreground' : 'text-foreground')}>
            {item.action_text}
          </p>
          <p className={cn('text-[10px] font-mono mt-0.5', dateColor)}>
            Due: {format(parseDateKey(item.due_date), 'MMM d, yyyy')}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

const PendingActionsPage = () => {
  const { data: followUps = [], isLoading } = useFollowUps();
  const completeFollowUp = useCompleteFollowUp();
  const deleteFollowUp = useDeleteFollowUp();
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  /**
   * The list answers "what is late"; the calendar answers "what does my week
   * look like". Both are worth having, so neither replaces the other.
   */
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null);

  const today = todayKey();

  // Filter by tab first
  const tabTypes = TAB_DEFS.find(t => t.key === activeTab)!.types;
  const visible = useMemo(
    () => followUps.filter(f => tabTypes.includes(f.target_type)),
    [followUps, tabTypes]
  );

  const overdue = visible.filter(f => !f.completed && f.due_date < today);
  const todayItems = visible.filter(f => !f.completed && f.due_date === today);
  const upcoming = visible.filter(f => !f.completed && f.due_date > today);
  const completed = visible.filter(f => f.completed).sort((a, b) =>
    (b.completed_at || '').localeCompare(a.completed_at || '')
  );

  /**
   * What the calendar plots. Same tab filter and same show-completed switch as
   * the list, so flipping views never changes which reminders exist — only how
   * they are arranged.
   */
  const calendarItems = useMemo(
    () => (showCompleted ? visible : visible.filter(f => !f.completed)),
    [visible, showCompleted],
  );

  // Group upcoming by date
  const upcomingByDate = upcoming.reduce<Record<string, FollowUp[]>>((acc, f) => {
    if (!acc[f.due_date]) acc[f.due_date] = [];
    acc[f.due_date].push(f);
    return acc;
  }, {});

  // Counts for tab pips
  const tabCounts = useMemo(() => {
    const out: Record<TabKey, number> = { all: 0, contact: 0, player: 0, pitch: 0 };
    followUps.forEach(f => {
      if (f.completed) return;
      if (f.due_date > today) return; // count overdue + today only
      if (f.target_type === 'buy_pitch') return; // buy-side reminders live on the Buy Pipeline page
      out.all++;
      if (f.target_type === 'contact') out.contact++;
      else if (f.target_type === 'scouted_target') out.player++;
      else if (f.target_type === 'buy_pitch') out.pitch++;
    });
    return out;
  }, [followUps, today]);

  const handleComplete = (id: string) => {
    completeFollowUp.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this reminder?')) {
      deleteFollowUp.mutate(id);
    }
  };


  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><span className="text-muted-foreground font-mono text-sm">Loading...</span></div>;
  }

  const hasActiveItems = overdue.length > 0 || todayItems.length > 0 || upcoming.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Pending Actions</h1>
          <p className="text-xs text-muted-foreground">Follow-up reminders for contacts, players, and pitches</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
            {([['list', List], ['calendar', CalendarDays]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={mode === 'list' ? 'List view' : 'Calendar view'}
                aria-label={mode === 'list' ? 'List view' : 'Calendar view'}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  viewMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Show completed
            <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
          </label>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TAB_DEFS.map(tab => {
          const count = tabCounts[tab.key];
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5',
                isActive
                  ? 'border-[#c8952a] text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                  style={{ background: isActive ? '#c8952a' : 'rgba(255,255,255,0.08)', color: isActive ? '#fff' : 'inherit' }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {viewMode === 'calendar' && (
        <FollowUpCalendar
          items={calendarItems}
          today={today}
          onSelect={setSelectedFollowUp}
          onComplete={handleComplete}
          onDelete={handleDelete}
        />
      )}

      {viewMode === 'list' && !hasActiveItems && !showCompleted && (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">No pending follow-ups</p>
          <p className="text-xs text-muted-foreground mt-1">Set one from any contact, player, or pitch.</p>
        </div>
      )}

      {/* Overdue */}
      {viewMode === 'list' && overdue.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-destructive mb-2">
            Overdue ({overdue.length})
          </h2>
          <div className={REMINDER_GRID}>
            {overdue.map(item => <ReminderCard key={item.id} item={item} today={today} onSelect={setSelectedFollowUp} onComplete={handleComplete} onDelete={handleDelete} />)}
          </div>
        </div>
      )}

      {/* Today */}
      {viewMode === 'list' && todayItems.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#c8952a' }}>
            Today ({todayItems.length})
          </h2>
          <div className={REMINDER_GRID}>
            {todayItems.map(item => <ReminderCard key={item.id} item={item} today={today} onSelect={setSelectedFollowUp} onComplete={handleComplete} onDelete={handleDelete} />)}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {viewMode === 'list' && upcoming.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Upcoming ({upcoming.length})
          </h2>
          {Object.entries(upcomingByDate).map(([dateStr, items]) => (
            <div key={dateStr} className="mb-3">
              <p className="text-[10px] font-mono text-muted-foreground mb-1.5 px-1">
                {format(parseDateKey(dateStr), 'EEE, MMM d')}
              </p>
              <div className={REMINDER_GRID}>
                {items.map(item => <ReminderCard key={item.id} item={item} today={today} onSelect={setSelectedFollowUp} onComplete={handleComplete} onDelete={handleDelete} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed */}
      {viewMode === 'list' && showCompleted && completed.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Completed ({completed.length})
          </h2>
          <div className={REMINDER_GRID}>
            {completed.map(item => <ReminderCard key={item.id} item={item} isCompleted today={today} onSelect={setSelectedFollowUp} onComplete={handleComplete} onDelete={handleDelete} />)}
          </div>
        </div>
      )}

      {selectedFollowUp && (
        <FollowUpDetailPanel
          followUp={selectedFollowUp}
          onClose={() => setSelectedFollowUp(null)}
          onOpenContact={(id) => setSelectedContactId(id)}
        />
      )}

      {selectedContactId && (
        <ContactDetail contactId={selectedContactId} onClose={() => setSelectedContactId(null)} />
      )}
    </div>
  );
};

export default PendingActionsPage;

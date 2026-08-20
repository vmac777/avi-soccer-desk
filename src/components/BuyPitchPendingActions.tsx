import { useMemo } from 'react';
import { format } from 'date-fns';
import { Square, Trash2, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useFollowUps,
  useCompleteFollowUp,
  useDeleteFollowUp,
  type FollowUp,
} from '@/hooks/useFollowUps';

interface Props {
  onOpenPitch: (pitchId: string) => void;
}

/**
 * Buy-side dedicated pending actions subsection.
 * Shows only follow-ups whose target_type === 'buy_pitch'.
 * Always visible (not collapsible).
 */
const BuyPitchPendingActions = ({ onOpenPitch }: Props) => {
  const { data: followUps = [] } = useFollowUps();
  const complete = useCompleteFollowUp();
  const del = useDeleteFollowUp();

  const today = new Date().toISOString().split('T')[0];

  const buyFollowUps = useMemo(
    () => followUps.filter(f => f.target_type === 'buy_pitch' && !f.completed),
    [followUps]
  );

  const overdue = buyFollowUps.filter(f => f.due_date < today);
  const todayItems = buyFollowUps.filter(f => f.due_date === today);
  const upcoming = buyFollowUps.filter(f => f.due_date > today);
  const dueNow = overdue.length + todayItems.length;

  const renderItem = (item: FollowUp) => {
    const dateColor =
      item.due_date < today ? 'text-destructive'
      : item.due_date === today ? 'text-primary'
      : 'text-muted-foreground';
    return (
      <div
        key={item.id}
        onClick={() => onOpenPitch(item.target_id)}
        className={cn(
          'group flex items-start gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent/30',
          item.due_date < today && 'border-l-[3px] border-l-destructive',
          item.due_date === today && 'border-l-[3px] border-l-primary',
        )}
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); complete.mutate(item.id); }}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          title="Mark done"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-foreground truncate">{item.target_label}</span>
            {item.target_sublabel && (
              <>
                <span className="text-[10px] text-muted-foreground">—</span>
                <span className="text-[10px] text-muted-foreground truncate">{item.target_sublabel}</span>
              </>
            )}
          </div>
          <p className="text-[11px] mt-0.5 text-foreground">{item.action_text}</p>
          <p className={cn('text-[10px] font-mono mt-0.5', dateColor)}>
            Due: {format(new Date(item.due_date + 'T00:00:00'), 'dd/MM/yyyy')}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm('Delete this reminder?')) del.mutate(item.id);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-[11px] tracking-[0.15em] font-bold text-primary uppercase">Pending Actions</h2>
          {dueNow > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
              {dueNow}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {buyFollowUps.length} open
        </span>
      </div>

      {buyFollowUps.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic px-1 py-2">
          No pending reminders. Set one from any buy-side pitch.
        </p>
      ) : (
        <div className="bg-card/50 border border-border rounded-lg p-3 space-y-3">
          {overdue.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-destructive mb-1.5">
                Overdue ({overdue.length})
              </h3>
              <div className="space-y-1.5">{overdue.map(renderItem)}</div>
            </div>
          )}
          {todayItems.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5">
                Today ({todayItems.length})
              </h3>
              <div className="space-y-1.5">{todayItems.map(renderItem)}</div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Upcoming ({upcoming.length})
              </h3>
              <div className="space-y-1.5">{upcoming.map(renderItem)}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default BuyPitchPendingActions;

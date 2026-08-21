import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CheckSquare, Square, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FollowUp } from '@/hooks/useFollowUps';
import { useRescheduleFollowUp } from '@/hooks/useFollowUps';
import { TYPE_BADGE, TYPE_DOT } from '@/lib/followUpDisplay';
import { parseDateKey, toDateKey } from '@/lib/dateKeys';

interface FollowUpCalendarProps {
  /** Already filtered by tab and by the show-completed switch. */
  items: FollowUp[];
  /** Today as `YYYY-MM-DD`, so the page and the calendar agree on the date. */
  today: string;
  onSelect: (item: FollowUp) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * The reminders that fell off the back.
 *
 * A month grid hides overdue work by construction: something due in May is on a
 * square you have to page backwards to see, and an agent opening this on Monday
 * will never look. So they get pulled out and shown above the grid, whichever
 * month is on screen.
 */
function OverdueStrip({
  items,
  onSelect,
}: {
  items: FollowUp[];
  onSelect: (item: FollowUp) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-destructive mb-2">
        Overdue ({items.length})
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="flex items-center gap-1.5 max-w-full rounded border border-destructive/30 bg-background/40 px-2 py-1 text-left text-xs hover:bg-accent/40 transition-colors"
          >
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', TYPE_DOT[item.target_type])} />
            <span className="truncate font-medium text-foreground">{item.target_label}</span>
            <span className="font-mono text-[10px] text-destructive shrink-0">
              {format(parseDateKey(item.due_date), 'd MMM')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const FollowUpCalendar = ({ items, today, onSelect, onComplete, onDelete }: FollowUpCalendarProps) => {
  const reschedule = useRescheduleFollowUp();
  const [cursor, setCursor] = useState(() => parseDateKey(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  /** Reminders keyed by the day they sit on, so a cell is one lookup. */
  const byDay = useMemo(() => {
    const map: Record<string, FollowUp[]> = {};
    items.forEach(f => {
      (map[f.due_date] ||= []).push(f);
    });
    return map;
  }, [items]);

  const overdue = useMemo(
    () => items
      .filter(f => !f.completed && f.due_date < today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [items, today],
  );

  // Six weeks, Monday-first — the agency works in Brazil and Europe, and both
  // read a week as starting Monday.
  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
  }), [cursor]);

  const selectedItems = (byDay[selectedDay] ?? [])
    .slice()
    .sort((a, b) => Number(a.completed) - Number(b.completed));

  const handleDrop = (dayKey: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDay(null);
    const id = e.dataTransfer.getData('followUpId');
    if (!id) return;
    const item = items.find(f => f.id === id);
    if (!item || item.due_date === dayKey) return;
    reschedule.mutate({ id, dueDate: dayKey });
    setSelectedDay(dayKey);
  };

  return (
    <div className="space-y-4">
      <OverdueStrip items={overdue} onSelect={onSelect} />

      {/* Month navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{format(cursor, 'MMMM yyyy')}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(c => addMonths(c, -1))}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setCursor(parseDateKey(today)); setSelectedDay(today); }}
            className="px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(c => addMonths(c, 1))}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map(day => {
          const key = toDateKey(day);
          const dayItems = byDay[key] ?? [];
          const outsideMonth = !isSameMonth(day, cursor);
          const isToday = key === today;
          const isSelected = key === selectedDay;
          const hasOverdue = dayItems.some(f => !f.completed) && key < today;

          return (
            <button
              key={key}
              onClick={() => setSelectedDay(key)}
              onDragOver={e => { e.preventDefault(); setDragOverDay(key); }}
              onDragLeave={() => setDragOverDay(d => (d === key ? null : d))}
              onDrop={handleDrop(key)}
              className={cn(
                'min-h-[64px] sm:min-h-[104px] rounded-md border p-1 sm:p-1.5 text-left align-top transition-colors',
                outsideMonth ? 'border-border/40 bg-transparent' : 'border-border bg-card/40',
                isSelected && 'ring-1 ring-[#c8952a]',
                dragOverDay === key && 'bg-accent/60 border-[#c8952a]',
                hasOverdue && 'border-l-[3px] border-l-destructive',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'text-[11px] font-mono',
                    outsideMonth ? 'text-muted-foreground/50' : 'text-muted-foreground',
                    isToday && 'text-[#c8952a] font-bold',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {dayItems.length > 0 && (
                  <span className="text-[9px] font-mono text-muted-foreground">{dayItems.length}</span>
                )}
              </div>

              {/* Dots on a phone, where a chip would be unreadable; chips from
                  `sm` up, where the label is what makes the grid worth having. */}
              <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                {dayItems.slice(0, 6).map(f => (
                  <span
                    key={f.id}
                    className={cn('h-1.5 w-1.5 rounded-full', TYPE_DOT[f.target_type], f.completed && 'opacity-40')}
                  />
                ))}
              </div>
              <div className="mt-1 hidden sm:flex sm:flex-col sm:gap-0.5">
                {dayItems.slice(0, 3).map(f => (
                  <span
                    key={f.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('followUpId', f.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={e => { e.stopPropagation(); onSelect(f); }}
                    title={`${f.target_label} — ${f.action_text}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[10px] hover:bg-accent/60',
                      f.completed && 'opacity-50 line-through',
                    )}
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TYPE_DOT[f.target_type])} />
                    <span className="truncate text-foreground">{f.target_label}</span>
                  </span>
                ))}
                {dayItems.length > 3 && (
                  <span className="px-1 text-[9px] text-muted-foreground">+{dayItems.length - 3} more</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* The selected day in full. The grid can only ever show a name; this is
          where the actual action text lives, and on a phone it is the only
          place it can live. */}
      <div className="rounded-lg border border-border bg-card/40 p-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {format(parseDateKey(selectedDay), 'EEEE, d MMMM yyyy')}
          {selectedItems.length > 0 && ` (${selectedItems.length})`}
        </h3>
        {selectedItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing due this day.</p>
        ) : (
          <div className="space-y-1.5">
            {selectedItems.map(item => {
              const badge = TYPE_BADGE[item.target_type];
              return (
                <div
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className={cn(
                    'group flex cursor-pointer items-start gap-2.5 rounded-md p-2 transition-colors hover:bg-accent/30',
                    item.completed && 'opacity-50',
                  )}
                >
                  <button
                    onClick={e => { e.stopPropagation(); if (!item.completed) onComplete(item.id); }}
                    disabled={item.completed}
                    className="mt-0.5 shrink-0"
                    aria-label={item.completed ? 'Completed' : 'Mark complete'}
                  >
                    {item.completed
                      ? <CheckSquare className="h-4 w-4 text-muted-foreground" />
                      : <Square className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide', badge.className)}>
                        {badge.label}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">{item.target_label}</span>
                      {item.target_sublabel && (
                        <span className="truncate text-xs text-muted-foreground">— {item.target_sublabel}</span>
                      )}
                    </div>
                    <p className={cn('mt-0.5 text-xs', item.completed ? 'text-muted-foreground line-through' : 'text-foreground')}>
                      {item.action_text}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(item.id); }}
                    className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="Delete reminder"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default FollowUpCalendar;

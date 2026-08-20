import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Link2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCreateFollowUp, type FollowUpTarget } from '@/hooks/useFollowUps';
import CrossLinkPicker from './CrossLinkPicker';
import { toast } from 'sonner';

interface FollowUpPopoverProps {
  /** New API: pass a polymorphic target. */
  target?: FollowUpTarget;
  /** Legacy contact API — still supported. */
  contactId?: string;
  contactName?: string;
  contactClub?: string;

  open: boolean;
  onClose: () => void;
}

const TYPE_BADGE: Record<string, string> = {
  contact: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  scouted_target: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  buy_pitch: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
};

const FollowUpPopover = ({ target, contactId, contactName, contactClub, open, onClose }: FollowUpPopoverProps) => {
  const [date, setDate] = useState<Date | undefined>();
  const [actionText, setActionText] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingLinks, setPendingLinks] = useState<FollowUpTarget[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const createFollowUp = useCreateFollowUp();

  // Resolve target — explicit prop wins, otherwise build from legacy contact props.
  const resolvedTarget: FollowUpTarget | null = target
    ? target
    : contactId
      ? {
          type: 'contact',
          id: contactId,
          label: contactName || contactClub || 'Contact',
          sublabel: contactClub,
        }
      : null;

  const excludeKeys = useMemo(() => {
    const s = new Set<string>();
    if (resolvedTarget) s.add(`${resolvedTarget.type}:${resolvedTarget.id}`);
    pendingLinks.forEach((l) => s.add(`${l.type}:${l.id}`));
    return s;
  }, [resolvedTarget, pendingLinks]);

  if (!open) return null;

  const handleSetReminder = async () => {
    if (!resolvedTarget) {
      toast.error('No target specified for reminder');
      return;
    }
    if (!date || !actionText.trim()) {
      toast.error('Please pick a date and enter an action');
      return;
    }
    await createFollowUp.mutateAsync({
      target: resolvedTarget,
      due_date: format(date, 'yyyy-MM-dd'),
      action_text: actionText.trim(),
      links: pendingLinks,
    });
    toast.success(
      pendingLinks.length > 0
        ? `📌 Reminder set with ${pendingLinks.length} link${pendingLinks.length === 1 ? '' : 's'}`
        : '📌 Follow-up reminder set'
    );
    setDate(undefined);
    setActionText('');
    setPendingLinks([]);
    setPickerOpen(false);
    onClose();
  };

  const removePendingLink = (key: string) => {
    setPendingLinks((prev) => prev.filter((l) => `${l.type}:${l.id}` !== key));
  };

  return (
    <div className="mt-2 p-3 rounded-md border border-border bg-background space-y-2.5">
      <p className="text-xs font-medium text-foreground">Follow-up</p>

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full h-8 justify-start text-left text-xs font-normal',
              !date && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {date ? format(date, 'PPP') : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[60]" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => { setDate(d); setCalendarOpen(false); }}
            disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>

      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Action</label>
        <Input
          value={actionText}
          onChange={(e) => setActionText(e.target.value)}
          placeholder="e.g. Send Cabral video"
          className="h-8 text-xs bg-background border-border mt-0.5"
        />
      </div>

      {/* Cross-link section */}
      <div className="space-y-1.5">
        {pendingLinks.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pendingLinks.map((l) => {
              const key = `${l.type}:${l.id}`;
              return (
                <span
                  key={key}
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border',
                    TYPE_BADGE[l.type] || 'border-border text-muted-foreground'
                  )}
                >
                  <span className="truncate max-w-[140px]">{l.label}</span>
                  <button
                    onClick={() => removePendingLink(key)}
                    className="hover:text-foreground"
                    title="Remove link"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {!pickerOpen ? (
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
          >
            <Link2 className="h-3 w-3" />
            Add cross-link
          </button>
        ) : (
          <CrossLinkPicker
            excludeKeys={excludeKeys}
            onSelect={(opt) => setPendingLinks((prev) => [...prev, opt])}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleSetReminder}
          disabled={createFollowUp.isPending}
          className="h-7 text-[10px] px-3"
          style={{ backgroundColor: '#c8952a', color: '#fff' }}
        >
          Set Reminder
        </Button>
        <Button
          onClick={onClose}
          variant="ghost"
          className="h-7 text-[10px] px-3 text-muted-foreground"
        >
          No Follow-up
        </Button>
      </div>
    </div>
  );
};

export default FollowUpPopover;

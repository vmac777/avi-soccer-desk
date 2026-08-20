import { useState } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import FollowUpPopover from './FollowUpPopover';
import type { FollowUpTarget } from '@/hooks/useFollowUps';

interface SetReminderButtonProps {
  target: FollowUpTarget;
  className?: string;
  label?: string;
  size?: 'sm' | 'md';
}

/**
 * Compact "Set Reminder" trigger that opens the inline FollowUpPopover.
 * Use anywhere a polymorphic reminder makes sense (player, pitch, contact, etc.)
 */
const SetReminderButton = ({ target, className, label = 'Set Reminder', size = 'sm' }: SetReminderButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border bg-background hover:bg-accent/30 transition-colors',
          size === 'sm' ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-xs',
          open && 'border-[#c8952a]/40'
        )}
        style={open ? { color: '#c8952a' } : undefined}
      >
        <Bell className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {label}
      </button>
      <FollowUpPopover target={target} open={open} onClose={() => setOpen(false)} />
    </div>
  );
};

export default SetReminderButton;

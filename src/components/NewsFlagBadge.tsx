import { cn } from '@/lib/utils';
import { urgencyClasses, type NewsUrgency } from '@/hooks/useNewsCounts';

interface Props {
  count: number;
  urgency: NewsUrgency;
  className?: string;
}

/**
 * Small unread-news badge styled to match staleness pills (e.g. "19d").
 * Renders nothing when count is 0 or urgency is 'relevant'/null.
 */
export default function NewsFlagBadge({ count, urgency, className }: Props) {
  if (!count || !urgency || urgency === 'relevant') return null;
  const { badge } = urgencyClasses(urgency);
  return (
    <span
      className={cn(
        'text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded leading-none',
        badge,
        className,
      )}
      title={`${count} unread news ${urgency === 'super_urgent' ? '(super urgent)' : '(urgent)'}`}
    >
      {count}
    </span>
  );
}

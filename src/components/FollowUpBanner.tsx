import { useContactFollowUps, useDeleteFollowUp, type FollowUp } from '@/hooks/useFollowUps';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface FollowUpBannerProps {
  contactId: string;
}

const FollowUpBanner = ({ contactId }: FollowUpBannerProps) => {
  const { data: followUps = [] } = useContactFollowUps(contactId);
  const deleteFollowUp = useDeleteFollowUp();

  if (followUps.length === 0) return null;

  const today = new Date().toISOString().split('T')[0];

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this reminder?')) {
      deleteFollowUp.mutate(id);
    }
  };

  const getDateColor = (dueDate: string) => {
    if (dueDate < today) return 'text-destructive';
    if (dueDate === today) return 'text-[#c8952a]';
    return 'text-muted-foreground';
  };

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{
        borderLeft: '4px solid #c8952a',
        background: 'rgba(200, 149, 42, 0.08)',
      }}
    >
      {followUps.map((fu) => (
        <div key={fu.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
          <span>
            <span className="mr-1">📌</span>
            <span className={cn('font-medium', getDateColor(fu.due_date))}>
              Follow-up {format(new Date(fu.due_date + 'T00:00:00'), 'MMM d')}:
            </span>{' '}
            <span className="text-foreground">{fu.action_text}</span>
          </span>
          <button
            onClick={() => handleDelete(fu.id)}
            className="p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default FollowUpBanner;

import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { X, Trash2, ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DETAIL_PANEL_WIDTH } from '@/lib/panelWidth';
import {
  useFollowUpLinks,
  useDeleteFollowUp,
  useCompleteFollowUp,
  useDeleteFollowUpLink,
  type FollowUp,
  type FollowUpTargetType,
} from '@/hooks/useFollowUps';
import CrossLinkPicker from './CrossLinkPicker';

interface FollowUpDetailPanelProps {
  followUp: FollowUp;
  onClose: () => void;
  onOpenContact?: (contactId: string) => void;
}

const TYPE_LABEL: Record<FollowUpTargetType, string> = {
  contact: 'Contact',
  scouted_target: 'Scouted Target',
  buy_pitch: 'Buy Pitch',
};

const TYPE_BADGE: Record<FollowUpTargetType, string> = {
  contact: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  scouted_target: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  buy_pitch: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
};

/** Returns a navigation route for a given target. Returns null if the target has no first-class page. */
function routeForTarget(type: FollowUpTargetType, id: string): string | null {
  switch (type) {
    case 'scouted_target':
      return `/scouted-targets`;
    case 'buy_pitch':
      return `/buy-pitches`;
    case 'contact':
      return null; // opened via slide-over from parent page
  }
}

const FollowUpDetailPanel = ({ followUp, onClose, onOpenContact }: FollowUpDetailPanelProps) => {
  const navigate = useNavigate();
  const { data: links = [] } = useFollowUpLinks(followUp.id);
  const completeFollowUp = useCompleteFollowUp();
  const deleteFollowUp = useDeleteFollowUp();
  const deleteLink = useDeleteFollowUpLink();
  const [closing, setClosing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const excludeKeys = new Set<string>([
    `${followUp.target_type}:${followUp.target_id}`,
    ...links.map((l) => `${l.link_type}:${l.link_id}`),
  ]);

  const handleNavigate = (type: FollowUpTargetType, id: string) => {
    if (type === 'contact' && onOpenContact) {
      onClose();
      onOpenContact(id);
      return;
    }
    const route = routeForTarget(type, id);
    if (route) {
      onClose();
      navigate(route);
    }
  };

  const handleComplete = () => {
    completeFollowUp.mutate(followUp.id);
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm('Delete this reminder?')) {
      deleteFollowUp.mutate(followUp.id);
      onClose();
    }
  };

  return (
    <>
      <div
        className={cn('fixed inset-0 z-[70] bg-background/60 transition-opacity', closing && 'opacity-0')}
        onClick={() => { setClosing(true); setTimeout(onClose, 150); }}
      />
      <div
        className={cn(
          'fixed top-0 right-0 z-[71] h-full bg-card border-l border-border overflow-y-auto transition-transform',
          DETAIL_PANEL_WIDTH,
          closing && 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Reminder</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Action + Due */}
          <div className="space-y-2">
            <p className="text-sm text-foreground leading-snug">{followUp.action_text}</p>
            <p className="text-[11px] font-mono text-muted-foreground">
              Due {format(new Date(followUp.due_date + 'T00:00:00'), 'EEE, MMM d, yyyy')}
            </p>
          </div>

          {/* Primary target */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Primary
            </p>
            <TargetRow
              type={followUp.target_type}
              id={followUp.target_id}
              label={followUp.target_label}
              sublabel={followUp.target_sublabel || undefined}
              onOpen={() => handleNavigate(followUp.target_type, followUp.target_id)}
            />
          </div>

          {/* Cross-links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Also linked
              </p>
              {!pickerOpen && (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="text-[10px] font-medium text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add cross-link
                </button>
              )}
            </div>
            {links.length > 0 ? (
              <div className="space-y-1.5">
                {links.map((link) => (
                  <TargetRow
                    key={link.id}
                    type={link.link_type}
                    id={link.link_id}
                    label={link.link_label}
                    sublabel={link.link_sublabel || undefined}
                    onOpen={() => handleNavigate(link.link_type, link.link_id)}
                    onRemove={() => deleteLink.mutate(link.id)}
                  />
                ))}
              </div>
            ) : (
              !pickerOpen && (
                <p className="text-[10px] text-muted-foreground italic">
                  No cross-links yet.
                </p>
              )
            )}
            {pickerOpen && (
              <CrossLinkPicker
                followUpId={followUp.id}
                excludeKeys={excludeKeys}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            {!followUp.completed && (
              <button
                onClick={handleComplete}
                className="flex-1 h-8 text-xs rounded-md font-medium"
                style={{ backgroundColor: '#c8952a', color: '#fff' }}
              >
                Mark complete
              </button>
            )}
            <button
              onClick={handleDelete}
              className="h-8 px-3 text-xs rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

function TargetRow({
  type, id, label, sublabel, onOpen, onRemove,
}: {
  type: FollowUpTargetType;
  id: string;
  label: string;
  sublabel?: string;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md border border-border bg-background/40">
      <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide', TYPE_BADGE[type])}>
        {TYPE_LABEL[type]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground truncate">{label}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>}
      </div>
      <button
        onClick={onOpen}
        className="text-muted-foreground hover:text-primary p-1"
        title="Open"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-1"
          title="Remove cross-link"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default FollowUpDetailPanel;

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useClubs } from '@/hooks/useClubsAndSources';
import {
  useAllRequirements,
  useCreateRequirement,
  useUpdateRequirement,
  useDeleteRequirement,
  type RequirementRow,
} from '@/hooks/useClubRequirements';
import { requirementSummary } from '@/lib/shortlistToPitch';
import RequirementDialog from '@/components/RequirementDialog';

/**
 * What this club is looking for, on the record of the person who told us.
 *
 * This lives on the contact panel because that is where the agent already is
 * when they find out — `Log Touch` and the free-text `Needs` field are inches
 * away, and a need captured five minutes after the call is a need captured.
 * A separate page would mean remembering to go there.
 *
 * `contacts.needs` stays exactly as it is. It holds the nuance no column
 * captures, and nothing is migrated out of it. This is the structured part
 * that a roster can actually be matched against.
 */

const statusPill = (status: string) => {
  switch (status) {
    case 'open': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25';
    case 'filled': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

export default function ClubRequirementsSection({
  clubName,
  contactId,
}: {
  clubName: string;
  contactId: string;
}) {
  const navigate = useNavigate();
  const { data: clubs = [] } = useClubs();
  const { data: all = [] } = useAllRequirements();
  const create = useCreateRequirement();
  const update = useUpdateRequirement();
  const remove = useDeleteRequirement();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RequirementRow | null>(null);

  // Contacts carry a club *name*, not a foreign key — the whole app joins the
  // two that way. Resolving it here is what lets a new requirement carry a
  // real club_id even though the contact cannot supply one.
  const clubId = useMemo(() => {
    const target = clubName.trim().toLowerCase();
    return clubs.find((c) => c.name.trim().toLowerCase() === target)?.id ?? null;
  }, [clubs, clubName]);

  // Show the club's needs, not only the ones this person reported. Two people
  // at one club are describing one club's gaps.
  const requirements = useMemo(
    () => all.filter((r) => (clubId ? r.club_id === clubId : r.contact_id === contactId)),
    [all, clubId, contactId],
  );

  const handleDelete = (r: RequirementRow) => {
    if (!window.confirm(`Delete this ${r.position} requirement? Its shortlist goes too.`)) return;
    remove.mutate(r.id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] tracking-[0.15em] font-bold text-primary uppercase">
          WHAT THEY NEED
        </h3>
        <Button
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          variant="outline"
          className="h-6 text-[10px] border-border text-foreground"
        >
          <Plus className="h-3 w-3 mr-1" /> Add a need
        </Button>
      </div>

      {requirements.length === 0 ? (
        <p className="text-xs text-muted-foreground font-mono">
          Nothing recorded. Add one after a call and the roster gets matched against it.
        </p>
      ) : (
        <div className="space-y-1.5">
          {requirements.map((r) => (
            <div
              key={r.id}
              className="group flex items-center gap-2 px-2.5 py-2 rounded border border-border bg-card hover:border-primary/40 transition-colors"
            >
              <button
                onClick={() => navigate(`/needs/${r.id}`)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-foreground">
                    {requirementSummary(r)}
                  </span>
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wide shrink-0',
                    statusPill(r.status),
                  )}>
                    {r.status}
                  </span>
                </div>
                {(r.window_target || r.notes) && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {[r.window_target, r.notes].filter(Boolean).join(' · ')}
                  </p>
                )}
              </button>

              <button
                onClick={() => { setEditing(r); setDialogOpen(true); }}
                className="p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
                aria-label="Edit requirement"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleDelete(r)}
                className="p-1 text-muted-foreground/60 transition-colors hover:text-destructive"
                aria-label="Delete requirement"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <RequirementDialog
          // Remount per requirement so the form seeds from the right row —
          // the fields are useState initialisers, which only read once.
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          initial={editing}
          clubId={clubId}
          contactId={contactId}
          clubName={clubName}
          onSubmit={async (input) => {
            if (editing) await update.mutateAsync({ id: editing.id, ...input });
            else await create.mutateAsync(input);
          }}
        />
      )}
    </div>
  );
}

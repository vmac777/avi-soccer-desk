import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RequirementInput, RequirementRow } from '@/hooks/useClubRequirements';

/**
 * What a club told us they are looking for.
 *
 * Every field except the position is optional on purpose. A sporting director
 * on the phone says "we need a left back, nothing over four million" and hangs
 * up — the form has to accept that without demanding an age band nobody
 * mentioned. The scorer already normalises over whatever was stated, so a
 * half-filled requirement is a working requirement, not a broken one.
 */

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];
const FEET = ['Left', 'Right', 'Both'];

/** Money is entered in millions, because that is how it is spoken. */
const toM = (v: number | null) => (v == null ? '' : String(v / 1_000_000));
const fromM = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
};
/** Wages are spoken in thousands per year. */
const toK = (v: number | null) => (v == null ? '' : String(Math.round(v / 1_000)));
const fromK = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 1_000) : null;
};
const toInt = (v: string) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Present when editing; absent when adding. */
  initial?: RequirementRow | null;
  clubId: string | null;
  contactId: string | null;
  clubName: string;
  onSubmit: (input: RequirementInput) => Promise<void> | void;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</label>
    {children}
  </div>
);

export default function RequirementDialog({
  open, onClose, initial, clubId, contactId, clubName, onSubmit,
}: Props) {
  const [position, setPosition] = useState(initial?.position ?? '');
  const [ageMin, setAgeMin] = useState(initial?.age_min != null ? String(initial.age_min) : '');
  const [ageMax, setAgeMax] = useState(initial?.age_max != null ? String(initial.age_max) : '');
  const [budgetMax, setBudgetMax] = useState(toM(initial?.budget_max ?? null));
  const [salaryMax, setSalaryMax] = useState(toK(initial?.salary_max ?? null));
  const [foot, setFoot] = useState(initial?.foot ?? '');
  const [needsEu, setNeedsEu] = useState(initial?.needs_eu_passport ?? false);
  const [leagues, setLeagues] = useState((initial?.league_experience ?? []).join(', '));
  const [windowTarget, setWindowTarget] = useState(initial?.window_target ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  // The age CHECK rejects a reversed band at the database. Catching it here
  // means an explanation instead of a Postgres constraint name.
  const min = toInt(ageMin);
  const max = toInt(ageMax);
  const ageReversed = min != null && max != null && min > max;
  const canSave = position.trim().length > 0 && !ageReversed && !saving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSubmit({
        club_id: clubId,
        contact_id: contactId,
        position: position.trim(),
        age_min: min,
        age_max: max,
        budget_min: null,
        budget_max: fromM(budgetMax),
        salary_max: fromK(salaryMax),
        foot: foot || null,
        needs_eu_passport: needsEu,
        league_experience: leagues.split(',').map((s) => s.trim()).filter(Boolean),
        window_target: windowTarget.trim() || null,
        notes: notes.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {initial ? 'Edit requirement' : `What does ${clubName || 'this club'} need?`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Position *">
            <div className="flex flex-wrap gap-1">
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPosition(p)}
                  className={cn(
                    'px-2 py-1 rounded text-[11px] font-medium border transition-colors',
                    position === p
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Age from">
              <Input value={ageMin} onChange={(e) => setAgeMin(e.target.value)} type="number" placeholder="—" className="h-8 text-xs" />
            </Field>
            <Field label="Age to">
              <Input value={ageMax} onChange={(e) => setAgeMax(e.target.value)} type="number" placeholder="—" className="h-8 text-xs" />
            </Field>
            <Field label="Fee ceiling (€m)">
              <Input value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} type="number" step="0.1" placeholder="—" className="h-8 text-xs" />
            </Field>
            <Field label="Wage ceiling (€k/yr)">
              <Input value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} type="number" placeholder="—" className="h-8 text-xs" />
            </Field>
          </div>

          {ageReversed && (
            <p className="text-xs text-destructive">Age from cannot be greater than age to.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred foot">
              <div className="flex gap-1">
                {FEET.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFoot(foot === f ? '' : f)}
                    className={cn(
                      'px-2 py-1 rounded text-[11px] border transition-colors',
                      foot === f
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Window">
              <Input value={windowTarget} onChange={(e) => setWindowTarget(e.target.value)} placeholder="e.g. Jan 2027" className="h-8 text-xs" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={needsEu}
              onChange={(e) => setNeedsEu(e.target.checked)}
              className="accent-[#c8952a]"
            />
            Needs an EU passport
          </label>

          <Field label="League experience (comma separated)">
            <Input
              value={leagues}
              onChange={(e) => setLeagues(e.target.value)}
              placeholder="e.g. Brazil – Série A, Portugal – Primeira Liga"
              className="h-8 text-xs"
            />
          </Field>

          <Field label="Notes">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the columns miss — style, urgency, who else is in"
              className="h-8 text-xs"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="h-8 text-xs">Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSave}
              className="h-8 text-xs bg-primary text-primary-foreground"
            >
              {saving ? 'Saving…' : initial ? 'Save' : 'Add requirement'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

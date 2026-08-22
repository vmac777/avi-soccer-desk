import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Set your own name.
 *
 * The signup trigger seeded `full_name` with the email local-part, so the desk
 * opened with "Morning, vmachado194." — not missing, just wrong, which is why
 * greeting only when a name exists did not fix it. Correcting that in the
 * database each time somebody joins is a job nobody should have.
 *
 * RLS already allows exactly this and nothing more: `profiles_update_own` lets
 * a user write their own row, and a trigger stops them changing their own role.
 * So this needs no new policy and cannot be used to escalate.
 */
export default function ProfileNameDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        // Empty clears it rather than storing '', so the greeting falls back to
        // saying nothing instead of addressing an empty string.
        .update({ full_name: trimmed || null })
        .eq('id', profile?.id ?? '');
      if (error) throw error;
      await refreshProfile();
      toast.success(trimmed ? `You are ${trimmed} from now on` : 'Name cleared');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that name");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">What should we call you?</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="Julio"
              autoFocus
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Used to greet you on the board. First name is plenty.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="h-8 text-xs">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="h-8 text-xs bg-primary text-primary-foreground"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

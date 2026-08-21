import { useState, useMemo } from 'react';
import { useCreateContact, useContacts } from '@/hooks/useData';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const STAGES = ['', 'Contacted - No Answer', 'Contacted', 'Offered', 'Negotiating', 'Closed Won', 'Closed Lost', 'Dormant'];

interface NewContactDialogProps {
  onClose: () => void;
}

const NewContactDialog = ({ onClose }: NewContactDialogProps) => {
  const { data: teamMembers = [] } = useTeamMembers();
  const createContact = useCreateContact();
  const { session } = useAuth();
  const { data: contacts } = useContacts();

  const [form, setForm] = useState({
    market: '',
    club: '',
    contact_person: '',
    who_spoke: '',
    stage: '' as const,
    priority: 'Normal' as const,
    phone1: '',
    linkedin: '',
  });

  const [marketMode, setMarketMode] = useState<'select' | 'create'>('select');
  const [clubMode, setClubMode] = useState<'select' | 'create'>('select');

  // Derive unique markets from existing contacts
  const markets = useMemo(() => {
    if (!contacts) return [];
    const unique = [...new Set(contacts.map((c) => c.market))].sort();
    return unique;
  }, [contacts]);

  // Derive unique clubs for selected market
  const clubsInMarket = useMemo(() => {
    if (!contacts || !form.market) return [];
    const unique = [
      ...new Set(
        contacts
          .filter((c) => c.market === form.market)
          .map((c) => c.club)
      ),
    ].sort();
    return unique;
  }, [contacts, form.market]);

  const handleSubmit = async () => {
    if (!form.market || !form.club) {
      toast.error('Market and Club are required');
      return;
    }
    await createContact.mutateAsync({
      ...form,
      created_by: session?.user?.id,
    });
    toast.success(`Created contact: ${form.club}`);
    onClose();
  };

  const handleMarketChange = (value: string) => {
    if (value === '__create__') {
      setMarketMode('create');
      setForm({ ...form, market: '', club: '' });
      setClubMode('create');
    } else {
      setMarketMode('select');
      setForm({ ...form, market: value, club: '' });
      setClubMode('select');
    }
  };

  const handleClubChange = (value: string) => {
    if (value === '__create__') {
      setClubMode('create');
      setForm({ ...form, club: '' });
    } else {
      setClubMode('select');
      setForm({ ...form, club: value });
    }
  };

  const selectClass = "w-full h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground mt-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-[400px] mx-4 bg-card border border-border rounded-lg p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">New Contact</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          {/* Market */}
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Market *</label>
            {marketMode === 'select' ? (
              <select
                value={form.market || ''}
                onChange={(e) => handleMarketChange(e.target.value)}
                className={selectClass}
              >
                <option value="" disabled>Select a market…</option>
                <option value="__create__">＋ Create New Market</option>
                {markets.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <div className="flex gap-1 mt-1">
                <Input
                  value={form.market}
                  onChange={(e) => setForm({ ...form, market: e.target.value })}
                  placeholder="e.g. France - Ligue 1"
                  className="h-8 text-xs bg-background border-border flex-1"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => { setMarketMode('select'); setForm({ ...form, market: '' }); }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Club */}
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Club *</label>
            {clubMode === 'select' && form.market && marketMode === 'select' ? (
              <select
                value={form.club || ''}
                onChange={(e) => handleClubChange(e.target.value)}
                className={selectClass}
              >
                <option value="" disabled>Select a club…</option>
                <option value="__create__">＋ Create New Club</option>
                {clubsInMarket.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : (
              <Input
                value={form.club}
                onChange={(e) => setForm({ ...form, club: e.target.value })}
                placeholder={marketMode === 'create' ? "Club name" : "New club name"}
                className="h-8 text-xs bg-background border-border mt-1"
              />
            )}
          </div>

          {/* Contact Person */}
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Contact Person</label>
            <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="h-8 text-xs bg-background border-border mt-1" />
          </div>

          {/* Phone & LinkedIn */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone</label>
              <Input
                value={form.phone1}
                onChange={(e) => setForm({ ...form, phone1: e.target.value })}
                placeholder="+44 7..."
                className="h-8 text-xs bg-background border-border mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">LinkedIn</label>
              <Input
                value={form.linkedin}
                onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                placeholder="URL or profile"
                className="h-8 text-xs bg-background border-border mt-1"
              />
            </div>
          </div>

          {/* Who Spoke & Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Who Spoke</label>
              <select value={form.who_spoke} onChange={(e) => setForm({ ...form, who_spoke: e.target.value })} className={selectClass}>
                <option value="">—</option>
                {teamMembers.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Stage</label>
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as any })} className={selectClass}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button onClick={onClose} variant="outline" className="h-8 text-xs border-border">Cancel</Button>
          <Button onClick={handleSubmit} className="h-8 text-xs bg-primary text-primary-foreground">Create</Button>
        </div>
      </motion.div>
    </div>
  );
};

export default NewContactDialog;

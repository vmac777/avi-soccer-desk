import { useState, useMemo } from 'react';
import { useContacts, useUpdateContact } from '@/hooks/useData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface MoveContactDialogProps {
  contactId: string;
  currentMarket: string;
  currentClub: string;
  onClose: () => void;
}

const MoveContactDialog = ({ contactId, currentMarket, currentClub, onClose }: MoveContactDialogProps) => {
  const { data: contacts } = useContacts();
  const updateContact = useUpdateContact();

  const [step, setStep] = useState<'initial' | 'selectMarket' | 'createMarket' | 'selectClub'>('initial');
  const [selectedMarket, setSelectedMarket] = useState('');
  const [newMarketName, setNewMarketName] = useState('');
  const [clubMode, setClubMode] = useState<'select' | 'create'>('select');
  const [selectedClub, setSelectedClub] = useState('');
  const [newClubName, setNewClubName] = useState('');

  const markets = useMemo(() => {
    if (!contacts) return [];
    return [...new Set(contacts.map((c) => c.market))].sort();
  }, [contacts]);

  const clubsInMarket = useMemo(() => {
    if (!contacts || !selectedMarket) return [];
    return [...new Set(
      contacts.filter((c) => c.market === selectedMarket).map((c) => c.club)
    )].sort();
  }, [contacts, selectedMarket]);

  const handleMoveToSemClube = async () => {
    await updateContact.mutateAsync({ id: contactId, market: 'Sem Clube', club: 'Sem Clube' });
    toast.success(`Moved ${currentClub} to Sem Clube`);
    onClose();
  };

  const handleMarketSelected = (market: string) => {
    setSelectedMarket(market);
    setClubMode('select');
    setStep('selectClub');
  };

  const handleCreateMarketConfirm = () => {
    if (!newMarketName.trim()) return;
    setSelectedMarket(newMarketName.trim());
    setClubMode('create');
    setStep('selectClub');
  };

  const handleClubChange = (value: string) => {
    if (value === '__create__') {
      setClubMode('create');
      setSelectedClub('');
    } else {
      setClubMode('select');
      setSelectedClub(value);
    }
  };

  const handleConfirmMove = async () => {
    const finalClub = clubMode === 'create' ? newClubName.trim() : selectedClub;
    if (!selectedMarket || !finalClub) {
      toast.error('Please select a market and club');
      return;
    }
    await updateContact.mutateAsync({ id: contactId, market: selectedMarket, club: finalClub });
    toast.success(`Moved contact to ${finalClub} (${selectedMarket})`);
    onClose();
  };

  const selectClass = "w-full h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground mt-1";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-[380px] mx-4 bg-card border border-border rounded-lg p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">Move Contact</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground mb-3">
          Currently: <span className="text-foreground font-medium">{currentClub}</span> in {currentMarket}
        </p>

        {step === 'initial' && (
          <div className="space-y-2">
            <Button
              onClick={handleMoveToSemClube}
              variant="outline"
              className="w-full h-9 text-xs border-border justify-start"
            >
              Move to Sem Clube
            </Button>
            <Button
              onClick={() => setStep('createMarket')}
              variant="outline"
              className="w-full h-9 text-xs border-border justify-start"
            >
              ＋ Create New Market
            </Button>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Select Existing Market</label>
              <select
                value=""
                onChange={(e) => handleMarketSelected(e.target.value)}
                className={selectClass}
              >
                <option value="" disabled>Choose a market…</option>
                {markets.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 'createMarket' && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">New Market Name</label>
              <Input
                value={newMarketName}
                onChange={(e) => setNewMarketName(e.target.value)}
                placeholder="e.g. France - Ligue 2"
                className="h-8 text-xs bg-background border-border mt-1"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setStep('initial')} variant="outline" className="h-8 text-xs border-border">Back</Button>
              <Button onClick={handleCreateMarketConfirm} className="h-8 text-xs bg-primary text-primary-foreground">Next</Button>
            </div>
          </div>
        )}

        {step === 'selectMarket' && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Market</label>
              <select
                value={selectedMarket}
                onChange={(e) => handleMarketSelected(e.target.value)}
                className={selectClass}
              >
                <option value="" disabled>Select a market…</option>
                {markets.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <Button onClick={() => setStep('initial')} variant="outline" className="h-8 text-xs border-border">Back</Button>
          </div>
        )}

        {step === 'selectClub' && (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Market: <span className="text-foreground font-medium">{selectedMarket}</span>
            </p>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Club</label>
              {clubMode === 'select' && clubsInMarket.length > 0 ? (
                <select
                  value={selectedClub}
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
                  value={newClubName}
                  onChange={(e) => setNewClubName(e.target.value)}
                  placeholder="Club name"
                  className="h-8 text-xs bg-background border-border mt-1"
                  autoFocus
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => { setStep('initial'); setSelectedMarket(''); }} variant="outline" className="h-8 text-xs border-border">Back</Button>
              <Button onClick={handleConfirmMove} className="h-8 text-xs bg-primary text-primary-foreground">
                Move Contact
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default MoveContactDialog;

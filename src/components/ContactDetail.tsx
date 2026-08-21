import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContact, useUpdateContact, useDeleteContact, useLogTouch, useInteractions, useCreateInteraction, useDeleteInteraction, usePlayerClubLinks, useSetPrimaryContact } from '@/hooks/useData';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/hooks/useAuth';
import { useBuyPitches, useScoutedTargets } from '@/hooks/useBuyData';
import { cn } from '@/lib/utils';
import { DETAIL_PANEL_WIDTH } from '@/lib/panelWidth';
import { healthColor, healthBg, stagePill, formatDaysAgo, UNCONTACTED_LABEL } from '@/lib/contactUtils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, Phone, MessageCircle, Mail, Smartphone, Trash2, Linkedin, ArrowRightLeft, Plus, Star, Pencil, Check } from 'lucide-react';
import MoveContactDialog from '@/components/MoveContactDialog';
import ClubTmLinks from '@/components/ClubTmLinks';
import FollowUpPopover from '@/components/FollowUpPopover';
import FollowUpBanner from '@/components/FollowUpBanner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { todayKey } from '@/lib/dateKeys';

const STAGES = ['', 'Contacted - No Answer', 'Contacted', 'Offered', 'Negotiating', 'Closed Won', 'Closed Lost', 'Dormant'];

interface ContactDetailProps {
  contactId: string;
  onClose: () => void;
}

const PrimaryContactToggle = ({ contact }: { contact: any }) => {
  const setPrimary = useSetPrimaryContact();
  const isPrimary = !!(contact as any).is_primary;
  const handleToggle = () => {
    setPrimary.mutate({ contactId: contact.id, club: contact.club, value: !isPrimary });
  };
  return (
    <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
      <button onClick={handleToggle} className="p-0 border-0 bg-transparent cursor-pointer">
        <Star className={cn('h-4 w-4', isPrimary ? 'fill-current' : '')} style={{ color: isPrimary ? '#c8952a' : undefined }} />
      </button>
      Primary contact for {contact.club}
    </label>
  );
};

const panelVariants = {
  hidden: { x: '100%', transition: { type: 'spring' as const, damping: 30, stiffness: 300 } },
  visible: { x: 0, transition: { type: 'spring' as const, damping: 30, stiffness: 300 } },
};

const ContactDetail = ({ contactId, onClose }: ContactDetailProps) => {
  const { data: contact, isLoading } = useContact(contactId);
  const { data: interactions = [] } = useInteractions(contactId);
  const { data: playerLinks = [] } = usePlayerClubLinks(null, contactId);
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const logTouch = useLogTouch();
  const createInteraction = useCreateInteraction();
  const deleteInteraction = useDeleteInteraction();
  const { displayName } = useAuth();

  const [newNote, setNewNote] = useState('');
  const [editing, setEditing] = useState<Record<string, any>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [editingContactInfo, setEditingContactInfo] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const navigate = useNavigate();
  const { data: WHOS = [] } = useTeamMembers();
  const { data: allPitches = [] } = useBuyPitches();
  const { data: rosterTargets = [] } = useScoutedTargets();
  const contactPitches = contact
    ? allPitches.filter((p) => p.contact_id === contactId)
    : [];
  const rosterNameById = useMemo(() => {
    const m: Record<string, string> = {};
    rosterTargets.forEach((r: { id: string; name: string }) => { m[r.id] = r.name; });
    return m;
  }, [rosterTargets]);

  if (isLoading || !contact) {
    return (
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
          <div className="absolute inset-0 bg-background/60" />
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className={cn(DETAIL_PANEL_WIDTH, 'relative h-full bg-card border-l border-border p-6 flex items-center justify-center')}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-muted-foreground font-mono text-sm">Loading...</span>
          </motion.div>
        </div>
      </AnimatePresence>
    );
  }

  const handleFieldChange = (field: string, value: any) => {
    setEditing((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const oldStage = contact.stage;
    const newStage = editing.stage;

    await updateContact.mutateAsync({ id: contactId, ...editing });

    if (newStage && newStage !== oldStage) {
      await createInteraction.mutateAsync({
        contact_id: contactId,
        note: `Stage changed from ${oldStage} to ${newStage}`,
        interaction_type: 'Note',
        logged_by: displayName,
      });
    }

    setEditing({});
    toast.success('Contact updated');
  };

  const handleDelete = async () => {
    await deleteContact.mutateAsync(contactId);
    toast.success('Contact deleted');
    onClose();
  };

  const handleLogInteraction = async (type: string) => {
    const today = todayKey();
    await updateContact.mutateAsync({ id: contactId, last_contact: today });
    await createInteraction.mutateAsync({
      contact_id: contactId,
      note: `${type} with ${contact.club}`,
      interaction_type: type as any,
      logged_by: displayName,
    });
    toast.success(`✓ Logged ${type} with ${contact.club}`);
    setShowFollowUp(true);
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await createInteraction.mutateAsync({
      contact_id: contactId,
      note: newNote.trim(),
      interaction_type: 'Note',
      logged_by: displayName,
    });
    setNewNote('');
  };

  const val = (field: string) => editing[field] ?? (contact as any)[field];

  const typeIcons: Record<string, string> = {
    Call: '📞', Meeting: '🤝', WhatsApp: '📱', Email: '📧', TransferRoom: '🔄', Note: '📝',
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
        <div className="absolute inset-0 bg-background/60" />
        <motion.div
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className={cn(DETAIL_PANEL_WIDTH, 'relative h-full bg-card border-l border-border overflow-y-auto')}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-card border-b border-border p-4 z-10">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-medium text-foreground tracking-tight">{contact.club}</h2>
                  <ClubTmLinks clubName={contact.club} />
                  {(contact as any).is_primary && (
                    <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1" style={{ color: '#c8952a', background: 'rgba(200,149,42,0.15)' }}>
                      <Star className="h-3 w-3 fill-current" /> Primary
                    </span>
                  )}
                  {contactPitches.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/25">
                      {contactPitches.length} {contactPitches.length === 1 ? 'pitch' : 'pitches'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{contact.market}</span>
                  <span className={cn(
                    'text-[10px] font-mono px-1.5 py-0.5 rounded',
                    healthColor(contact.health_status),
                    healthBg(contact.health_status)
                  )}>
                    {contact.health_status === 'unknown' ? UNCONTACTED_LABEL :
                      `${contact.health_status.toUpperCase()} — ${formatDaysAgo(contact.days_since_contact)} ago`}
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-5">
            {/* Follow-up banner */}
            <FollowUpBanner contactId={contactId} />
            {/* Editable fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Contact Person</label>
                <div className="flex items-center gap-1.5 mt-1">
                  <Input
                    value={val('contact_person')}
                    onChange={(e) => handleFieldChange('contact_person', e.target.value)}
                    className="h-8 text-xs bg-background border-border flex-1"
                  />
                  {contact.linkedin && !editingContactInfo && (
                    <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="text-[#0A66C2] hover:opacity-80 p-1">
                      <Linkedin className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    onClick={() => {
                      if (editingContactInfo) {
                        handleSave();
                        setEditingContactInfo(false);
                      } else {
                        setEditingContactInfo(true);
                      }
                    }}
                    className={cn(
                      'p-1 rounded hover:bg-surface-hover transition-colors',
                      editingContactInfo ? 'text-status-hot' : 'text-muted-foreground hover:text-foreground'
                    )}
                    title={editingContactInfo ? 'Save contact info' : 'Edit phone, LinkedIn & role'}
                  >
                    {editingContactInfo ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {editingContactInfo ? (
                  <div className="space-y-2 mt-2 p-2 rounded border border-border bg-background">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Role</label>
                      <Input
                        value={val('role')}
                        onChange={(e) => handleFieldChange('role', e.target.value)}
                        placeholder="e.g. Sporting Director"
                        className="h-7 text-xs bg-background border-border mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">LinkedIn URL</label>
                      <Input
                        value={val('linkedin')}
                        onChange={(e) => handleFieldChange('linkedin', e.target.value)}
                        placeholder="https://linkedin.com/in/..."
                        className="h-7 text-xs bg-background border-border mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone 1</label>
                      <Input
                        value={val('phone1')}
                        onChange={(e) => handleFieldChange('phone1', e.target.value)}
                        placeholder="+55..."
                        className="h-7 text-xs bg-background border-border mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone 2</label>
                      <Input
                        value={val('phone2')}
                        onChange={(e) => handleFieldChange('phone2', e.target.value)}
                        placeholder="+55..."
                        className="h-7 text-xs bg-background border-border mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone 3</label>
                      <Input
                        value={val('phone3')}
                        onChange={(e) => handleFieldChange('phone3', e.target.value)}
                        placeholder="+55..."
                        className="h-7 text-xs bg-background border-border mt-0.5"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {contact.role && <span className="text-[10px] text-muted-foreground mt-0.5 block">{contact.role}</span>}
                    {[contact.phone1, contact.phone2, contact.phone3].filter(Boolean).length > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        {[contact.phone1, contact.phone2, contact.phone3].filter(Boolean).map((phone, idx) => (
                          <TooltipProvider key={idx}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a href={`https://wa.me/${(phone as string).replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                                  <MessageCircle className="h-3.5 w-3.5" style={{ color: '#25D366' }} />
                                  <span>{phone}</span>
                                </a>
                              </TooltipTrigger>
                              <TooltipContent><p className="text-xs">Open WhatsApp</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Who Spoke</label>
                <select
                  value={val('who_spoke')}
                  onChange={(e) => handleFieldChange('who_spoke', e.target.value)}
                  className="w-full h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground mt-1"
                >
                  {WHOS.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Contact</label>
                <Input
                  type="date"
                  value={val('last_contact') || ''}
                  onChange={(e) => handleFieldChange('last_contact', e.target.value)}
                  className="h-8 text-xs bg-background border-border mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Stage</label>
                <select
                  value={val('stage')}
                  onChange={(e) => handleFieldChange('stage', e.target.value)}
                  className="w-full h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground mt-1"
                >
                  {STAGES.map((s) => <option key={s || '__blank'} value={s}>{s || '— No Stage'}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Priority</label>
                <select
                  value={val('priority')}
                  onChange={(e) => handleFieldChange('priority', e.target.value)}
                  className="w-full h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground mt-1"
                >
                  <option value="High">High</option>
                  <option value="Normal">Normal</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Needs</label>
                <Input
                  value={val('needs')}
                  onChange={(e) => handleFieldChange('needs', e.target.value)}
                  className="h-8 text-xs bg-background border-border mt-1"
                />
              </div>
            </div>

            {/* Club Interest & Primary */}
            <div className="space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Club Interest</label>
              <Input
                value={val('club_interest')}
                onChange={(e) => handleFieldChange('club_interest', e.target.value)}
                className="h-8 text-xs bg-background border-border"
              />
              {playerLinks.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {playerLinks.map((l) => (
                    <span key={l.id} className="text-[10px] px-1.5 py-0.5 rounded bg-status-pipeline/10 text-status-pipeline border border-status-pipeline/20">
                      {l.players_tracking?.player_name} ({l.link_type})
                    </span>
                  ))}
                </div>
              )}
              <PrimaryContactToggle contact={contact} />
            </div>

            {/* Quick actions */}
            <div className="flex gap-2">
              <Button onClick={() => handleLogInteraction('Call')} variant="outline" className="h-7 text-[10px] border-border text-foreground">
                <Phone className="h-3 w-3 mr-1" /> Log Touch
              </Button>
              <Button onClick={() => handleLogInteraction('Call')} variant="outline" className="h-7 text-[10px] border-border text-foreground">
                <MessageCircle className="h-3 w-3 mr-1" /> Call
              </Button>
              <Button onClick={() => handleLogInteraction('Email')} variant="outline" className="h-7 text-[10px] border-border text-foreground">
                <Mail className="h-3 w-3 mr-1" /> Email
              </Button>
              <Button onClick={() => handleLogInteraction('WhatsApp')} variant="outline" className="h-7 text-[10px] border-border text-foreground">
                <Smartphone className="h-3 w-3 mr-1" /> WhatsApp
              </Button>
            </div>
            <FollowUpPopover
              contactId={contactId}
              contactName={contact.contact_person || ''}
              contactClub={contact.club}
              open={showFollowUp}
              onClose={() => setShowFollowUp(false)}
            />

            {/* Player Pitches */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] tracking-[0.15em] font-bold text-primary uppercase">PLAYER PITCHES</h3>
                <Button onClick={() => navigate('/pitches')} variant="outline" className="h-6 text-[10px] border-border text-foreground">
                  <Plus className="h-3 w-3 mr-1" /> Pitch a player
                </Button>
              </div>
              {contactPitches.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono">No players pitched to this contact yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {contactPitches.map((pitch) => (
                    <button
                      key={pitch.id}
                      onClick={() => navigate('/pitches')}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded border border-border bg-card hover:border-primary/40 text-left transition-colors"
                    >
                      <span className="text-xs font-medium truncate">
                        {rosterNameById[pitch.scouted_target_id] ?? 'Unknown player'}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
                        {pitch.stage}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Interaction Timeline */}
            <div>
              <h3 className="text-[10px] tracking-[0.15em] font-bold text-primary uppercase mb-2">INTERACTION TIMELINE</h3>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Add a note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                  className="h-8 text-xs bg-background border-border"
                />
                <Button onClick={handleAddNote} className="h-8 text-xs bg-primary text-primary-foreground">Add</Button>
              </div>

              <div className="space-y-1">
                {interactions.map((i) => (
                  <div key={i.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-surface-hover group">
                    <span className="mt-0.5">{typeIcons[i.interaction_type] || '📝'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">{i.note}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {new Date(i.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {' · '}{i.logged_by}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteInteraction.mutate(i.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {interactions.length === 0 && (
                  <p className="text-xs text-muted-foreground font-mono px-2">No interactions yet</p>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSave}
                  disabled={Object.keys(editing).length === 0}
                  className="bg-status-hot text-primary-foreground hover:bg-status-hot/90 h-8 text-xs"
                >
                  Save Changes
                </Button>
                <Button
                  onClick={() => setShowMoveDialog(true)}
                  variant="outline"
                  className="h-8 text-xs border-border text-foreground"
                >
                  <ArrowRightLeft className="h-3 w-3 mr-1" /> Move
                </Button>
              </div>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Confirm?</span>
                  <Button onClick={handleDelete} variant="destructive" className="h-7 text-[10px]">Delete</Button>
                  <Button onClick={() => setShowDeleteConfirm(false)} variant="outline" className="h-7 text-[10px] border-border">Cancel</Button>
                </div>
              ) : (
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="outline"
                  className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              )}
            </div>

            {showMoveDialog && (
              <MoveContactDialog
                contactId={contactId}
                currentMarket={contact.market || ''}
                currentClub={contact.club || ''}
                onClose={() => setShowMoveDialog(false)}
              />
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ContactDetail;

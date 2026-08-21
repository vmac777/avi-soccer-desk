import { useState } from 'react';
import { cn } from '@/lib/utils';
import { type BuyPitch, type BallInCourt, useSetBallInCourt } from '@/hooks/useBuyData';
import { formatCompactEur } from '@/lib/currency';
import { TRACK_LABELS } from '@/lib/placementStage';

type Props = {
  pitch: BuyPitch;
  targetName: string;
  targetClub?: string;
  contactName: string;
  contactClub: string;
  /** What the column would glow as if the card had no override. */
  columnDefaultGlow: BallInCourt | null;
  onOpen: () => void;
  viewMode?: 'detailed' | 'short';
  /** How many clubs are live on this player right now. More than one is leverage. */
  clubsInPlay?: number;
};

function fmt(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

// The gates between agreement and a registered player. Each of the last three
// is a way a deal everyone agreed on still fails.
const milestoneOrder: { key: string; short: string }[] = [
  { key: 'enquiry_sent', short: 'Enquiry' },
  { key: 'bid_submitted', short: 'Bid' },
  { key: 'fee_agreed', short: 'Fee' },
  { key: 'terms_agreed', short: 'Terms' },
  { key: 'medical', short: 'Medical' },
  { key: 'work_permit', short: 'Permit' },
  { key: 'itc', short: 'ITC' },
  { key: 'registered', short: 'Registered' },
  { key: 'announced', short: 'Announced' },
];

export default function BuyPitchCard({ pitch, targetName, targetClub, contactName, contactClub, columnDefaultGlow, onOpen, viewMode = 'detailed', clubsInPlay = 1 }: Props) {
  const setBic = useSetBallInCourt();
  const [expanded, setExpanded] = useState(false);
  const effective: BallInCourt | null = pitch.ball_in_court ?? columnDefaultGlow;

  // Only "us" is a queue an agent can clear on their own. Every other party
  // reads the same way — waiting — so they share one treatment.
  const waitingOnThem = effective === 'selling' || effective === 'buying' || effective === 'player';

  const glowClass =
    effective === 'us' ? 'shadow-glow-us ring-glow-us'
    : waitingOnThem ? 'shadow-glow-them ring-glow-them'
    : '';

  // The square cycles through the parties rather than toggling, because with
  // three counterparties "not us" is not an answer.
  const BALL_CYCLE: (BallInCourt | null)[] = ['us', 'selling', 'buying', 'player', null];
  const cycle = () => {
    const at = BALL_CYCLE.indexOf(pitch.ball_in_court ?? null);
    setBic.mutate({ id: pitch.id, value: BALL_CYCLE[(at + 1) % BALL_CYCLE.length] });
  };

  const blockStyle = effective === 'us'
    ? { backgroundColor: 'hsl(var(--glow-action-us))' }
    : waitingOnThem
      ? { backgroundColor: 'hsl(var(--glow-action-them))' }
      : undefined;

  const milestones = pitch.milestones || {};
  const setKeys = milestoneOrder.filter(m => milestones[m.key as keyof typeof milestones]);

  const showDetails = viewMode === 'detailed' || expanded;

  const handleCardClick = () => {
    if (viewMode === 'short') {
      setExpanded(e => !e);
    } else {
      onOpen();
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'bg-card border border-border rounded-md p-2.5 cursor-pointer transition-all space-y-1.5',
        'hover:border-[hsl(var(--gold)/0.35)]',
        glowClass,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{targetName}</p>
            {/* Several clubs live on the same player is a competitive situation,
                and by stage it otherwise scatters across columns as unrelated
                rows. */}
            {clubsInPlay > 1 && (
              <span
                title={`${clubsInPlay} clubs in play for this player`}
                className="shrink-0 font-mono text-[9px] px-1 py-0.5 rounded border border-[hsl(var(--gold)/0.5)] text-[hsl(var(--gold))]"
              >
                {clubsInPlay} clubs
              </span>
            )}
          </div>
          {(() => {
            // Show player's current club; agent counterparties duplicate contactName==club, so prefer targetClub.
            const clubToShow = targetClub || (contactClub && contactClub !== contactName ? contactClub : '');
            return (
              <p className="text-[10px] text-muted-foreground truncate">
                {contactName}{clubToShow ? ` · ${clubToShow}` : ''}
              </p>
            );
          })()}
        </div>
        <button
          onClick={e => { e.stopPropagation(); cycle(); }}
          title={effective === 'us' ? 'On us — click to cycle'
            : waitingOnThem ? `Waiting on the ${effective} — click to cycle`
            : 'Nobody assigned — click to set'}
          className={cn(
            'h-4 w-4 rounded-sm border shrink-0 transition-colors',
            effective ? 'border-transparent' : 'border-border hover:border-foreground/40'
          )}
          style={blockStyle}
        />
      </div>

      {showDetails && (
        <>
          {/* Track badges */}
          <div className="flex gap-1 flex-wrap">
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
              Sell: <span className="text-foreground">{TRACK_LABELS[pitch.selling_track] ?? '—'}</span>
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
              Buy: <span className="text-foreground">{TRACK_LABELS[pitch.buying_track] ?? '—'}</span>
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
              Player: <span className="text-foreground">{TRACK_LABELS[pitch.player_track] ?? '—'}</span>
            </span>
          </div>

          {/* Negotiation type + complement */}
          {(() => {
            const nt = pitch.negotiation_type;
            if (!nt) return null;
            const shortLabel: Record<string, string> = {
              'Transfer': 'Transfer',
              'Loan': 'Loan',
              'Loan with Option to Buy': 'Loan + Option',
              'Loan with Obligation to Buy': 'Loan + Obligation',
              'Free Agent': 'Free Agent',
            };
            let complementLabel: string | null = null;
            let complementValue: number | null = null;
            if (nt === 'Transfer') {
              complementLabel = 'Ask';
              complementValue = pitch.asking_price;
            } else if (nt === 'Free Agent') {
              complementLabel = 'Agent Fee';
              complementValue = pitch.loan_trigger_value;
            } else if (nt === 'Loan with Option to Buy' || nt === 'Loan with Obligation to Buy') {
              complementLabel = 'Trigger';
              complementValue = pitch.loan_trigger_value;
            }
            return (
              <div className="flex items-center justify-between pt-1 gap-2">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground">
                  {shortLabel[nt]}
                </span>
                {complementLabel && (
                  <span className="text-[10px] text-muted-foreground">
                    {complementLabel}: <span className="font-mono text-foreground">{formatCompactEur(complementValue)}</span>
                  </span>
                )}
              </div>
            );
          })()}

          {/* Milestones */}
          {setKeys.length > 0 && (
            <div className="pt-1 border-t border-border space-y-0.5">
              {setKeys.map(m => {
                const entry = milestones[m.key as keyof typeof milestones];
                const isBid = m.key === 'bid_submitted';
                const inProg = entry?.in_progress;
                return (
                  <div key={m.key} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">
                      <span className="text-foreground">✓</span> {m.short}
                      {inProg && <span className="text-[hsl(var(--gold))]"> (in progress)</span>}
                      {isBid && entry?.amount ? <span className="font-mono text-foreground"> · {formatCompactEur(entry.amount)}</span> : null}
                    </span>
                    <span className="font-mono text-muted-foreground">{fmt(entry?.at)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'short' && (
            <button
              onClick={e => { e.stopPropagation(); onOpen(); }}
              className="w-full text-[10px] text-[hsl(var(--gold))] hover:underline pt-1 border-t border-border"
            >
              Open details →
            </button>
          )}
        </>
      )}
    </div>
  );
}

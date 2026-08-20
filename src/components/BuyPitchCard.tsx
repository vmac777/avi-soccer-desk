import { useState } from 'react';
import { cn } from '@/lib/utils';
import { type BuyPitch, type BallInCourt, useSetBallInCourt } from '@/hooks/useBuyData';
import { formatCompactEur } from '@/lib/currency';

type Props = {
  pitch: BuyPitch;
  targetName: string;
  targetClub?: string;
  contactName: string;
  contactClub: string;
  /** What the column would glow as if the card had no override. 'us' | 'them' | null */
  columnDefaultGlow: BallInCourt | null;
  onOpen: () => void;
  viewMode?: 'detailed' | 'short';
};

function fmt(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

const trackLabel: Record<string, string> = {
  none: '—',
  enquiring: 'Enquiring',
  bid_in: 'Bid in',
  fee_agreed: 'Fee agreed',
  talking: 'Talking',
  agreed: 'Agreed',
};

const milestoneOrder: { key: string; short: string }[] = [
  { key: 'enquiry_sent', short: 'Enquiry' },
  { key: 'bid_submitted', short: 'Bid' },
  { key: 'fee_agreed', short: 'Fee' },
  { key: 'terms_agreed', short: 'Terms' },
  { key: 'medical', short: 'Medical' },
  { key: 'registered', short: 'Registered' },
];

export default function BuyPitchCard({ pitch, targetName, targetClub, contactName, contactClub, columnDefaultGlow, onOpen, viewMode = 'detailed' }: Props) {
  const setBic = useSetBallInCourt();
  const [expanded, setExpanded] = useState(false);
  const effective: BallInCourt | null = pitch.ball_in_court ?? columnDefaultGlow;

  const glowClass =
    effective === 'us' ? 'shadow-glow-us ring-glow-us'
    : effective === 'them' ? 'shadow-glow-them ring-glow-them'
    : '';

  const cycle = () => {
    const next: BallInCourt | null =
      pitch.ball_in_court === 'us' ? 'them'
      : pitch.ball_in_court === 'them' ? null
      : 'us';
    setBic.mutate({ id: pitch.id, value: next });
  };

  const blockStyle = effective === 'us'
    ? { backgroundColor: 'hsl(var(--glow-action-us))' }
    : effective === 'them'
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
          <p className="text-xs font-semibold text-foreground truncate">{targetName}</p>
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
          title={effective === 'us' ? 'Action on us — click to flip' : effective === 'them' ? 'Waiting on them — click to clear' : 'No action — click to set'}
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
              Club: <span className="text-foreground">{trackLabel[pitch.club_track] ?? '—'}</span>
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
              Player: <span className="text-foreground">{trackLabel[pitch.player_track] ?? '—'}</span>
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

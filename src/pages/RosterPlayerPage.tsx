import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileDown, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScoutedTargets } from '@/hooks/useBuyData';
import { enrichTarget } from '@/hooks/useEnrichScoutedTarget';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toRosterPlayer } from '@/lib/rosterMapping';
import {
  getAge,
  getPositionGroup,
  hasMandateData,
  hasTrData,
  isPrintable,
  type RosterPlayer,
} from '@/lib/rosterData';
import PlayerHeader from '@/components/player/PlayerHeader';
import SectionWrapper from '@/components/player/SectionWrapper';
import MarketIntelligenceSection from '@/components/player/MarketIntelligenceSection';
import XtvHistoryChart from '@/components/player/XtvHistoryChart';
import GbeSection from '@/components/player/GbeSection';
import TransferHistorySection from '@/components/player/TransferHistorySection';
import ExportPdfDialog from '@/components/player/ExportPdfDialog';
import SetReminderButton from '@/components/SetReminderButton';

const fmtDate = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtEur = (n?: number) =>
  n == null ? '—' : n >= 1_000_000 ? `€${(n / 1_000_000).toFixed(1)}M` : `€${(n / 1000).toFixed(0)}k`;

/**
 * Marks a value the agency has not confirmed.
 *
 * Contract dates in particular arrive from a public list that publishes a year,
 * not a date. Showing an unconfirmed date as though it were known is how an
 * agent ends up approaching a club in the wrong window, so anything the
 * provenance map does not vouch for is labelled here and left off the PDF.
 */
function Unverified() {
  return (
    <span
      className="ml-1.5 inline-flex items-center gap-1 align-middle text-[9px] uppercase tracking-wider text-amber-400/90"
      title="Not confirmed by the agency — excluded from client documents"
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      unverified
    </span>
  );
}

function Field({
  label,
  value,
  player,
  field,
}: {
  label: string;
  value: string;
  player: RosterPlayer;
  field?: keyof RosterPlayer;
}) {
  const unverified = field ? !isPrintable(player, field) && value !== '—' : false;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">
        {value}
        {unverified && <Unverified />}
      </div>
    </div>
  );
}

export default function RosterPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: targets = [], isLoading } = useScoutedTargets();
  const [showPdf, setShowPdf] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const qc = useQueryClient();

  const row = useMemo(() => targets.find((t) => t.id === id || t.slug === id), [targets, id]);

  const enrich = async () => {
    if (!row) return;
    setEnriching(true);
    try {
      const r = await enrichTarget(row);
      qc.invalidateQueries({ queryKey: ['scouted_targets'] });
      if (r.tm === 'failed' && r.tr !== 'ok') toast.error('Could not read either source.');
      else if (r.tm === 'failed') toast.warning('Transfermarkt could not be read; TransferRoom data updated.');
      else if (r.tr === 'failed') toast.warning('Updated from Transfermarkt. No TransferRoom match.');
      else toast.success('Updated.');
    } finally {
      setEnriching(false);
    }
  };

  const player = useMemo(() => (row ? toRosterPlayer(row) : undefined), [row]);

  if (isLoading) {
    return <div className="p-6 text-xs font-mono text-muted-foreground">Loading…</div>;
  }

  if (!player) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-foreground">Player not found.</p>
        <Link to="/roster" className="text-xs text-primary hover:underline">
          Back to roster
        </Link>
      </div>
    );
  }

  const group = getPositionGroup(player.position);
  const age = player.dob ? getAge(player.dob) : player.age;
  const onLoan = player.tenure === 'loan';

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/roster')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Roster
        </button>
        <div className="flex items-center gap-2">
          <SetReminderButton
            target={{ type: 'scouted_target', id: player.id, label: player.name, sublabel: player.currentClub }}
          />
          <Button
            variant="outline"
            onClick={enrich}
            disabled={enriching || !player.tmLink}
            className="h-7 text-[11px]"
            title={player.tmLink
              ? 'Refetch from Transfermarkt and TransferRoom'
              : 'No Transfermarkt link on this player'}
          >
            {enriching
              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            {enriching ? 'Fetching…' : 'Enrich'}
          </Button>
          <Button
            onClick={() => setShowPdf(true)}
            className="h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <FileDown className="h-3.5 w-3.5 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      <PlayerHeader player={player} />

      <SectionWrapper title="Sporting Information" defaultOpen>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Position" value={`${player.position || '—'} (${group})`} player={player} field="position" />
          <Field label="Age" value={age != null ? String(age) : '—'} player={player} field="age" />
          <Field label="Nationality" value={player.nationality ?? '—'} player={player} field="nationality" />
          <Field label="Height" value={player.height ? `${player.height}m` : '—'} player={player} field="height" />
          <Field label="Preferred foot" value={player.trPreferredFoot ?? player.foot ?? '—'} player={player} field="foot" />
          <Field label="Current club" value={player.currentClub ?? '—'} player={player} field="currentClub" />
          <Field label="League" value={player.league ?? '—'} player={player} field="league" />
          {player.dob && (
            <Field label="Date of birth" value={fmtDate(player.dob)} player={player} field="dob" />
          )}
        </div>
      </SectionWrapper>

      {/* Both contracts, kept apart on purpose: one says when he can move, the
          other when he comes back. */}
      <SectionWrapper title={onLoan ? 'Contracts — on loan' : 'Contract'} defaultOpen borderAccent="border-l-primary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field
            label={onLoan ? 'Parent club' : 'Club'}
            value={(onLoan ? player.ownerClub : player.currentClub) ?? '—'}
            player={player}
            field={onLoan ? 'ownerClub' : 'currentClub'}
          />
          <Field
            label={onLoan ? 'Parent contract ends' : 'Contract ends'}
            value={fmtDate(player.contractEndDate)}
            player={player}
            field="contractEndDate"
          />
          {onLoan && (
            <>
              <Field label="On loan at" value={player.loanClub ?? '—'} player={player} field="loanClub" />
              <Field label="Loan ends" value={fmtDate(player.loanContractEnd)} player={player} field="loanContractEnd" />
            </>
          )}
          {player.tenure === 'free_agent' && (
            <Field label="Status" value="Free agent" player={player} field="tenure" />
          )}
        </div>
      </SectionWrapper>

      {hasMandateData(player) && (
        <SectionWrapper title="Our Mandate" borderAccent="border-l-amber-500/60">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Mandate from" value={fmtDate(player.mandateStart)} player={player} field="mandateStart" />
            <Field label="Mandate until" value={fmtDate(player.mandateEnd)} player={player} field="mandateEnd" />
            <Field
              label="Exclusivity"
              value={player.exclusive == null ? '—' : player.exclusive ? 'Exclusive' : 'Non-exclusive'}
              player={player}
              field="exclusive"
            />
            <Field
              label="Commission"
              value={player.commissionPct != null ? `${player.commissionPct}%` : '—'}
              player={player}
              field="commissionPct"
            />
            <Field
              label="Sell-on"
              value={player.sellOnPct != null ? `${player.sellOnPct}%` : '—'}
              player={player}
              field="sellOnPct"
            />
            <Field label="Market value" value={fmtEur(player.marketValue)} player={player} field="marketValue" />
          </div>
        </SectionWrapper>
      )}

      {hasTrData(player) && (
        <>
          <MarketIntelligenceSection player={player} />
          <XtvHistoryChart player={player} />
          <GbeSection player={player} />
          <TransferHistorySection player={player} />
        </>
      )}

      {player.notes && (
        <SectionWrapper title="Notes">
          <p className="text-sm text-foreground whitespace-pre-wrap">{player.notes}</p>
        </SectionWrapper>
      )}

      {showPdf && <ExportPdfDialog player={player} open={showPdf} onClose={() => setShowPdf(false)} />}
    </div>
  );
}

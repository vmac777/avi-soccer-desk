import { RosterPlayer as Player, hasTrData } from '@/lib/rosterData';
import SectionWrapper from './SectionWrapper';
import { useTrTeamHistory, findTrFee } from '@/hooks/useTrTeamHistory';

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatFee(fee: number | null, feeEurM: number | null): string {
  if (feeEurM != null) return feeEurM > 0 ? `€${feeEurM.toFixed(1)}M` : 'Free';
  if (fee != null) return fee > 0 ? `€${(fee / 1_000_000).toFixed(1)}M` : 'Free';
  return '—';
}

export default function TransferHistorySection({ player }: { player: Player }) {
  const hasTr = hasTrData(player);
  const trHistory = useTrTeamHistory(player.trId);
  const sorted = [...player.transferHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <SectionWrapper title="TRANSFER HISTORY" defaultOpen={true}>
      {!hasTr || sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground font-mono">No transfer history available.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left py-1.5 font-medium">Date</th>
              <th className="text-left py-1.5 font-medium">From → To</th>
              <th className="text-right py-1.5 font-medium">Fee</th>
              <th className="text-right py-1.5 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const trFee = t.fee == null && t.feeEurM == null ? findTrFee(trHistory, t.date) : null;
              const fee = t.fee ?? trFee;
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 text-muted-foreground">{formatDate(t.date)}</td>
                  <td className="py-1.5 text-foreground">{t.fromTeam} → {t.toTeam}</td>
                  <td className="py-1.5 text-right text-foreground">{formatFee(fee, t.feeEurM)}</td>
                  <td className="py-1.5 text-right text-muted-foreground">{t.transferType}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </SectionWrapper>
  );
}

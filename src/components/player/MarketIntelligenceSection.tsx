import { RosterPlayer as Player, hasTrData, getLatestXtvM, getXtvChange6mPct, getXtvChange12mPct, eurToM } from '@/lib/rosterData';
import SectionWrapper from './SectionWrapper';
import InfoField from './InfoField';

function formatEurM(v: number | undefined): string {
  if (v == null) return '—';
  return v >= 1 ? `€${v.toFixed(1)}M` : `€${(v * 1000).toFixed(0)}K`;
}

function TrendValue({ value }: { value: number | undefined }) {
  if (value == null) return <span>—</span>;
  const color = value > 0 ? 'text-[#4ADE80]' : value < 0 ? 'text-[#F87171]' : 'text-muted-foreground';
  return <span className={color}>{value > 0 ? '+' : ''}{value}%</span>;
}

export default function MarketIntelligenceSection({ player }: { player: Player }) {
  const hasTr = hasTrData(player);
  const latestXtv = getLatestXtvM(player);
  const change6m = getXtvChange6mPct(player);
  const change12m = getXtvChange12mPct(player);

  return (
    <SectionWrapper title="MARKET INTELLIGENCE" defaultOpen={true}>
      {!hasTr ? (
        <p className="text-sm text-muted-foreground font-mono">No market intelligence data available.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Valuation</h3>
            <div className="space-y-3">
              <InfoField label="xTV" value={formatEurM(latestXtv)} />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">xTV 6m Change</p>
                <p className="text-sm"><TrendValue value={change6m} /></p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">xTV 12m Change</p>
                <p className="text-sm"><TrendValue value={change12m} /></p>
              </div>
              <InfoField label="Base Value" value={formatEurM(eurToM(player.trBaseValue))} />
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Availability & Representation</h3>
            <div className="space-y-3">
              <InfoField label="Available for Sale" value={player.trAvailableForSale || <span className="text-muted-foreground">Not Listed</span>} />
              <InfoField label="Asking Price" value={formatEurM(eurToM(player.trAskingPrice))} />
              <InfoField label="Sell-On %" value={player.trSellOnPct != null ? `${player.trSellOnPct}%` : '—'} />
              <InfoField label="Agency" value={
                player.trAgency ? (
                  <span>
                    {player.trAgency}
                    {player.trAgencyVerified === 'Yes' && <span className="ml-1 text-[#4ADE80]">✓</span>}
                  </span>
                ) : '—'
              } />
            </div>
          </div>
        </div>
      )}
    </SectionWrapper>
  );
}

import { RosterPlayer as Player, hasTrData } from '@/lib/rosterData';
import SectionWrapper from './SectionWrapper';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { useSquadXtvHistory } from '@/hooks/useSquadXtvHistory';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function XtvHistoryChart({ player }: { player: Player }) {
  const hasTr = hasTrData(player);
  const fresh = useSquadXtvHistory(player.trId);
  const source = fresh && fresh.length > 0 ? fresh : player.xtvHistory;
  const data = [...source]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((d) => ({
      label: `${MONTHS[d.month - 1]} ${String(d.year).slice(2)}`,
      value: d.xtv / 1_000_000,
    }));

  return (
    <SectionWrapper title="XTV HISTORY" defaultOpen={true}>
      {!hasTr || data.length === 0 ? (
        <p className="text-sm text-muted-foreground font-mono">No xTV history available.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="xtvGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `€${v.toFixed(1)}M`}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`€${v.toFixed(2)}M`, 'xTV']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#xtvGradient)"
                dot={{ r: 2, fill: 'hsl(var(--primary))' }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionWrapper>
  );
}

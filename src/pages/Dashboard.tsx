import { useState, useMemo } from 'react';
import { useContacts, useRecentInteractions } from '@/hooks/useData';
import { useBuyPitches, BUY_ACTIVE_STAGES } from '@/hooks/useBuyData';
import { healthColor, healthBg, getMarketStats, stagePill } from '@/lib/contactUtils';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Input } from '@/components/ui/input';
import { TIER_1_LEAGUES, TIER_2_LEAGUES } from '@/lib/leagueTiers';
import type { ContactEnriched } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useLeagueNewsCounts, urgencyClasses, type LeagueNewsCount } from '@/hooks/useNewsCounts';
import NewsFlagBadge from '@/components/NewsFlagBadge';

function buildDonutData(contacts: ContactEnriched[]) {
  const counts = {
    active: contacts.filter((c) => c.health_status === 'active').length,
    recent: contacts.filter((c) => c.health_status === 'recent').length,
    stale: contacts.filter((c) => c.health_status === 'stale').length,
    unknown: contacts.filter((c) => c.health_status === 'unknown').length,
  };
  return [
    { name: 'Active (<27d)', value: counts.active, color: 'hsl(142, 71%, 45%)' },
    { name: 'Recent (27-90d)', value: counts.recent, color: 'hsl(48, 96%, 47%)' },
    { name: 'Stale (90d+)', value: counts.stale, color: 'hsl(0, 84%, 60%)' },
    { name: 'Unknown', value: counts.unknown, color: '#5a5548' },
  ].filter((d) => d.value > 0);
}

function StalenessDonut({ title, data }: { title: string; data: { name: string; value: number; color: string }[] }) {
  if (data.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <h2 className="text-[10px] tracking-[0.15em] font-bold text-primary uppercase mb-3">{title}</h2>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              label={({ x, y, value }) => (
                <text x={x} y={y} fill="hsl(var(--foreground))" fontSize={11} fontFamily="monospace" textAnchor="middle" dominantBaseline="central">{value}</text>
              )}
              labelLine={false}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e1c16',
                border: '1px solid rgba(200,170,100,0.1)',
                borderRadius: '6px',
                color: '#e8e0d0',
                fontSize: '12px',
              }}
              itemStyle={{ color: '#e8e0d0' }}
              labelStyle={{ color: '#e8e0d0' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="text-[10px] text-muted-foreground">{d.name} ({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getTeamFreshness(contacts: ContactEnriched[]): { club: string; health: string }[] {
  const clubMap: Record<string, ContactEnriched[]> = {};
  contacts.forEach((c) => {
    if (!clubMap[c.club]) clubMap[c.club] = [];
    clubMap[c.club].push(c);
  });
  return Object.entries(clubMap).map(([club, members]) => {
    const best = members.reduce((a, b) => {
      const da = a.days_since_contact ?? 9999;
      const db = b.days_since_contact ?? 9999;
      return da < db ? a : b;
    });
    return { club, health: best.health_status };
  }).sort((a, b) => a.club.localeCompare(b.club));
}

function MarketGrid({
  markets,
  navigate,
  newsCounts,
}: {
  markets: [string, { contacts: ContactEnriched[]; avgStaleness: number }][];
  navigate: (path: string) => void;
  newsCounts: Record<string, LeagueNewsCount>;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {markets.map(([market, data]) => {
        const teams = getTeamFreshness(data.contacts);
        const news = newsCounts[market];
        const urgency = news?.unread_count ? news.max_urgency : null;
        const { border } = urgencyClasses(urgency);
        const hasFlag = !!border;
        return (
          <button
            key={market}
            onClick={() => navigate(`/contacts?market=${encodeURIComponent(market)}`)}
            className={cn(
              'bg-card border rounded-md p-3 text-left hover:bg-surface-hover transition-colors duration-150',
              hasFlag ? border : 'border-border',
            )}
          >
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <NewsFlagBadge count={news?.unread_count ?? 0} urgency={urgency} />
                <span className="text-xs font-medium text-foreground truncate">{market}</span>
              </div>
              <span className={cn(
                'text-[10px] font-mono px-1.5 py-0.5 rounded',
                data.avgStaleness < 0 ? 'text-muted-foreground bg-muted' :
                healthColor(data.avgStaleness < 27 ? 'active' : data.avgStaleness <= 90 ? 'recent' : 'stale'),
                data.avgStaleness < 0 ? '' :
                healthBg(data.avgStaleness < 27 ? 'active' : data.avgStaleness <= 90 ? 'recent' : 'stale')
              )}>
                {data.avgStaleness < 0 ? '—' : `${data.avgStaleness}d`}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <span className="text-[10px] text-muted-foreground mr-1">{teams.length}</span>
              {teams.slice(0, 12).map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-1.5 h-4 rounded-sm',
                    t.health === 'active' ? 'bg-status-hot' :
                    t.health === 'recent' ? 'bg-status-recent' :
                    t.health === 'stale' ? 'bg-status-cold' :
                    'bg-muted'
                  )}
                />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const Dashboard = () => {
  const { data: allContacts = [], isLoading } = useContacts();
  const { data: pitches = [] } = useBuyPitches();
  const { data: recentActivity = [] } = useRecentInteractions(20);
  const { isAdmin } = useAuth();
  const { data: leagueNewsCounts = {} } = useLeagueNewsCounts(isAdmin);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const contacts = useMemo(() => {
    if (!search) return allContacts;
    const s = search.toLowerCase();
    return allContacts.filter(c =>
      c.market?.toLowerCase().includes(s) ||
      c.club?.toLowerCase().includes(s) ||
      c.contact_person?.toLowerCase().includes(s)
    );
  }, [allContacts, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground font-mono text-sm">Loading...</span>
      </div>
    );
  }

  const total = contacts.length;
  const avgStaleness = total
    ? Math.round(contacts.reduce((a, c) => a + (c.days_since_contact ?? 0), 0) / total)
    : 0;
  const activeCount = contacts.filter((c) => c.health_status === 'active').length;
  const staleCount = contacts.filter((c) => c.health_status === 'stale').length;
  const stalePct = total ? Math.round((staleCount / total) * 100) : 0;
  const offeredCount = contacts.filter((c) => c.stage === 'Offered').length;
  const negotiatingCount = contacts.filter((c) => c.stage === 'Negotiating').length;

  /**
   * Deals waiting on us.
   *
   * The only queue an agent controls outright — everything else is waiting on a
   * club or a player to come back. It goes first because it is the one number
   * on this page that is directly actionable.
   */
  const onUs = pitches.filter(p =>
    p.ball_in_court === 'us' && (BUY_ACTIVE_STAGES as readonly string[]).includes(p.stage)).length;

  const kpis = [
    { label: 'Ball in our court', value: onUs, color: onUs > 0 ? 'text-status-hot' : 'text-muted-foreground' },
    { label: 'Total Contacts', value: total, color: 'text-foreground' },
    { label: 'Avg Staleness', value: `${avgStaleness}d`, color: 'text-status-warm' },
    { label: 'Active in window', value: activeCount, color: 'text-status-hot' },
    { label: 'Stale 90d+', value: `${staleCount} (${stalePct}%)`, color: 'text-status-cold' },
    { label: 'Offered', value: offeredCount, color: 'text-status-pipeline' },
    { label: 'Negotiating', value: negotiatingCount, color: 'text-status-warm' },
  ];

  const markets = getMarketStats(contacts);
  const allMarkets = Object.entries(markets);
  const tier1Markets = allMarkets.filter(([m]) => TIER_1_LEAGUES.includes(m)).sort((a, b) => a[0].localeCompare(b[0]));
  const tier2Markets = allMarkets.filter(([m]) => TIER_2_LEAGUES.includes(m)).sort((a, b) => a[0].localeCompare(b[0]));
  const tier3Markets = allMarkets.filter(([m]) => !TIER_1_LEAGUES.includes(m) && !TIER_2_LEAGUES.includes(m)).sort((a, b) => a[0].localeCompare(b[0]));

  const tier1Contacts = contacts.filter((c) => TIER_1_LEAGUES.includes(c.market ?? ''));
  const tier2Contacts = contacts.filter((c) => TIER_2_LEAGUES.includes(c.market ?? ''));
  const tier3Contacts = contacts.filter((c) => !TIER_1_LEAGUES.includes(c.market ?? '') && !TIER_2_LEAGUES.includes(c.market ?? ''));

  const tier1DonutData = buildDonutData(tier1Contacts);
  const tier2DonutData = buildDonutData(tier2Contacts);
  const tier3DonutData = buildDonutData(tier3Contacts);
  const allDonutData = buildDonutData(contacts);

  const staleAlerts = contacts
    .filter((c) => (c.stage === 'Offered' || c.stage === 'Negotiating') && (c.days_since_contact ?? 999) > 14)
    .sort((a, b) => (b.days_since_contact ?? 0) - (a.days_since_contact ?? 0))
    .slice(0, 10);

  const typeIcons: Record<string, string> = {
    Call: '📞', Meeting: '🤝', WhatsApp: '📱', Email: '📧', TransferRoom: '🔄', Note: '📝',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[11px] tracking-[0.15em] font-bold text-primary uppercase">
          CONTACT NETWORK OVERVIEW
        </h1>
        <Input
          placeholder="Search contacts, clubs, leagues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm h-8 text-xs bg-card border-border"
        />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-card border border-border rounded-md p-4">
            <p className="text-[10px] tracking-wider text-muted-foreground uppercase mb-1">{kpi.label}</p>
            <p className={cn('text-2xl font-mono font-semibold', kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: Market Heatmap */}
        <div className="lg:col-span-3 space-y-3">
          <h2 className="text-[10px] tracking-[0.15em] font-bold text-primary uppercase">MARKET HEATMAP</h2>

          {/* Tier 1 */}
          <h3 className="text-[10px] tracking-[0.12em] font-semibold text-status-hot uppercase mt-1">TIER 1</h3>
          <MarketGrid markets={tier1Markets} navigate={navigate} newsCounts={leagueNewsCounts} />

          {/* Tier 2 */}
          <h3 className="text-[10px] tracking-[0.12em] font-semibold text-status-warm uppercase mt-4">TIER 2</h3>
          <MarketGrid markets={tier2Markets} navigate={navigate} newsCounts={leagueNewsCounts} />

          {/* Tier 3 */}
          <h3 className="text-[10px] tracking-[0.12em] font-semibold text-muted-foreground uppercase mt-4">TIER 3</h3>
          <MarketGrid markets={tier3Markets} navigate={navigate} newsCounts={leagueNewsCounts} />
        </div>

        {/* Right: Donuts + Alerts */}
        <div className="lg:col-span-2 space-y-4">
          <StalenessDonut title="TIER 1 STALENESS" data={tier1DonutData} />
          <StalenessDonut title="TIER 2 STALENESS" data={tier2DonutData} />
          <StalenessDonut title="TIER 3 STALENESS" data={tier3DonutData} />
          <StalenessDonut title="ALL CONTACTS STALENESS" data={allDonutData} />

          <div className="bg-card border border-border rounded-md p-4">
            <h2 className="text-[10px] tracking-[0.15em] font-bold text-primary uppercase mb-3">STALE ALERTS</h2>
            {staleAlerts.length === 0 ? (
              <p className="text-xs text-muted-foreground font-mono">No stale pipeline contacts</p>
            ) : (
              <div className="space-y-1">
                {staleAlerts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/contacts?selected=${c.id}`)}
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-surface-hover transition-colors',
                      (c.days_since_contact ?? 0) > 30 && 'shadow-[0_0_15px_rgba(234,179,8,0.05)]'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={stagePill(c.stage)}>{c.stage}</span>
                      <span className="text-foreground">{c.club}</span>
                    </div>
                    <span className={cn('font-mono text-[11px]', healthColor(c.health_status))}>
                      {c.days_since_contact}d
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-md p-4">
        <h2 className="text-[10px] tracking-[0.15em] font-bold text-primary uppercase mb-3">RECENT ACTIVITY</h2>
        {recentActivity.length === 0 ? (
          <p className="text-xs text-muted-foreground font-mono">No recent activity</p>
        ) : (
          <div className="space-y-1">
            {recentActivity.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 px-2 py-1.5 text-xs rounded hover:bg-surface-hover transition-colors">
                <span className="font-mono text-[10px] text-muted-foreground w-16 shrink-0">
                  {new Date(a.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
                <span>{typeIcons[a.interaction_type] || '📝'}</span>
                <span className="text-foreground font-medium">{a.contacts?.club || '—'}</span>
                <span className="text-muted-foreground truncate">{a.note}</span>
                <span className="text-muted-foreground ml-auto shrink-0">{a.logged_by}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

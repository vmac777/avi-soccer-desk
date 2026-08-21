import { cn } from '@/lib/utils';
import type { ContactEnriched } from '@/lib/supabase';

export const healthColor = (status: string) => {
  switch (status) {
    case 'active':
    case 'hot': return 'text-status-hot';
    case 'recent': return 'text-status-recent';
    case 'warm': return 'text-status-warm';
    case 'stale':
    case 'cold': return 'text-status-cold';
    case 'frozen': return 'text-status-frozen';
    default: return 'text-muted-foreground';
  }
};

export const healthBg = (status: string) => {
  switch (status) {
    case 'active':
    case 'hot': return 'bg-status-hot/10';
    case 'recent': return 'bg-status-recent/10';
    case 'warm': return 'bg-status-warm/10';
    case 'stale':
    case 'cold': return 'bg-status-cold/10';
    case 'frozen': return 'bg-status-frozen/10';
    default: return 'bg-muted';
  }
};

export const stagePill = (stage: string) => {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border';
  switch (stage) {
    case '':
      return cn(base, 'border-border text-muted-foreground');
    case 'Contacted - No Answer':
      return cn(base, 'bg-blue-500/10 text-blue-400 border-blue-500/20');
    case 'Contacted':
      return cn(base, 'bg-gray-500/10 text-gray-400 border-gray-500/20');
    case 'Offered':
      return cn(base, 'bg-status-pipeline/10 text-status-pipeline border-status-pipeline/20');
    case 'Negotiating':
      return cn(base, 'bg-status-warm/10 text-status-warm border-status-warm/20');
    case 'Closed Won':
      return cn(base, 'bg-status-hot/10 text-status-hot border-status-hot/20');
    case 'Closed Lost':
      return cn(base, 'bg-status-cold/10 text-status-cold border-status-cold/20');
    case 'Dormant':
      return cn(base, 'bg-status-frozen/10 text-status-frozen border-status-frozen/20');
    default:
      return cn(base, 'border-border text-muted-foreground');
  }
};

export const formatDaysAgo = (days: number | null): string => {
  if (days === null) return '—';
  return `${days}d`;
};

export const getMarketStats = (contacts: ContactEnriched[]) => {
  const markets: Record<string, { contacts: ContactEnriched[]; avgStaleness: number }> = {};
  contacts.forEach((c) => {
    if (!markets[c.market]) markets[c.market] = { contacts: [], avgStaleness: 0 };
    markets[c.market].contacts.push(c);
  });
  Object.keys(markets).forEach((m) => {
    const days = markets[m].contacts
      .filter((c) => c.health_status !== 'unknown')
      .map((c) => c.days_since_contact ?? 0);
    markets[m].avgStaleness = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : -1;
  });
  return markets;
};

// Cutoff: contacts touched on/after April 1, 2026 = active; older = recent
const ACTIVE_CUTOFF = new Date('2026-04-01');

/**
 * How a club with no recorded contact reads.
 *
 * The status key stays 'unknown' because that is what the data says — we hold
 * no date — but "unknown" is the wrong word on screen. Nobody has called them.
 * That is not missing information, it is the state of the relationship, and it
 * is the most actionable one on the page: it is the gap in the network.
 *
 * The app said "Unknown" on the dashboard, "Never" on a club card and "No
 * contact" on a contact — three words for one thing. One word now.
 */
export const UNCONTACTED_LABEL = 'Uncontacted';

export const getHealthStatus = (days: number | null): string => {
  if (days === null) return 'unknown';
  const lastContact = new Date();
  lastContact.setDate(lastContact.getDate() - days);
  return lastContact >= ACTIVE_CUTOFF ? 'active' : 'recent';
};

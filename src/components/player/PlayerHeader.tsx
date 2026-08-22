import { RosterPlayer as Player, formatHeight, getPositionGroup, getAge, hasTrData, getLatestXtvM, getXtvChange6mPct } from '@/lib/rosterData';
import { cn } from '@/lib/utils';
import { tmHref } from '@/lib/tmUrl';
import { ExternalLink } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const positionPillColor = (group: string) => {
  switch (group) {
    case 'GK': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
    case 'DEF': return 'bg-blue-500/15 text-blue-400 border-blue-500/25';
    case 'MID': return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
    case 'FWD': return 'bg-red-500/15 text-red-400 border-red-500/25';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const positionAvatarBg = (group: string) => {
  switch (group) {
    case 'GK': return 'bg-emerald-600';
    case 'DEF': return 'bg-blue-600';
    case 'MID': return 'bg-amber-600';
    case 'FWD': return 'bg-red-600';
    default: return 'bg-muted';
  }
};

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PlayerHeader({ player }: { player: Player }) {
  const group = getPositionGroup(player.position);
  // A real date of birth if we have one, otherwise the age the list came with.
  const age = getAge(player.dob) ?? player.age;
  const hasTr = hasTrData(player);
  const latestXtv = getLatestXtvM(player);
  const change6m = getXtvChange6mPct(player);

  return (
    <div className="flex items-start gap-4">
      <Avatar className="h-20 w-20 shrink-0">
        {player.photoUrl ? (
          <AvatarImage src={player.photoUrl} alt={player.name} className="object-cover object-top" />
        ) : null}
        <AvatarFallback className={cn('text-xl font-bold text-white', positionAvatarBg(group))}>
          {getInitials(player.name)}
        </AvatarFallback>
      </Avatar>
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{player.name}</h1>
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', positionPillColor(group))}>
            {player.position}
          </span>
          {/* xTV badge */}
          {hasTr && latestXtv != null && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold border border-primary/25">
              €{latestXtv >= 1 ? `${latestXtv.toFixed(1)}M` : `${(latestXtv * 1000).toFixed(0)}K`}
              {change6m != null && change6m !== 0 && (
                <span className={cn('text-[10px] font-medium', change6m > 0 ? 'text-[#4ADE80]' : 'text-[#F87171]')}>
                  {change6m > 0 ? '↑' : '↓'}{Math.abs(change6m)}%
                </span>
              )}
            </span>
          )}
        </div>
        {player.fullName && <p className="text-sm text-muted-foreground mt-0.5">{player.fullName}</p>}
        {/* Each pill is a fact we hold. Until enrichment has run against the
            Transfermarkt link most of these are absent, and an empty pill reads
            as a fact we have and can't display. Show only what we know. */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {age != null && (
            <span className="px-2 py-0.5 rounded-md bg-accent text-xs text-foreground">{age} yrs</span>
          )}
          {player.nationality && (
            <span className="px-2 py-0.5 rounded-md bg-accent text-xs text-foreground">{player.nationality}</span>
          )}
          {player.height && (
            <span className="px-2 py-0.5 rounded-md bg-accent text-xs text-foreground">{formatHeight(player.height)}</span>
          )}
          {player.currentClub && (
            <span className="px-2 py-0.5 rounded-md bg-accent text-xs text-foreground">{player.currentClub}</span>
          )}
          {hasTr && player.trEuPassport && (
            <span className="px-2 py-0.5 rounded-md bg-accent text-xs text-foreground">🇪🇺 EU Passport</span>
          )}
          {player.tmLink && (
            <a href={tmHref(player.tmLink)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="h-3 w-3" /> Transfermarkt
            </a>
          )}
          {player.valuationUrl && (
            <a href={player.valuationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-xs text-primary hover:text-primary/80 transition-colors">
              <ExternalLink className="h-3 w-3" /> Eagle Valuation
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

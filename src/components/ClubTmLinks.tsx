import { ExternalLink, ChevronDown, Newspaper } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getClubTmLinks } from '@/lib/clubTmLinks';
import { resolveClubNews } from '@/lib/clubNewsSources';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClubs } from '@/hooks/useClubsAndSources';

interface ClubTmLinksProps {
  clubName: string;
  /** When provided with unreadCount > 0, renders an "Unread (N)" link to /news?club=<id>&unread=1 */
  unreadCount?: number;
  /** Required when unreadCount > 0; the clubs.id used to scope the news feed. */
  clubId?: string;
}

const norm = (s: string) =>
  s.normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').toLowerCase().trim();

const ClubTmLinks = ({ clubName, unreadCount, clubId }: ClubTmLinksProps) => {
  const links = getClubTmLinks(clubName);
  const news = resolveClubNews(clubName);
  const { data: clubs = [] } = useClubs();
  const crmClub = clubs.find(c => norm(c.name) === norm(clubName));
  const resolvedClubId = clubId ?? crmClub?.id;
  const showUnread = !!(unreadCount && unreadCount > 0 && resolvedClubId);
  if (!links && !news && !crmClub && !showUnread) return null;

  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-left">
      {links && (
        <>
          <a
            href={links.tm}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            TM <ExternalLink className="h-2.5 w-2.5" />
          </a>
          <a
            href={links.tmTopTransfers}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            Top Purchases <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </>
      )}
      {news && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
            >
              News <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="w-[220px] p-0 border-border bg-card"
            onClick={e => e.stopPropagation()}
          >
            {([
              { label: 'Sky Sports', url: news.skySports },
              { label: 'BBC Sport', url: news.bbc },
              { label: 'ESPN', url: news.espn },
            ] as const).map(item => (
              <a
                key={item.label}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 h-9 text-[11px] text-muted-foreground hover:text-primary hover:bg-surface-hover transition-colors"
              >
                {item.label}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ))}
          </PopoverContent>
        </Popover>
      )}
      {crmClub && (
        <Link
          to={`/news/repository?club=${crmClub.id}`}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          title="Open CRM news for this club"
        >
          <Newspaper className="h-2.5 w-2.5" /> CRM News
        </Link>
      )}
      {showUnread && (
        <Link
          to={`/news?club=${resolvedClubId}&unread=1`}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
          title={`${unreadCount} unread urgent item${unreadCount === 1 ? '' : 's'}`}
        >
          Unread ({unreadCount})
        </Link>
      )}
    </span>
  );
};

export default ClubTmLinks;

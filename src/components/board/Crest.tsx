import { useState } from 'react';
import { cn } from '@/lib/utils';
import { crestUrl, clubInitials } from '@/lib/clubCrest';

/**
 * A club, as a disc.
 *
 * Three states, and the fallback is designed rather than accidental: the
 * stored or derived crest when we have one, initials when we do not, and
 * initials again when the image fails to load. Most crests come from the
 * Transfermarkt club id the app already ships, so the initials disc is the
 * exception rather than the rule — but a club with no crest must still look
 * like a club, not like a broken image.
 */
export default function Crest({
  club,
  crest,
  size = 26,
  className,
}: {
  club: string | null | undefined;
  crest?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = crestUrl(club, crest);
  const initials = clubInitials(club);

  return (
    <span
      title={club || undefined}
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'border border-foreground/20 bg-sidebar',
        className,
      )}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={club || ''}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-[2px]"
          loading="lazy"
        />
      ) : (
        <span
          className="font-mono font-semibold leading-none text-foreground/60"
          style={{ fontSize: Math.max(7, Math.round(size * 0.31)) }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}

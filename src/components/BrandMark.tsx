import { CLIENT } from '@/config/client';
import { cn } from '@/lib/utils';

/**
 * The AVI Soccer logo, sized for wherever it sits.
 *
 * Always the reversed mark: every surface in this app is Ink Navy, and the
 * colour logo's letterform is that same navy — it would disappear. The reversed
 * file the brand book supplies is one flat white with no gold, which is the
 * standard treatment for a dark background rather than an omission.
 *
 * Height drives it and width follows, so the two-line lockup is never squashed
 * out of its 2:1 ratio by a container.
 */
export default function BrandMark({
  height = 28,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <img
      src={CLIENT.logoPathReversed}
      alt={CLIENT.shortName}
      style={{ height, width: 'auto' }}
      className={cn('block shrink-0 select-none', className)}
      draggable={false}
    />
  );
}

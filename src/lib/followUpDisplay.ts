import type { FollowUpTargetType } from '@/hooks/useFollowUps';

/**
 * What kind of thing a reminder hangs off, in colour.
 *
 * The list and the calendar both need this, and a reminder that is cyan in one
 * view and violet in the other is worse than no colour at all.
 */
export const TYPE_BADGE: Record<FollowUpTargetType, { label: string; className: string }> = {
  contact: { label: 'Contact', className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' },
  scouted_target: { label: 'Target', className: 'bg-violet-500/15 text-violet-300 border-violet-500/25' },
  buy_pitch: { label: 'Pitch', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
};

/**
 * The same three types as a solid dot, for calendar cells too small for a word.
 */
export const TYPE_DOT: Record<FollowUpTargetType, string> = {
  contact: 'bg-cyan-400',
  scouted_target: 'bg-violet-400',
  buy_pitch: 'bg-emerald-400',
};

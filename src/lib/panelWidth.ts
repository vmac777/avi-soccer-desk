/**
 * Width of the right-hand detail panels.
 *
 * Three panels slide in from the right — a contact, a reminder, a pitch — and
 * each was pinned at 500px on every screen. That number was wrong at both ends.
 * On a wide monitor it left two thirds of the page empty while the pitch panel,
 * which now carries three negotiation tracks stacked one under another, scrolled
 * for no reason. On a phone a fixed 500px simply ran off the edge, and the
 * contact panel did exactly that: `w-[500px]` with no cap.
 *
 * So: full width on a phone, and it grows with the screen from there. One
 * string, because three panels that behave differently is how the phone bug
 * survived in the first place.
 *
 * Sheet-based panels cap with `max-w`; the hand-rolled ones size with `w`. The
 * `w-full` + `max-w-*` pairing works for both, so they can share this.
 */
export const DETAIL_PANEL_WIDTH =
  'w-full sm:max-w-[520px] lg:max-w-[680px] xl:max-w-[820px]';

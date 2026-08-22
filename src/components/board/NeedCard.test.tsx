import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NeedCard from './NeedCard';
import type { UnpitchedNeed } from '@/lib/deskBoard';

/**
 * The card claims "6 of yours fit" and then has to show the six. The panel is
 * the whole argument of the redesign, so what is tested here is that it opens
 * on every input a person might use — a pointer, a keyboard, a thumb — and
 * that the two buttons act instead of toggling the card underneath them.
 */

const need: UnpitchedNeed = {
  requirementId: 'r1',
  clubId: 'c1',
  club: 'Palmeiras',
  want: 'Centre forward, ≤ €5.0m',
  askedDaysAgo: 12,
  fitCount: 1,
  alsoAtClub: 2,
  rows: [
    {
      playerId: 'a', name: 'Ana Costa', meta: 'CF · 24 · Fluminense',
      value: 27_000_000, ok: true, verdict: '€27.0m within €30.0m', initials: 'AC',
    },
    {
      playerId: 'b', name: 'Bruno Reis', meta: 'CF · 31 · Bahia',
      value: 90_000_000, ok: false, verdict: '€90.0m over €30.0m', initials: 'BR',
    },
  ],
};

function mount(over: Partial<Parameters<typeof NeedCard>[0]> = {}) {
  const props = {
    need, rank: 0, maxFits: 3, open: false,
    onOpen: vi.fn(), onClose: vi.fn(), onToggle: vi.fn(),
    onPutForward: vi.fn(), onOpenNeed: vi.fn(),
    ...over,
  };
  return { ...render(<NeedCard {...props} />), props };
}

describe('NeedCard — what it says when closed', () => {
  it('leads with the club and what they asked for', () => {
    mount();
    expect(screen.getByText('Palmeiras')).toBeTruthy();
    expect(screen.getByText('Centre forward, ≤ €5.0m')).toBeTruthy();
    expect(screen.getByText('asked 12d ago')).toBeTruthy();
  });

  it('names the players it counted, not just the count', () => {
    mount();
    expect(screen.getByText('1 of yours fit')).toBeTruthy();
    // The fit names line, so the claim is checkable before you even open it.
    expect(screen.getByText('Ana Costa')).toBeTruthy();
  });

  it('keeps the evidence shut until asked', () => {
    mount();
    expect(screen.queryByText('Who of yours fits')).toBeNull();
    expect(screen.queryByText('€90.0m over €30.0m')).toBeNull();
  });

  it('says nothing about age when the ask was never dated', () => {
    mount({ need: { ...need, askedDaysAgo: null } });
    expect(screen.queryByText(/asked/)).toBeNull();
  });
});

describe('NeedCard — the panel', () => {
  it('shows who fits and who does not, with the reason for each', () => {
    mount({ open: true });
    expect(screen.getByText('Who of yours fits')).toBeTruthy();
    expect(screen.getByText('€27.0m within €30.0m')).toBeTruthy();
    expect(screen.getByText('€90.0m over €30.0m')).toBeTruthy();
    // A player who does not fit is still listed — the × is the point.
    expect(screen.getByText('×')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('renders a row with no computable verdict rather than inventing one', () => {
    mount({
      open: true,
      need: { ...need, rows: [{ ...need.rows[0], verdict: null, value: null }] },
    });
    // Twice: once on the names line, once in the panel.
    expect(screen.getAllByText('Ana Costa').length).toBeGreaterThan(0);
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('NeedCard — every way in', () => {
  it('opens on hover, for a pointer', () => {
    const { props } = mount();
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Palmeiras/ }));
    expect(props.onOpen).toHaveBeenCalled();
  });

  it('opens on focus, so a keyboard is not a lesser experience', () => {
    // Hover-only would strand both keyboard users and the touch demo.
    const { props } = mount();
    fireEvent.focus(screen.getByRole('button', { name: /Palmeiras/ }));
    expect(props.onOpen).toHaveBeenCalled();
  });

  it('toggles on tap, which is all a phone has', () => {
    const { props } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Palmeiras/ }));
    expect(props.onToggle).toHaveBeenCalled();
  });

  it('toggles on Enter and Space without scrolling the page', () => {
    const { props } = mount();
    const card = screen.getByRole('button', { name: /Palmeiras/ });
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(props.onToggle).toHaveBeenCalledTimes(2);
  });
});

describe('NeedCard — the buttons act, they do not toggle', () => {
  it('puts players forward without also collapsing the card', () => {
    // The card is a button and the actions sit inside it, so without
    // stopPropagation every click would close the panel you clicked from.
    const { props } = mount({ open: true });
    fireEvent.click(screen.getByText('Put 1 forward'));
    expect(props.onPutForward).toHaveBeenCalled();
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it('opens the need without also collapsing the card', () => {
    const { props } = mount({ open: true });
    fireEvent.click(screen.getByText('Open the need'));
    expect(props.onOpenNeed).toHaveBeenCalled();
    expect(props.onToggle).not.toHaveBeenCalled();
  });
});

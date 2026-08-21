// Pinned to a negative UTC offset on purpose: in UTC the naive parse and the
// correct one agree, so a UTC-only test would pass either way and prove nothing.
process.env.TZ = 'America/Sao_Paulo';

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FollowUp } from '@/hooks/useFollowUps';

/**
 * The trap this pins down is the date one.
 *
 * Due dates are stored as bare `YYYY-MM-DD`. `new Date('2026-08-21')` parses as
 * UTC midnight, which in São Paulo (UTC-3) is 21:00 on the 20th — so a reminder
 * due on the 21st would render on the 20th square, and the agent would call a
 * day late. `parseDateKey` pins the time to local midnight to stop that, and
 * this test fails if anyone reverts it.
 */

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) },
}));

import FollowUpCalendar from './FollowUpCalendar';

const reminder = (over: Partial<FollowUp> & { id: string; due_date: string }): FollowUp => ({
  target_type: 'contact',
  target_id: 't1',
  target_label: 'Someone',
  target_sublabel: null,
  contact_id: null,
  contact_name: null,
  contact_club: null,
  action_text: 'Ring them',
  completed: false,
  completed_at: null,
  created_at: '2026-08-01T00:00:00Z',
  ...over,
});

function mount(items: FollowUp[], today = '2026-08-21') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FollowUpCalendar
        items={items}
        today={today}
        onSelect={() => {}}
        onComplete={() => {}}
        onDelete={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('FollowUpCalendar', () => {
  it('opens on the month containing today', () => {
    mount([]);
    expect(screen.getByText('August 2026')).toBeTruthy();
  });

  it('lands a reminder on its own day, not the one before', () => {
    mount([reminder({ id: 'f1', due_date: '2026-08-21', target_label: 'Palmeiras' })]);
    // The selected-day strip defaults to today and carries the action text.
    expect(screen.getByText('Friday, 21 August 2026 (1)')).toBeTruthy();
    expect(screen.getAllByText('Palmeiras').length).toBeGreaterThan(0);
  });

  it('pulls overdue reminders out of the grid so a past month cannot hide them', () => {
    mount([
      reminder({ id: 'f1', due_date: '2026-05-02', target_label: 'Botafogo' }),
      reminder({ id: 'f2', due_date: '2026-08-29', target_label: 'Vasco' }),
    ]);
    const strip = screen.getByText(/Overdue \(1\)/).parentElement!;
    expect(within(strip).getByText('Botafogo')).toBeTruthy();
    expect(within(strip).queryByText('Vasco')).toBeNull();
  });

  it('does not count a completed reminder as overdue', () => {
    mount([reminder({ id: 'f1', due_date: '2026-05-02', completed: true })]);
    expect(screen.queryByText(/Overdue/)).toBeNull();
  });

  it('says so when the selected day is empty', () => {
    mount([]);
    expect(screen.getByText('Nothing due this day.')).toBeTruthy();
  });
});

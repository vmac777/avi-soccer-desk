import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ScoutedTarget } from '@/hooks/useBuyData';

/**
 * A dossier that throws takes the whole app down with it — there is no error
 * boundary on the route, so a bad field read renders a blank page rather than a
 * broken section. This mounts the page against the thinnest possible row: the
 * one an importer produces before any enrichment has run.
 */

const row = {
  id: 'p1',
  slug: 'a-player',
  name: 'A Player',
  position: 'CB',
  current_club: 'Some Club',
  league: 'Some League',
} as ScoutedTarget;

vi.mock('@/hooks/useBuyData', () => ({
  useScoutedTargets: () => ({ data: [row], isLoading: false }),
}));

vi.mock('@/components/SetReminderButton', () => ({
  default: () => <button>Set Reminder</button>,
}));

import RosterPlayerPage from './RosterPlayerPage';

function mount(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/roster/${id}`]}>
        <Routes>
          <Route path="/roster/:id" element={<RosterPlayerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RosterPlayerPage', () => {
  it('renders an unenriched row without throwing', () => {
    mount('p1');
    expect(screen.getByText('A Player')).toBeTruthy();
  });

  it('says so when the id matches nothing', () => {
    mount('nope');
    expect(screen.getByText('Player not found.')).toBeTruthy();
  });
});

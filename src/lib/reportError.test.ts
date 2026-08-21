import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A crash reporter has to hold three properties, all of which fail silently
 * when broken — which is the worst way for a thing that exists to catch silent
 * failures to break.
 */

const insert = vi.fn().mockResolvedValue({ error: null });
const getSession = vi.fn().mockResolvedValue({
  data: { session: { user: { id: 'user-1' } } },
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert }),
    auth: { getSession: () => getSession() },
  },
}));

import { reportError, __resetErrorReporterForTests } from './reportError';

beforeEach(() => {
  insert.mockClear();
  getSession.mockClear();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  __resetErrorReporterForTests();
});

describe('reportError', () => {
  it('records a thrown Error with its stack', async () => {
    await reportError(new Error('boom'), 'render', 'at <Dashboard>');
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.message).toBe('boom');
    expect(row.kind).toBe('render');
    expect(row.component_stack).toBe('at <Dashboard>');
    expect(row.user_id).toBe('user-1');
    expect(typeof row.stack).toBe('string');
  });

  it('handles things that are not Errors, because anything can be thrown', async () => {
    await reportError('just a string', 'window_error');
    expect(insert.mock.calls[0][0].message).toBe('just a string');

    __resetErrorReporterForTests();
    insert.mockClear();
    await reportError({ code: 42 }, 'unhandled_rejection');
    expect(insert.mock.calls[0][0].message).toContain('42');
  });

  it('never throws, even when the database rejects the write', async () => {
    insert.mockRejectedValueOnce(new Error('permission denied'));
    await expect(reportError(new Error('boom'), 'render')).resolves.toBeUndefined();
  });

  it('never throws when the session lookup itself fails', async () => {
    getSession.mockRejectedValueOnce(new Error('network down'));
    await expect(reportError(new Error('boom'), 'render')).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not try to write when signed out — RLS would refuse it anyway', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await reportError(new Error('boom'), 'render');
    expect(insert).not.toHaveBeenCalled();
  });

  it('suppresses a repeat of the same message inside the dedupe window', async () => {
    await reportError(new Error('same'), 'render');
    await reportError(new Error('same'), 'render');
    await reportError(new Error('same'), 'render');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('still reports a different message', async () => {
    await reportError(new Error('first'), 'render');
    await reportError(new Error('second'), 'render');
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('caps a render loop instead of writing until the database stops it', async () => {
    // Distinct messages, so dedupe cannot be what stops it.
    for (let i = 0; i < 50; i++) {
      await reportError(new Error(`crash ${i}`), 'render');
    }
    expect(insert).toHaveBeenCalledTimes(20);
  });

  it('truncates a stack rather than posting kilobytes of it', async () => {
    const huge = new Error('big');
    huge.stack = 'x'.repeat(10_000);
    await reportError(huge, 'render');
    const row = insert.mock.calls[0][0];
    expect(row.stack.length).toBeLessThan(4_100);
    expect(row.stack).toContain('truncated');
  });

  it('records the path but never the query string', async () => {
    // Contact ids and search terms live in the query string.
    window.history.replaceState({}, '', '/contacts?selected=abc-123&q=palmeiras');
    await reportError(new Error('boom'), 'render');
    const row = insert.mock.calls[0][0];
    expect(row.route).toBe('/contacts');
    expect(row.route).not.toContain('abc-123');
    expect(row.route).not.toContain('palmeiras');
  });
});

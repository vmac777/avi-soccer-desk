import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withDeployRetry } from './lazyRoute';

/**
 * A tab left open across a deploy asks for a chunk filename the new build no
 * longer has, and the route dies with "Failed to fetch dynamically imported
 * module" — which reads as the platform being down when the page is merely out
 * of date. Reloading fixes it.
 *
 * The loop guard is the part that has to be right. Reload on every failure and
 * a genuinely broken deploy refreshes the tab forever, which is worse than the
 * error it was hiding.
 */

const reload = vi.fn();

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  // A Location's properties are accessors on the prototype, so spreading it
  // copies nothing. That is fine — `reload` is all this needs — but it means
  // the stub is not a working Location for anything else.
  vi.stubGlobal('location', { reload });
});

/**
 * Did the promise settle, or is it still pending?
 *
 * Racing against an already-resolved promise would be vacuous: the resolved one
 * always wins and the assertion passes either way. A real timer is the only way
 * to give the subject a chance to settle first.
 */
const settleState = (p: Promise<unknown>) =>
  Promise.race([
    p.then(() => 'settled' as const).catch(() => 'rejected' as const),
    new Promise<'pending'>((r) => setTimeout(() => r('pending'), 20)),
  ]);

/** Let the microtask queue drain — the retry runs in an async catch. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('withDeployRetry', () => {
  it('passes a working import straight through', async () => {
    const mod = { default: 'Page' };
    await expect(withDeployRetry(async () => mod)()).resolves.toBe(mod);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when a chunk has gone missing', async () => {
    const load = vi.fn().mockRejectedValue(new Error('Failed to fetch dynamically imported module'));

    const result = withDeployRetry(load)();
    await tick();

    expect(reload).toHaveBeenCalledTimes(1);
    // Deliberately never settles: resolving with a placeholder would flash a
    // wrong page on the way out, and the reload is about to take over anyway.
    await expect(settleState(result)).resolves.toBe('pending');
  });

  it('does not reload twice — a broken deploy must surface, not loop', async () => {
    const boom = new Error('Failed to fetch dynamically imported module');
    const load = vi.fn().mockRejectedValue(boom);

    withDeployRetry(load)();
    await tick();
    expect(reload).toHaveBeenCalledTimes(1);

    // The reload happened; the tab came back and the chunk is still missing.
    // The handler goes on synchronously: `tick()` is a setTimeout, so Node
    // fires unhandledRejection at that macrotask boundary and attaching a
    // handler afterwards is too late — vitest then exits non-zero with every
    // test still reported green.
    const caught = withDeployRetry(load)().catch((e) => e);
    await tick();

    // Count first. A version without the guard reloads again here and returns
    // another never-settling promise, so awaiting first would fail by timeout —
    // five seconds and no clue why.
    expect(reload).toHaveBeenCalledTimes(1);
    await expect(caught).resolves.toBe(boom);
  });

  it('re-arms after a successful load, so the next deploy can reload too', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('gone'));

    withDeployRetry(failing)();
    await tick();
    expect(reload).toHaveBeenCalledTimes(1);

    await withDeployRetry(async () => ({ default: 'Page' }))();

    withDeployRetry(failing)();
    await tick();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('still loads when sessionStorage throws', async () => {
    // Private modes and blocked site-data make the accessor itself throw. That
    // must not take the route down with it.
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const mod = { default: 'Page' };
    await expect(withDeployRetry(async () => mod)()).resolves.toBe(mod);

    getSpy.mockRestore();
    setSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

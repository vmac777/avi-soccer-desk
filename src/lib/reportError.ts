import { supabase } from '@/integrations/supabase/client';

/**
 * Records a front-end crash so somebody other than the user finds out about it.
 *
 * There was no error reporting at all. The blank player page was discovered by
 * screenshot; a silent rollback on a rejected write looked like a dead button
 * for two commits. Both were visible in a console nobody had open.
 *
 * Three rules govern everything here, because a reporter that misbehaves is
 * worse than none:
 *
 *  1. It never throws. A failure to report an error must not become an error.
 *  2. It never recurses. Reporting is the one place a thrown exception cannot
 *     be reported, so its own failures die in a catch.
 *  3. It is bounded. A render loop throwing every frame would otherwise write
 *     until the database says stop.
 */

export type ErrorKind = 'render' | 'unhandled_rejection' | 'window_error';

/**
 * Most reports in a session. A real session produces a handful; anything past
 * this is a loop, and the first few already carry the same information.
 */
const MAX_PER_SESSION = 20;

/** How long the same message stays suppressed after being reported. */
const DEDUPE_WINDOW_MS = 60_000;

let sent = 0;
const lastSeen = new Map<string, number>();

/** Stacks can run to kilobytes; the top of one identifies the bug. */
const MAX_STACK = 4_000;
const MAX_MESSAGE = 1_000;

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) + '\n…truncated' : value;
}

/** Whatever was thrown, as a message and a stack. Anything can be thrown. */
function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message || error.name || 'Unknown error', stack: error.stack ?? null };
  }
  if (typeof error === 'string') return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

export async function reportError(
  error: unknown,
  kind: ErrorKind,
  componentStack?: string | null,
): Promise<void> {
  try {
    const { message, stack } = describe(error);

    if (sent >= MAX_PER_SESSION) return;

    const now = Date.now();
    const previous = lastSeen.get(message);
    if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return;
    lastSeen.set(message, now);

    // Unauthenticated writes are refused by RLS, and pre-login is exactly when
    // the console is the only record. Checking first avoids a pointless round
    // trip and a confusing 401 in the network tab.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.error('[unreported: signed out]', error);
      return;
    }

    sent++;

    await supabase.from('client_errors').insert({
      user_id: session.user.id,
      kind,
      message: truncate(message, MAX_MESSAGE)!,
      stack: truncate(stack, MAX_STACK),
      component_stack: truncate(componentStack, MAX_STACK),
      // Path only. The query string carries contact ids and search terms.
      route: window.location.pathname,
      user_agent: navigator.userAgent.slice(0, 500),
    });
  } catch {
    // Rule 1. Nothing here may escape.
  }
}

let installed = false;

/**
 * Catches what React cannot.
 *
 * The error boundary only sees exceptions thrown during render. A rejected
 * promise in an event handler — a failed save, an enrichment that 403s — never
 * reaches it, and those are the ones that look like nothing happened.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('unhandledrejection', (event) => {
    void reportError(event.reason, 'unhandled_rejection');
  });

  window.addEventListener('error', (event) => {
    // Failed <img>/<script> loads also fire this, on the element rather than
    // the window. They are not crashes.
    if (event.error == null && !event.message) return;
    void reportError(event.error ?? event.message, 'window_error');
  });
}

/** Test seam: the module-level counters would otherwise leak between cases. */
export function __resetErrorReporterForTests(): void {
  sent = 0;
  lastSeen.clear();
  installed = false;
}

import { useEffect, useRef, useState } from 'react';

/**
 * Whether the viewer asked us to stop moving things.
 *
 * Read live rather than once: someone can change the setting with the tab
 * open, and an animation that keeps running after they turned it off is the
 * exact complaint the setting exists to make.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

const DURATION_MS = 1100;
/** Ease-out cubic: fast at the start, so the number is legible almost at once. */
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Count a number up from zero when it lands.
 *
 * The number is the point and the motion is decoration, so the motion never
 * gets to hide it: with reduced motion on, and on the very first paint, the
 * final value renders immediately. A target that changes mid-flight (a query
 * resolving after the first render) restarts from where the eye already is
 * rather than snapping back to zero.
 */
export function useCountUp(target: number): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduced) { setValue(target); return; }

    const from = fromRef.current;
    if (from === target) { setValue(target); return; }

    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / DURATION_MS);
      const next = Math.round(from + (target - from) * ease(t));
      setValue(next);
      fromRef.current = next;
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);

  return value;
}

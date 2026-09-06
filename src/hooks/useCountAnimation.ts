import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

// Premium number interpolation: calm, not ticking through dozens of values.
// Duration adapts to delta: small changes 300ms, large 550ms.
export function useCountAnimation(targetMinor: number, opts?: { duration?: number; currency?: string }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(targetMinor);
  const fromRef = useRef(targetMinor);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setDisplay(targetMinor);
      fromRef.current = targetMinor;
      return;
    }
    const from = fromRef.current;
    if (from === targetMinor) return;
    const delta = Math.abs(targetMinor - from);
    // Avoid long count-through: clamp duration, ease-out.
    const duration = opts?.duration ?? (delta > 500000 ? 550 : delta > 100000 ? 420 : 320);
    const start = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / duration);
      const eased = easeOut(p);
      setDisplay(Math.round(from + (targetMinor - from) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = targetMinor;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetMinor, reduced, opts?.duration]);

  // Keep from in sync after mount
  useEffect(() => {
    fromRef.current = display;
  }, []);

  return display;
}

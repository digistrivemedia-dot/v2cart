import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal data-fetch hook: `{ data, loading, error, refetch }`.
 *
 * The app has no React Query (axios + zustand was the brief), and every
 * screen needs the same four states. Writing that by hand per screen is how
 * you end up with a screen that forgets its error branch.
 *
 * Guards against setting state after unmount, and against a slow earlier
 * request landing after a newer one — both of which show up as "wrong data
 * briefly appears" bugs on real devices.
 */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      // Ignore everything but the newest request.
      if (mounted.current && id === requestId.current) setData(result);
      return result;
    } catch (err) {
      if (mounted.current && id === requestId.current) setError(err.message || 'Something went wrong');
      return null;
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, immediate]);

  return { data, loading, error, refetch: run, setData };
}

/** Delays a fast-changing value — used by the search box. */
export function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

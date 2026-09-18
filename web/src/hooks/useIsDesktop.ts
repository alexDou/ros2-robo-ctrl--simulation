import { useState, useEffect } from 'preact/hooks';

/**
 * Responsive viewport detection hook.
 *
 * Defaults to desktop layout (true) in SSR or non-browser environments.
 * Listens to matchMedia queries and window resize events.
 */
export function useIsDesktop(breakpoint = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== 'undefined') {
      if (typeof window.matchMedia === 'function') {
        return window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
      }
      if (typeof window.innerWidth === 'number') {
        return window.innerWidth >= breakpoint;
      }
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setIsDesktop(window.innerWidth >= breakpoint);
    };

    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia(`(min-width: ${breakpoint}px)`);
      setIsDesktop(mql.matches);
      const handleChange = (e: MediaQueryListEvent) => {
        setIsDesktop(e.matches);
      };
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handleChange);
      }
      window.addEventListener('resize', handleResize);
      return () => {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', handleChange);
        }
        window.removeEventListener('resize', handleResize);
      };
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isDesktop;
}

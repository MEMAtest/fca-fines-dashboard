import { useCallback, useState } from 'react';

const STORAGE_KEY = 'fca-homepage-visited';

export function useHomepageVisit() {
  const [hasVisitedHomepage, setHasVisitedHomepage] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const markHomepageVisited = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true');
      setHasVisitedHomepage(true);
    } catch {
      // Storage failed (e.g., incognito mode with storage disabled)
      // Still update state for current session
      setHasVisitedHomepage(true);
    }
  }, []);

  const clearHomepageVisit = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setHasVisitedHomepage(false);
    } catch {
      setHasVisitedHomepage(false);
    }
  }, []);

  return {
    hasVisitedHomepage,
    markHomepageVisited,
    clearHomepageVisit,
  };
}

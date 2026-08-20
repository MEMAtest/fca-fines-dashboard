import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Resets scroll position on in-app navigation.
 *
 * React Router does not do this: the browser only restores scroll on real
 * document loads, so a client-side route change leaves the window wherever it
 * was. Following a link from the footer — "Popular country risk reports" is the
 * worst case — loaded the new page already scrolled to the bottom, with the
 * report's own heading far above the viewport.
 *
 * Only resets on PUSH/REPLACE. POP is back/forward, where the browser's own
 * restoration is the correct behaviour and overriding it loses the reader's
 * place in a long country report.
 *
 * Hash links are left alone so in-page anchors still work.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    const samePage = previousPathname.current === pathname;
    previousPathname.current = pathname;

    if (navigationType === "POP") return;
    if (hash) return;
    // A query-string-only change (filter/tab state) is not a new page.
    if (samePage) return;

    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash, navigationType]);

  return null;
}

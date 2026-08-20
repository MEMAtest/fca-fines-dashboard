import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { ScrollToTop } from "./ScrollToTop.js";

const scrollTo = vi.fn();

beforeEach(() => {
  scrollTo.mockReset();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});

/** Drives a client-side navigation once, on mount. */
function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}

function renderAt(initial: string, children: React.ReactNode = null) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <ScrollToTop />
      <Routes>
        <Route path="*" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ScrollToTop", () => {
  it("does not scroll on first render", () => {
    // The browser has already positioned a fresh document load.
    renderAt("/countries/united-states");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls to top when navigating to a new page", () => {
    renderAt("/countries", <Navigate to="/countries/united-kingdom" />);
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0, left: 0 }),
    );
  });

  it("does not scroll when only the query string changes", () => {
    // Filter and tab state live in the query string; resetting scroll there
    // would yank the user away from the control they just used.
    renderAt("/countries?tab=ratings", <Navigate to="/countries?tab=map" />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("leaves in-page anchors alone", () => {
    renderAt("/countries/laos", <Navigate to="/countries/laos#methodology" />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls on replace navigations", () => {
    renderAt("/countries", <Navigate to="/countries/oman" replace />);
    expect(scrollTo).toHaveBeenCalled();
  });
});

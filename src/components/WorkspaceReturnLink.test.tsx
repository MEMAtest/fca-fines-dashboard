import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkspaceReturnLink } from "./WorkspaceReturnLink.js";

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <WorkspaceReturnLink />
    </MemoryRouter>,
  );
}

describe("WorkspaceReturnLink", () => {
  it("renders a back link to the originating workspace", () => {
    renderAt("/regulators?from=%2Ffines%2Fanalytics&fromLabel=Fines+workspace");

    const link = screen.getByRole("link", { name: /Back to Fines workspace/i });
    expect(link).toHaveAttribute("href", "/fines/analytics");
  });

  it("preserves the query string of the originating view", () => {
    renderAt(
      "/methodology/enforcement?from=%2Ffines%2Fanalytics%3Fyear%3D2025&fromLabel=Fines+workspace",
    );

    expect(
      screen.getByRole("link", { name: /Back to Fines workspace/i }),
    ).toHaveAttribute("href", "/fines/analytics?year=2025");
  });

  it("renders nothing when the page was reached directly", () => {
    // These pages are also entry points from marketing surfaces, where there is
    // no workspace to go back to.
    const { container } = renderAt("/regulators");
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to a generic label when only `from` is supplied", () => {
    renderAt("/regulators?from=%2Ffines");
    expect(
      screen.getByRole("link", { name: /Back to previous workspace/i }),
    ).toHaveAttribute("href", "/fines");
  });

  it("refuses off-site return targets", () => {
    // `from` is attacker-controllable via a crafted link, so a protocol-relative
    // or absolute URL must not become an outbound redirect.
    for (const hostile of [
      "//evil.example",
      "https%3A%2F%2Fevil.example",
      "javascript%3Aalert(1)",
    ]) {
      const { container, unmount } = renderAt(
        `/regulators?from=${hostile}&fromLabel=Fines+workspace`,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

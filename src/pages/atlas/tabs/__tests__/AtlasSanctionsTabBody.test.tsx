import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AtlasSanctionsTabBody } from "../AtlasSanctionsTabBody.js";

function stubFetch(responseBody: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => responseBody }));
}

beforeEach(() => {
  stubFetch({ events: [], staleness: [], euNotIngested: null });
});

describe("AtlasSanctionsTabBody", () => {
  it("renders FATF black-list status with a required action for a listed country (KP)", () => {
    render(<AtlasSanctionsTabBody iso2="KP" />);
    expect(screen.getByText(/Black list/)).toBeInTheDocument();
  });

  it("renders the honest empty state when no change-log events exist for a quiet country", () => {
    render(<AtlasSanctionsTabBody iso2="LI" />);
    expect(screen.getByText(/No dated changes recorded since/)).toBeInTheDocument();
  });

  it("never claims a listed country is unsanctioned (no bare absence-as-clean copy)", () => {
    render(<AtlasSanctionsTabBody iso2="XX" />);
    expect(screen.queryByText(/Not enough information/)).not.toBeInTheDocument();
  });

  it("shows a 'stale since <date>' banner when the API reports a stale lane", async () => {
    stubFetch({
      events: [],
      staleness: [
        { lane: "sanctions", isStale: true, staleSince: "2026-09-29T12:00:00.000Z", lastSuccessAt: "2026-09-27T12:00:00.000Z" },
        { lane: "fatf", isStale: false, staleSince: null, lastSuccessAt: "2026-10-01T00:00:00.000Z" },
      ],
      euNotIngested: null,
    });
    render(<AtlasSanctionsTabBody iso2="GB" />);
    const banner = await waitFor(() => screen.getByTestId("atlas-sanctions-stale-banner"));
    expect(banner.textContent).toContain("Sanctions data");
    expect(banner.textContent).toContain("stale since");
    expect(banner.textContent).toContain("2026-09-29");
    // The healthy FATF lane must not also render a stale message.
    expect(banner.textContent).not.toContain("FATF data");
  });

  it("does not show a stale banner when every lane is within budget", async () => {
    stubFetch({
      events: [],
      staleness: [
        { lane: "sanctions", isStale: false, staleSince: null, lastSuccessAt: "2026-10-03T00:00:00.000Z" },
        { lane: "fatf", isStale: false, staleSince: null, lastSuccessAt: "2026-10-01T00:00:00.000Z" },
      ],
      euNotIngested: null,
    });
    render(<AtlasSanctionsTabBody iso2="GB" />);
    await waitFor(() => expect(screen.queryByTestId("atlas-sanctions-stale-banner")).not.toBeInTheDocument());
  });

  it("shows the 'EU list not ingested' note with evidence, never implying no EU sanctions", async () => {
    stubFetch({
      events: [],
      staleness: [],
      euNotIngested: { evidence: "No XML distribution found; available formats: CSV, HTML" },
    });
    render(<AtlasSanctionsTabBody iso2="RU" />);
    const note = await waitFor(() => screen.getByTestId("atlas-sanctions-eu-note"));
    expect(note.textContent).toContain("EU list not ingested");
    expect(note.textContent).toContain("No XML distribution found");
    expect(note.textContent).not.toMatch(/no EU sanctions apply|not sanctioned by the EU/i);
  });
});

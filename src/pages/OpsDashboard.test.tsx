import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpsDashboard } from "./OpsDashboard.js";

const summary = {
  generatedAt: "2026-07-18T12:00:00.000Z",
  status: "warning",
  sections: {
    sources: { status: "warning", metrics: { verifiedPercentage: 96.2, needsReview: 2, overdue: 1, criticalFailures: 0 }, regulators: [{ regulator: "FCA", cases: 2, needsReview: 2, overdue: 1, maxFailures: 1 }] },
    scrapers: { status: "healthy", metrics: { quarantined: 0, stale: 0, uncontracted: 0, missingRuns: 0 }, regulators: [] },
    monitors: { status: "healthy", metrics: { active: 3, pending_verification: 0, recent_failures: 0, active_without_baseline: 0 } },
    boardPack: { status: "healthy", metrics: { sent_last_24_hours: 1, pending: 0, overdue: 0, failed: 0 } },
    funnel: { status: "healthy", days: 30, events: [{ event_name: "evidence_opened", event_count: 12 }] },
  },
  configuration: { sourceCron: true, monitorMail: true, boardPackMail: true, opsAlerts: false },
};

describe("operations dashboard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows the protected credential form for an unauthorised session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    render(<OpsDashboard/>);
    expect(await screen.findByRole("heading", { name: "Operations control room" })).toBeInTheDocument();
    expect(screen.getByLabelText("Operations credential")).toHaveAttribute("type", "password");
  });

  it("renders trust, delivery and funnel signals without customer data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => summary })));
    render(<OpsDashboard/>);
    expect(await screen.findByRole("heading", { name: "Control room" })).toBeInTheDocument();
    expect(screen.getByText("Official sources")).toBeInTheDocument();
    expect(screen.getByText("Evidence monitors")).toBeInTheDocument();
    expect(screen.getByText("evidence opened")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("creates a session then reloads the protected summary", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => summary });
    vi.stubGlobal("fetch", fetchMock);
    render(<OpsDashboard/>);
    fireEvent.change(await screen.findByLabelText("Operations credential"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Open control room" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Control room" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

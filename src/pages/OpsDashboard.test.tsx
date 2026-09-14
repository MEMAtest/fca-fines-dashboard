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

const apiOperations = {
  generatedAt: "2026-09-14T12:00:00.000Z",
  days: 7,
  configuration: { operatorMail: true, explicitRecipient: true, abuseFingerprinting: true },
  metrics: { pending_applications: 1, active_clients: 1, active_keys: 1, used_keys: 1, accepted_requests: 42, denied_requests: 2, rate_limited_requests: 1 },
  applications: [{ id: 1, organisationName: "Veravant Assurance Ltd", contactName: "George Petrakis", contactEmail: "gp@example.test", intendedUse: "Internal AML risk assessments", expectedDailyRequests: 100, requestedTermMonths: 6, status: "pending", termsAccepted: true, createdAt: "2026-09-14T10:00:00.000Z" }],
  keys: [{ id: 7, label: "Production", keyPrefix: "ra_live_1234", keyStatus: "active", minuteLimit: 60, dailyLimit: 10000, expiresAt: "2027-03-14T00:00:00.000Z", lastUsedAt: "2026-09-14T11:00:00.000Z", createdAt: "2026-09-14T10:00:00.000Z", clientId: 1, organisationName: "Veravant Assurance Ltd", contactName: "George Petrakis", contactEmail: "gp@example.test", clientStatus: "active", requests: 42, denied: 2 }],
  endpoints: [{ path: "/api/country-risk/CY", requests: 42, accepted: 40, denied: 2 }],
  notifications: [{ id: 3, kind: "first_use", status: "sent", subject: "RegActions API: key used for the first time", attemptedAt: "2026-09-14T11:00:00.000Z", sentAt: "2026-09-14T11:00:01.000Z", error: null }],
};

function readyFetch() {
  return vi.fn(async (input: string | URL | Request) => String(input).includes("developer-api")
    ? { ok: true, status: 200, json: async () => apiOperations }
    : { ok: true, status: 200, json: async () => summary });
}

describe("operations dashboard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows the protected credential form for an unauthorised session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    render(<OpsDashboard/>);
    expect(await screen.findByRole("heading", { name: "Operations control room" })).toBeInTheDocument();
    expect(screen.getByLabelText("Operations credential")).toHaveAttribute("type", "password");
  });

  it("renders trust, delivery, funnel and protected API signals", async () => {
    vi.stubGlobal("fetch", readyFetch());
    render(<OpsDashboard/>);
    expect(await screen.findByRole("heading", { name: "Control room" })).toBeInTheDocument();
    expect(screen.getByText("Official sources")).toBeInTheDocument();
    expect(screen.getByText("Evidence monitors")).toBeInTheDocument();
    expect(screen.getByText("evidence opened")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Applications, keys and usage" })).toBeInTheDocument();
    expect(screen.getAllByText("Veravant Assurance Ltd")).toHaveLength(2);
    expect(screen.getByText("ra_live_1234… · 60/min · 10,000/day")).toBeInTheDocument();
  });

  it("creates a session then reloads the protected summary", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => summary })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => apiOperations });
    vi.stubGlobal("fetch", fetchMock);
    render(<OpsDashboard/>);
    fireEvent.change(await screen.findByLabelText("Operations credential"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Open control room" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Control room" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

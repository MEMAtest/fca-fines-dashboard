import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOARD_PROFILE } from "../data/boardIntelligence.js";
import { buildBoardPack } from "../utils/boardIntelligence.js";
import { useBoardPackEvidence } from "../hooks/useBoardPackEvidence.js";
import { BoardIntelligence } from "./BoardIntelligence.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));
const evidenceState = vi.hoisted(() => ({ pack: null as any, totalConsidered: 1, methodologyVersion: "board-pack-evidence-v1", analysisDate: "2026-10-17T00:00:00.000Z", loading: false, error: null as string | null, controlEvidenceAvailable: true, selectedCaseResolutions: [] as Array<{ requestedId: string; canonicalCaseId: string }> }));
vi.mock("../hooks/useBoardPackEvidence.js", () => ({ useBoardPackEvidence: vi.fn(() => evidenceState) }));

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

function renderPage(initialEntry = "/board-pack") {
  return render(<MemoryRouter initialEntries={[initialEntry]}><BoardIntelligence /></MemoryRouter>);
}

describe("BoardIntelligence quick pack", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { value: createLocalStorageMock(), configurable: true });
    evidenceState.pack = buildBoardPack([{
      id: "1", canonical_case_id: "1", fine_reference: "FCA-1", firm_individual: "NorthBridge Wealth Ltd",
      firm_category: "Payments", regulator: "FCA", regulator_full_name: "Financial Conduct Authority",
      final_notice_url: "https://example.com/notice", summary: "The firm failed to maintain effective transaction monitoring and senior manager oversight.",
      breach_type: "AML controls", breach_categories: ["AML", "Governance"], amount: 32_000_000,
      date_issued: "2025-06-10", year_issued: 2025, month_issued: 6, country_code: "GB", country_name: "United Kingdom",
      source_link_status: "verified_detail",
    }], DEFAULT_BOARD_PROFILE);
    evidenceState.loading = false;
    evidenceState.error = null;
    evidenceState.selectedCaseResolutions = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("renders a no-account builder without the old NorthStar profile toolbar", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Create a committee-ready enforcement brief/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Build your pack/i })).toBeInTheDocument();
    expect(screen.queryByText(/Active profile/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/NorthStar Compliance Profile/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No account is required/i)).toBeInTheDocument();
  });

  it("updates the live preview as the organisation changes", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Organisation name/i), { target: { value: "Acme Payments Ltd" } });
    expect(screen.getAllByRole("heading", { name: "Acme Payments Ltd" }).length).toBeGreaterThan(0);
  });

  it("keeps contact details optional while exposing direct PDF download", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Organisation name/i), { target: { value: "Acme Payments Ltd" } });
    expect(screen.getByRole("button", { name: /^Download PDF$/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/No account is required/i)).toBeInTheDocument();
  });

  it("supports explicit region selection", () => {
    renderPage();
    const apac = screen.getByRole("button", { name: "APAC" });
    fireEvent.click(apac);
    expect(apac).toHaveClass("is-selected");
  });

  it("exposes African and Latin American regions and searches every live regulator", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Africa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Latin America" })).toBeInTheDocument();
    const search = screen.getByLabelText(/Search live regulators/i);
    fireEvent.change(search, { target: { value: "CBN" } });
    expect(screen.getByRole("button", { name: "CBN" })).toBeInTheDocument();
  });

  it("stores committee action notes and comparison snapshots outside the draft/share schema", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Committee decision notes"), { target: { value: "Approved quarterly review." } });
    const owner = screen.getAllByPlaceholderText("Role or name")[0];
    fireEvent.change(owner, { target: { value: "Chief Risk Officer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save current pack as comparison baseline" }));
    expect(window.localStorage.getItem("regactions-board-pack-decision-notes-v1")).toBe('"Approved quarterly review."');
    expect(window.localStorage.getItem("regactions-board-pack-actions-v1")).toContain("Chief Risk Officer");
    expect(window.localStorage.getItem("regactions-board-pack-comparison-v1")).toContain('"relevantActionCount"');
    expect(screen.getByText(/Same scope — current:/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Africa" }));
    expect(screen.getByText(/Scope differs/i)).toBeInTheDocument();
  });

  it("disables PDF download while evidence loads and after evidence errors", () => {
    evidenceState.loading = true;
    const { rerender } = renderPage();
    expect(screen.getByRole("button", { name: /^Download PDF$/i })).toBeDisabled();
    evidenceState.loading = false;
    evidenceState.error = "request failed";
    rerender(<MemoryRouter initialEntries={["/board-pack"]}><BoardIntelligence /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /^Download PDF$/i })).toBeDisabled();
  });

  it("keeps readiness unassessed until every optional control response is supplied", () => {
    renderPage();
    expect(screen.getAllByText("Unassessed").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Add control evidence" }));
    const controlSelectors = screen.getAllByRole("combobox", { name: /Control status for/i });
    expect(controlSelectors.length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`0 of ${controlSelectors.length} controls assessed`, "i")).length).toBeGreaterThan(0);
    controlSelectors.forEach((select) => fireEvent.change(select, { target: { value: "evidenced" } }));
    expect(screen.getAllByText(new RegExp(`${controlSelectors.length} of ${controlSelectors.length} controls assessed`, "i")).length).toBeGreaterThan(0);
  });

  it("shows evidence selected elsewhere as a distinct Board Pack section", () => {
    evidenceState.pack.selectedCases = [{
      id: "public-case-hash", firm: "Selected Payments Ltd", regulator: "FCA", amount: 1_000_000,
      dateIssued: "2025-03-04", summary: "Selected public case", breachType: "AML controls", matchedThemes: ["aml-controls"],
      reason: "User selected evidence", sourceUrl: "https://www.fca.org.uk/news/example", sourceStatus: "official_unverified",
      amountQuality: undefined, requiresAmountReview: false,
      controlMatches: [{ code: "AML_CASH_CONTROLS", label: "AML cash controls", basis: "official_passage", passage: "Current database passage; exact respondent and source verified.", sourceUrl: "https://www.fca.org.uk/news/example", contentHash: "sha256:current", locator: "paragraph 8", respondent: "Selected Payments Ltd", attributionMethod: "exact_respondent", date: "2025-03-05T00:00:00.000Z" }],
    }];
    window.localStorage.setItem("regactions-evidence-basket-v1", JSON.stringify([{
      id: "case-selected-1",
      entity: "Selected Payments Ltd",
      regulator: "FCA",
      dateIssued: "2025-03-04",
      amount: 1_000_000,
      currency: "GBP",
      breachType: "AML controls",
      categories: ["AML"],
      summary: "Selected public case",
      sourceStatus: "official_unverified",
      sourceLabel: "Official source requires verification",
      directSourceUrl: "https://www.fca.org.uk/news/example",
      listingSourceUrl: null,
      surface: "enforcement_search",
      controlMatches: [{ code: "AML_CASH_CONTROLS", label: "AML cash controls", basis: "official_passage", passage: "Old browser passage; stale identity/source.", sourceUrl: "https://old.example/source", contentHash: "sha256:old", locator: "paragraph 8", respondent: "Former Respondent", attributionMethod: "exact_respondent", date: "2025-03-05T00:00:00.000Z" }],
    }]));
    evidenceState.selectedCaseResolutions = [{ requestedId: "case-selected-1", canonicalCaseId: "public-case-hash" }];
    renderPage();
    const lastEvidenceCall = vi.mocked(useBoardPackEvidence).mock.calls;
    expect(lastEvidenceCall[lastEvidenceCall.length - 1]?.[1]).toEqual(["case-selected-1"]);
    expect(screen.getByText("1", { selector: ".board-quick__basket-summary strong" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cases selected for this pack" })).toBeInTheDocument();
    expect(screen.getAllByText(/FCA: Selected Payments Ltd/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Current database passage; exact respondent and source verified/i)).toBeInTheDocument();
    expect(screen.queryByText(/Old browser passage/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open official passage source" })).toHaveAttribute("href", "https://www.fca.org.uk/news/example");
    expect(screen.queryByRole("alert", { name: /Selected case needs attention/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create and download pack" })).toBeEnabled();
  });

  it("blocks export and lets the user remove a selected ID that no longer resolves", async () => {
    window.localStorage.setItem("regactions-evidence-basket-v1", JSON.stringify([{
      id: "stale-suppressed-id", entity: "Old Fixture Firm", regulator: "FSCA", dateIssued: "2025-01-01",
      amount: null, currency: "ZAR", breachType: "AML", categories: ["AML"], summary: "Old fixture",
      sourceStatus: "official_unverified", sourceLabel: "Requires verification", directSourceUrl: null,
      listingSourceUrl: null, surface: "enforcement_search",
    }]));
    evidenceState.selectedCaseResolutions = [];
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(/remove it below or reopen the case and add it again/i);
    expect(screen.getByRole("button", { name: "Create and download pack" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByText(/Selected case needs attention/i)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Create and download pack" })).toBeEnabled();
  });

  it("opens a privacy-aware optional advisory form", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Organisation name/i), { target: { value: "Acme Payments Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: /Request tailored support/i }));
    expect(screen.getByRole("heading", { name: /Request tailored board advisory/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Your name/i)).toBeRequired();
    expect(screen.getByLabelText(/Work email/i)).toBeRequired();
    expect(screen.getByLabelText("Organisation", { exact: true })).toHaveValue("Acme Payments Ltd");
    expect(screen.getByText(/This is optional/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
  });

  it("returns users to the workspace that opened the builder", () => {
    renderPage("/board-pack?from=%2Fregulators%2Ffca%2Fanalytics&fromLabel=FCA+workspace");
    expect(screen.getByRole("link", { name: /Back to FCA workspace/i })).toHaveAttribute(
      "href",
      "/regulators/fca/analytics",
    );
  });

  it("saves the current revision before creating an immutable share", async () => {
    vi.stubEnv("VITE_BOARD_PACK_PERSISTENCE_ENABLED", "true");
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({
        url,
        method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (url === "/api/board-pack/packs") {
        return new Response(JSON.stringify({
          id: "9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0",
          ownerToken: "O".repeat(43),
          revision: 1,
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/shares")) {
        return new Response(JSON.stringify({
          id: "8f3bd8b4-6cb0-4d31-b632-d33f28ff0dd1",
          shareToken: "S".repeat(43),
          shareUrl: `/board-pack/shared/${"S".repeat(43)}`,
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Unexpected request" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }));

    renderPage();
    fireEvent.change(screen.getByLabelText(/Organisation name/i), {
      target: { value: "Current revision firm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create read-only share" }));

    await waitFor(() => {
      expect(requests.filter(({ url, method }) =>
        url.startsWith("/api/board-pack/") && method !== "GET",
      ).map(({ url, method }) => ({ url, method }))).toEqual([
        { url: "/api/board-pack/packs", method: "POST" },
        {
          url: "/api/board-pack/packs/9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0/shares",
          method: "POST",
        },
      ]);
    });
    const savedPayload = JSON.parse(
      requests.find(({ url, method }) =>
        url === "/api/board-pack/packs" && method === "POST",
      )?.body ?? "{}",
    );
    expect(savedPayload.firmProfile.firmName).toBe("Current revision firm");
    expect(screen.getByRole("link", { name: "Open shared snapshot" }).getAttribute("href"))
      .toMatch(new RegExp(`/board-pack/shared/${"S".repeat(43)}$`));
  });
});

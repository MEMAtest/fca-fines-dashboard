import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FcaFineCaseRequestError,
  fetchFcaFineCase,
} from "../api.js";
import { EvidenceModalProvider } from "../components/EvidenceModalProvider.js";
import type { FcaFineCaseRecord } from "../types.js";
import { FcaFineCase } from "./FcaFineCase.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));
vi.mock("../api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api.js")>();
  return { ...actual, fetchFcaFineCase: vi.fn() };
});

const CASE_ID = "4cbe8dbf-7d2e-48f5-a472-9a04a83bf12a";

const record: FcaFineCaseRecord = {
  caseId: CASE_ID,
  canonicalPath: `/fca-fines/2025/alpha-bank-plc/${CASE_ID}`,
  regulator: "FCA",
  firm: "Alpha Bank plc",
  firmSlug: "alpha-bank-plc",
  amount: 12_000_000,
  dateIssued: "2025-06-10",
  year: 2025,
  month: 6,
  summary: "The firm failed to maintain effective anti-money laundering controls.",
  breach: "AML controls",
  categories: ["AML", "Governance"],
  sourceUrl: "https://www.fca.org.uk/news/search-results",
  noticeUrl: "https://www.fca.org.uk/news/news-stories/alpha-bank",
  listingSourceUrl: "https://www.fca.org.uk/news/search-results",
  resolvedSourceUrl: "https://www.fca.org.uk/news/news-stories/alpha-bank",
  sourceStatus: "verified_detail",
  sourceCheckedAt: "2026-07-20T09:00:00.000Z",
  sourceHttpStatus: 200,
  sourceOfficialDomainMatch: true,
  sourceContentHash: "sha256-example",
  sourceLastVerifiedAt: "2026-07-20T09:00:00.000Z",
  sourceNextCheckAt: "2026-07-27T09:00:00.000Z",
  sourceConsecutiveFailures: 0,
  sourceReviewStatus: "verified",
  sourceReviewReason: null,
  amountQuality: "verified",
  requiresAmountReview: false,
  amountVerificationUrl: null,
  amountOverrideReason: null,
  duplicateCount: 1,
  createdAt: "2025-06-11T00:00:00.000Z",
  quality: {
    indexable: true,
    reasons: [],
    warnings: [],
    summaryWordCount: 10,
    evidenceStrength: "verified",
  },
  relatedCases: [{
    caseId: "1d98738d-17cd-4730-919c-27b3464a4a86",
    canonicalPath: "/fca-fines/2023/alpha-bank-plc/1d98738d-17cd-4730-919c-27b3464a4a86",
    firm: "Alpha Bank plc",
    firmSlug: "alpha-bank-plc",
    amount: 2_500_000,
    dateIssued: "2023-04-14",
    year: 2023,
    breach: "Systems and controls",
    categories: ["Governance"],
    summary: "A related FCA enforcement record.",
    sourceUrl: "https://www.fca.org.uk/news/news-stories/alpha-bank-2023",
    sourceStatus: "verified_detail",
    sourceCheckedAt: "2026-07-20T09:00:00.000Z",
    indexable: true,
    indexabilityReasons: [],
    relationship: "same_entity",
  }],
};

function renderPage(path = record.canonicalPath) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EvidenceModalProvider>
        <Routes>
          <Route path="/fca-fines/:year/:firmSlug/:caseId" element={<FcaFineCase />} />
        </Routes>
      </EvidenceModalProvider>
    </MemoryRouter>,
  );
}

describe("FcaFineCase", () => {
  beforeEach(() => {
    vi.mocked(fetchFcaFineCase).mockReset();
    document.querySelector('meta[name="robots"]')?.remove();
  });

  it("renders a canonical, evidence-first FCA fine page", async () => {
    vi.mocked(fetchFcaFineCase).mockResolvedValue({ success: true, data: record });

    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Alpha Bank plc" })).toBeInTheDocument();
    expect(screen.getByText("£12,000,000")).toBeInTheDocument();
    expect(screen.getByText(record.summary as string)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AML controls" })).toHaveAttribute("href", "/breaches/aml-controls");
    expect(screen.getByRole("link", { name: /FCA actions in 2025/i })).toHaveAttribute("href", "/years/2025");
    expect(screen.getByRole("link", { name: /All matched firm records/i })).toHaveAttribute("href", "/firms/alpha-bank-plc");
    expect(screen.getByText("Verified FCA case notice")).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    expect(fetchFcaFineCase).toHaveBeenCalledWith(CASE_ID, expect.any(AbortSignal));
  });

  it("opens the existing evidence summary before offering the FCA source", async () => {
    vi.mocked(fetchFcaFineCase).mockResolvedValue({ success: true, data: record });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Review source evidence/i }));

    expect(screen.getByRole("dialog", { name: "Alpha Bank plc" })).toBeInTheDocument();
    expect(screen.getByText("Verified regulator notice")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open official source/i })).toHaveAttribute(
      "href",
      record.resolvedSourceUrl,
    );
  });

  it("keeps incomplete records reviewable but marks them noindex", async () => {
    vi.mocked(fetchFcaFineCase).mockResolvedValue({
      success: true,
      data: {
        ...record,
        summary: "",
        sourceStatus: "missing",
        sourceUrl: null,
        noticeUrl: null,
        resolvedSourceUrl: null,
        sourceHttpStatus: null,
        sourceOfficialDomainMatch: null,
        quality: {
          indexable: false,
          reasons: ["missing_summary", "missing_official_source"],
          warnings: [],
          summaryWordCount: 0,
          evidenceStrength: "missing",
        },
      },
    });

    renderPage();

    expect(await screen.findByText("Record held out of search indexing")).toBeInTheDocument();
    expect(screen.getByText("A case summary is not yet available.")).toBeInTheDocument();
    expect(screen.getByText("A reliable official source is not yet available.")).toBeInTheDocument();
    expect(screen.getByText(/A concise case summary is not currently available/i)).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  });

  it("shows an honest noindex 404 state without case facts", async () => {
    vi.mocked(fetchFcaFineCase).mockRejectedValue(new FcaFineCaseRequestError(404));

    renderPage();

    expect(await screen.findByRole("heading", { name: "FCA fine case not found" })).toBeInTheDocument();
    expect(screen.getByText(/does not match a published RegActions FCA fine record/i)).toBeInTheDocument();
    expect(screen.queryByText("£12,000,000")).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow"));
  });

  it("allows a failed request to be retried", async () => {
    vi.mocked(fetchFcaFineCase)
      .mockRejectedValueOnce(new FcaFineCaseRequestError(500))
      .mockResolvedValueOnce({ success: true, data: record });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Alpha Bank plc" })).toBeInTheDocument();
    expect(fetchFcaFineCase).toHaveBeenCalledTimes(2);
  });
});

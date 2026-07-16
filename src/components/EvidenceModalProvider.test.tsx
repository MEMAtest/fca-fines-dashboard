import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceCase } from "../utils/evidenceCase.js";
import { EvidenceModalProvider, useEvidenceModal } from "./EvidenceModalProvider.js";

vi.mock("../utils/analytics.js", () => ({ trackEvent: vi.fn() }));

const verifiedEvidence: EvidenceCase = {
  id: "fca-alpha",
  entity: "Alpha Bank plc",
  regulator: "FCA",
  regulatorFullName: "Financial Conduct Authority",
  country: "United Kingdom",
  dateIssued: "2025-04-12",
  amount: 12_000_000,
  currency: "GBP",
  breachType: "Financial crime",
  categories: ["AML", "Systems and controls"],
  summary: "The FCA identified weaknesses in financial crime controls.",
  sourceStatus: "verified_detail",
  sourceLabel: "View notice",
  directSourceUrl: "https://www.fca.org.uk/news/news-stories/alpha-bank",
  listingSourceUrl: null,
  surface: "uk_enforcement",
};

function OpenEvidence({ evidence = verifiedEvidence }: { evidence?: EvidenceCase }) {
  const { openEvidence } = useEvidenceModal();
  return (
    <button type="button" onClick={() => openEvidence(evidence)}>
      Open Alpha evidence
    </button>
  );
}

function renderEvidence(evidence = verifiedEvidence) {
  return render(
    <EvidenceModalProvider>
      <OpenEvidence evidence={evidence} />
    </EvidenceModalProvider>,
  );
}

describe("EvidenceModalProvider", () => {
  it("keeps the case in RegActions until the official source is explicitly selected", () => {
    const initialUrl = window.location.href;
    renderEvidence();

    fireEvent.click(screen.getByRole("button", { name: "Open Alpha evidence" }));

    expect(screen.getByRole("dialog", { name: "Alpha Bank plc" })).toBeInTheDocument();
    expect(screen.getByText("Verified regulator notice")).toBeInTheDocument();
    expect(screen.getByText("£12,000,000")).toBeInTheDocument();
    expect(window.location.href).toBe(initialUrl);
    expect(screen.getByRole("link", { name: /Open official source/i })).toHaveAttribute(
      "href",
      verifiedEvidence.directSourceUrl,
    );
    expect(screen.getByRole("link", { name: /Open official source/i })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /Open official source/i })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("fails closed when no reliable official source is available", () => {
    renderEvidence({
      ...verifiedEvidence,
      sourceStatus: "missing",
      directSourceUrl: null,
      listingSourceUrl: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Alpha evidence" }));

    expect(screen.getByText("Official link pending verification")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open official source/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy source link/i })).not.toBeInTheDocument();
  });

  it("labels listing-only evidence honestly", () => {
    renderEvidence({
      ...verifiedEvidence,
      sourceStatus: "listing_only",
      directSourceUrl: null,
      listingSourceUrl: "https://www.fca.org.uk/news/search-results?category=news%20stories",
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Alpha evidence" }));

    expect(screen.getByText("Regulator source list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open regulator source list/i })).toHaveAttribute(
      "href",
      "https://www.fca.org.uk/news/search-results?category=news%20stories",
    );
  });

  it("closes with Escape and restores focus to the trigger", async () => {
    renderEvidence();
    const trigger = screen.getByRole("button", { name: "Open Alpha evidence" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

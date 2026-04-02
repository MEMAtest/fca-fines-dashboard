import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardIntelligence } from "./BoardIntelligence.js";

vi.mock("../hooks/useSEO.js", () => ({
  useSEO: vi.fn(),
}));

vi.mock("../hooks/useUnifiedData.js", () => ({
  useUnifiedData: vi.fn(() => ({
    fines: [
      {
        id: "1",
        fine_reference: "FCA-1",
        firm_individual: "NorthBridge Wealth Ltd",
        firm_category: "Payments",
        regulator: "FCA",
        regulator_full_name: "Financial Conduct Authority",
        final_notice_url: "https://example.com/notice",
        summary:
          "The firm failed to maintain effective transaction monitoring and senior managers oversight.",
        breach_type: "AML controls",
        breach_categories: ["AML", "Governance"],
        amount: 32_000_000,
        date_issued: "2025-06-10",
        year_issued: 2025,
        month_issued: 6,
        country_code: "GB",
        country_name: "United Kingdom",
      },
      {
        id: "2",
        fine_reference: "SEC-2",
        firm_individual: "Lion City Remittance Pte Ltd",
        firm_category: "Payments",
        regulator: "SEBI",
        regulator_full_name: "Securities and Exchange Board of India",
        final_notice_url: "https://example.com/notice-2",
        summary:
          "Counter terrorist financing escalation and sanctions screening controls were not operating effectively.",
        breach_type: "Financial crime controls",
        breach_categories: ["AML", "Sanctions"],
        amount: 18_500_000,
        date_issued: "2025-02-10",
        year_issued: 2025,
        month_issued: 2,
        country_code: "IN",
        country_name: "India",
      },
    ],
    stats: null,
    loading: false,
    error: null,
  })),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <BoardIntelligence />
    </MemoryRouter>,
  );
}

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

let localStorageMock: ReturnType<typeof createLocalStorageMock>;

describe("BoardIntelligence", () => {
  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
  });

  it("renders the board-pack route with generated pack content", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: /^Board Pack$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", {
        level: 2,
        name: /^NorthStar Compliance Profile$/,
      }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("heading", { name: /Exposure outlook/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Executive summary/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Why now/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Exposure overview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Key exposure themes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Appendix/i }),
    ).toBeInTheDocument();
  });

  it("regenerates the pack when the profile is changed", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Refine profile/i }));
    const input = screen.getByLabelText(/Firm or profile name/i);
    fireEvent.change(input, { target: { value: "NorthStar Payments" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Generate board pack/i }),
    );

    expect(
      screen.getAllByRole("heading", {
        level: 2,
        name: /^NorthStar Payments$/,
      }),
    ).toHaveLength(2);
  });

  it("shows a consultant advisory note and working-copy detail when selected", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Refine profile/i }));
    fireEvent.change(screen.getByLabelText(/Audience mode/i), {
      target: { value: "working" },
    });
    fireEvent.change(screen.getByLabelText(/MEMA advisory note/i), {
      target: { value: "Escalate remediation evidence on AML controls." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Generate board pack/i }),
    );

    expect(
      screen.getByRole("heading", { name: /MEMA advisory note/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Escalate remediation evidence on AML controls/i),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Control status for/i).length).toBeGreaterThan(0);
  });

  it("loads saved profile snapshots from local storage", () => {
    localStorageMock.setItem(
      "board-pack-saved-profiles-v1",
      JSON.stringify([
        {
          id: "saved-1",
          label: "NorthStar Board Pack",
          updatedAt: "2026-04-01T10:00:00.000Z",
          profile: {
            firmName: "NorthStar Board Pack",
            archetypeId: "retail-bank",
            boardFocus: "assurance",
            priorityRegulators: ["FCA", "ECB"],
            focusRegions: ["UK", "Europe"],
            priorityThemeIds: [
              "aml-controls",
              "governance-accountability",
              "systems-and-controls",
            ],
          },
          settings: {
            viewMode: "board",
            brandingMode: "client-ready",
            clientLabel: "NorthStar plc",
            confidentialityLabel: "Board Use Only",
            analystNote: "Use this pack for the April committee pack.",
            templateId: "committee-core",
          },
        },
      ]),
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Load$/i }));

    expect(
      screen.getAllByRole("heading", {
        level: 2,
        name: /^NorthStar Board Pack$/,
      }),
    ).toHaveLength(2);
    expect(screen.getAllByText(/Prepared for NorthStar plc/i)).toHaveLength(2);
  });
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinesWorkspace } from "./FinesWorkspace.js";
import { EvidenceModalProvider } from "../components/EvidenceModalProvider.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn(), injectStructuredData: vi.fn(() => () => undefined) }));
vi.mock("../hooks/useWorkspaceOverview.js", () => ({ useWorkspaceOverview: vi.fn(() => ({ data: null, loading: false, error: null })) }));
vi.mock("../utils/fetchWorkspaceRecords.js", () => ({ fetchWorkspaceRecords: vi.fn(async () => ({ records: [], total: 0, truncated: false })) }));
vi.mock("../hooks/useUnifiedData.js", () => ({ useUnifiedData: vi.fn() }));

const record = (id: string, firm: string, regulator: string) => ({
  id, fine_reference: id, firm_individual: firm, firm_category: "Broker", regulator, final_notice_url: "https://example.com/x",
  summary: "Case", breach_type: "Disclosure", breach_categories: ["Disclosure"], amount: 1000, date_issued: "2012-01-05", year_issued: 2012, month_issued: 1,
});
const latest = [record("a", "Alpha Bank", "FCA")];
const older = [record("c", "Cantor Fitzgerald", "SEC")];
const none: typeof latest = [];

describe("Fines search", () => {
  beforeEach(() => vi.mocked(useUnifiedData).mockReset());

  it("sends the query to the server, keeps the search box mounted and focused while searching, and shows older firms", async () => {
    let phase: "idle" | "searching" | "done" = "idle";
    vi.mocked(useUnifiedData).mockImplementation(((params: { q?: string }) => {
      if (params?.q) {
        return { fines: phase === "done" ? older : latest, stats: null, loading: phase === "searching", error: null };
      }
      return { fines: latest, stats: null, loading: false, error: null };
    }) as never);

    const { rerender } = render(
      <MemoryRouter initialEntries={["/fines/actions"]}>
        <EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider>
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText("Search firm, person or keyword...") as HTMLInputElement;
    input.focus();
    phase = "searching";
    fireEvent.change(input, { target: { value: "Cantor" } });

    await waitFor(() => expect(vi.mocked(useUnifiedData).mock.calls.some(([p]) => (p as { q?: string } | undefined)?.q === "Cantor")).toBe(true));
    // Searching: the same input element is still in the document and still focused; stale results stay.
    expect(screen.getByPlaceholderText("Search firm, person or keyword...")).toBe(input);
    expect(document.activeElement).toBe(input);
    await waitFor(() => expect(screen.getByRole("status", { name: "" }).textContent).toContain("Searching"));
    expect(screen.queryByText("Loading the enforcement workspace...")).toBeNull();

    phase = "done";
    await act(async () => {
      rerender(
        <MemoryRouter initialEntries={["/fines/actions"]}>
          <EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider>
        </MemoryRouter>,
      );
    });
    expect(screen.getByPlaceholderText("Search firm, person or keyword...")).toBe(input);
    await waitFor(() => expect(screen.getAllByText("Cantor Fitzgerald").length).toBeGreaterThan(0));
  });

  it("says no actions match instead of showing £0 tiles, and clearing restores the view", async () => {
    vi.mocked(useUnifiedData).mockImplementation(((params: { q?: string }) => (
      { fines: params?.q ? none : latest, stats: null, loading: false, error: null }
    )) as never);
    render(
      <MemoryRouter initialEntries={["/fines/actions"]}>
        <EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText("Search firm, person or keyword..."), { target: { value: "zzqx" } });
    await waitFor(() => expect(screen.getByText('No actions match "zzqx"')).toBeTruthy());
    expect(screen.queryByText("Total penalties")).toBeNull();
    expect(screen.queryByText("£0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    await waitFor(() => expect(screen.getByText("Total penalties")).toBeTruthy());
  });
});

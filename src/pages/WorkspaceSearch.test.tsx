import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinesWorkspace } from "./FinesWorkspace.js";
import { EvidenceModalProvider } from "../components/EvidenceModalProvider.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import { useWorkspaceOverview } from "../hooks/useWorkspaceOverview.js";
import { fetchWorkspaceRecords } from "../utils/fetchWorkspaceRecords.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn(), injectStructuredData: vi.fn(() => () => undefined) }));
vi.mock("../api.js", () => ({ fetchUnifiedOverview: vi.fn(async () => ({ metrics: { count: 1, total: 100 } })) }));
vi.mock("../hooks/useWorkspaceOverview.js", () => ({ useWorkspaceOverview: vi.fn(() => ({ data: null, loading: false, error: null })) }));
vi.mock("../utils/fetchWorkspaceRecords.js", () => ({ fetchWorkspaceRecords: vi.fn(async () => ({ records: [], total: 0, truncated: false })) }));
vi.mock("../hooks/useUnifiedData.js", () => ({ useUnifiedData: vi.fn() }));

const record = (id: string, firm: string, regulator: string) => ({
  id, fine_reference: id, firm_individual: firm, firm_category: "Bank", regulator, final_notice_url: "https://example.com/x",
  summary: "Case", breach_type: "Disclosure", breach_categories: ["Disclosure", "AML"], amount: 1000, monetary_penalty_status: "disclosed", date_issued: "2012-01-05", year_issued: 2012, month_issued: 1,
});
const latest = [record("a", "Alpha Bank", "FCA")];
const older = [record("c", "Cantor Fitzgerald", "SEC")];
const none: typeof latest = [];

describe("Fines search", () => {
  beforeEach(() => {
    vi.mocked(useUnifiedData).mockReset();
    vi.mocked(useWorkspaceOverview).mockReset();
    vi.mocked(useWorkspaceOverview).mockReturnValue({ data: null, loading: false, error: null } as never);
    vi.mocked(fetchWorkspaceRecords).mockClear();
  });

  it("preserves deep-linked filters, pages bounded results, and passes the filter scope to the server", async () => {
    vi.mocked(useUnifiedData).mockImplementation(((_params: unknown) => ({
      fines: latest, stats: null, loading: false, error: null, total: 245,
    })) as never);
    render(
      <MemoryRouter initialEntries={["/fines/actions?theme=AML&sector=Bank&outcome=Monetary&page=1"]}>
        <EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(vi.mocked(useUnifiedData).mock.calls.some(([params]) => (
      (params as { maximumRecords?: number; offset?: number; breachCategory?: string; sector?: string; outcome?: string })?.maximumRecords === 100 &&
      (params as { offset?: number }).offset === 100 &&
      (params as { breachCategory?: string }).breachCategory === "AML" &&
      (params as { sector?: string }).sector === "Bank" &&
      (params as { outcome?: string }).outcome === "Monetary"
    ))).toBe(true));
    expect(screen.getByRole("navigation", { name: "Enforcement result pages" })).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(vi.mocked(useUnifiedData).mock.calls.some(([params]) => (params as { offset?: number })?.offset === 200)).toBe(true));
  });

  it.each(["Infinity", "-1", "1.5"])("normalizes invalid page=%s to the first result window", async (page) => {
    vi.mocked(useUnifiedData).mockImplementation(((_params: unknown) => ({
      fines: latest, stats: null, loading: false, error: null, total: 245,
    })) as never);
    render(
      <MemoryRouter initialEntries={[`/fines/actions?page=${page}`]}>
        <EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(vi.mocked(useUnifiedData).mock.calls.some(([params]) => (params as { offset?: number })?.offset === 0)).toBe(true));
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("clamps an integer page beyond the exact result range to the last page", async () => {
    vi.mocked(useUnifiedData).mockImplementation(((_params: unknown) => ({
      fines: latest, stats: null, loading: false, error: null, total: 245,
    })) as never);
    render(
      <MemoryRouter initialEntries={["/fines/actions?page=99"]}>
        <EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Page 3 of 3")).toBeInTheDocument());
    expect(vi.mocked(useUnifiedData).mock.calls.some(([params]) => (params as { offset?: number })?.offset === 200)).toBe(true);
  });

  it("restores deep-linked filters and page when browser history moves back", async () => {
    vi.mocked(useUnifiedData).mockImplementation(((_params: unknown) => ({
      fines: latest, stats: null, loading: false, error: null, total: 245,
    })) as never);
    const router = createMemoryRouter([
      { path: "/fines/actions", element: <EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider> },
    ], {
      initialEntries: ["/fines/actions?theme=AML&page=1", "/fines/actions?theme=FRAUD&page=0"],
      initialIndex: 1,
    });
    render(<RouterProvider router={router} />);

    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(vi.mocked(useUnifiedData).mock.calls.some(([params]) => (
      (params as { breachCategory?: string; offset?: number })?.breachCategory === "AML" &&
      (params as { offset?: number })?.offset === 100
    ))).toBe(true));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("refuses exports above the safe bound before fetching any records", async () => {
    vi.mocked(useUnifiedData).mockReturnValue({ fines: latest, stats: null, loading: false, error: null, total: 12001 } as never);
    vi.mocked(useWorkspaceOverview).mockReturnValue({
      data: { metrics: { count: 12001, total: 1, average: 1, median: 1, p75: 1, topTenConcentration: 100, largest: 1, largestFirm: "Example", affectedFirms: 1, countries: 1 } },
      loading: false,
      error: null,
    } as never);
    render(
      <MemoryRouter initialEntries={["/fines/actions"]}>
        <EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export evidence" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("above the safe 10,000-record export limit");
    expect(fetchWorkspaceRecords).not.toHaveBeenCalled();
  });

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
    await waitFor(() => expect(screen.getAllByText('No actions match "zzqx"').length).toBe(2)); // visible box + live region
    expect(screen.queryByText("Total penalties")).toBeNull();
    expect(screen.queryByText("£0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    await waitFor(() => expect(screen.getByText("Total penalties")).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Search firm, person or keyword..."));
  });

  it("keeps compare mode panels when compare selections leave the base view empty", async () => {
    vi.mocked(useUnifiedData).mockImplementation(((params: { q?: string }) => (
      { fines: params?.q ? none : latest, stats: null, loading: false, error: null }
    )) as never);
    render(
      <MemoryRouter initialEntries={["/fines/compare"]}>
        <EvidenceModalProvider><FinesWorkspace view="compare" /></EvidenceModalProvider>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText("Search firm, person or keyword..."), { target: { value: "zzqx" } });
    await waitFor(() => expect(vi.mocked(useUnifiedData).mock.calls.some(([p]) => (p as { q?: string } | undefined)?.q === "zzqx")).toBe(true));
    expect(screen.queryByText('No actions match "zzqx"')).toBeNull();
    expect(screen.getByText("Comparison summary")).toBeTruthy();
  });

  it("aborts the obsolete paged comparison when a second year is selected", async () => {
    vi.mocked(useUnifiedData).mockReturnValue({ fines: latest, stats: null, loading: false, error: null, total: 1 } as never);
    vi.mocked(useWorkspaceOverview).mockReturnValue({
      data: {
        yearly: [
          { year: 2015, count: 1, amount: 100 },
          { year: 2016, count: 1, amount: 200 },
        ],
        metrics: { topTenConcentration: 0, p75: 0 },
      },
      loading: false,
      error: null,
    } as never);
    vi.mocked(fetchWorkspaceRecords).mockImplementation(((params: Parameters<typeof fetchWorkspaceRecords>[0], _currency: string | undefined, _maximumRecords: number | undefined, options: { signal?: AbortSignal } | undefined) => (
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
      })
    )) as never);

    render(
      <MemoryRouter initialEntries={["/fines/compare"]}>
        <EvidenceModalProvider><FinesWorkspace view="compare" /></EvidenceModalProvider>
      </MemoryRouter>,
    );

    const yearTile = (year: number) => Array.from(document.querySelectorAll(".workspace-treemap .workspace-tile"))
      .find((tile) => tile.textContent?.trim().startsWith(String(year)));
    const firstYear = yearTile(2015);
    expect(firstYear).toBeTruthy();
    fireEvent.click(firstYear!);
    await waitFor(() => expect(fetchWorkspaceRecords).toHaveBeenCalledTimes(1));

    const secondYear = yearTile(2016);
    expect(secondYear).toBeTruthy();
    fireEvent.click(secondYear!);
    await waitFor(() => expect(fetchWorkspaceRecords).toHaveBeenCalledTimes(2));

    const calls = vi.mocked(fetchWorkspaceRecords).mock.calls;
    expect(calls[0]?.[0].year).toEqual([2015]);
    expect(calls[0]?.[3]?.signal?.aborted).toBe(true);
    expect(calls[1]?.[0].year).toEqual([2015, 2016]);
    expect(calls[1]?.[3]?.signal?.aborted).toBe(false);
  });
});

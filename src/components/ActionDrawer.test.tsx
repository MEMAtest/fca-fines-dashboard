import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FineRecord } from "../types.js";
import { ActionDrawer } from "./ActionDrawer.js";

vi.mock("./EvidenceModalProvider.js", () => ({
  useEvidenceModal: () => ({ openEvidence: vi.fn() }),
}));

const baseRecord = {
  fine_reference: "case-1",
  firm_individual: "Disclosed firm",
  firm_category: "Bank",
  regulator: "FINRA",
  final_notice_url: null,
  summary: "Enforcement action",
  breach_type: "Conduct",
  breach_categories: [],
  amount: 0,
  date_issued: "2016-12-30",
  year_issued: 2016,
  month_issued: 12,
} satisfies FineRecord;

function renderDrawer(records: FineRecord[]) {
  return render(
    <ActionDrawer
      open
      title="2016 actions"
      records={records}
      onClose={vi.fn()}
    />,
  );
}

describe("ActionDrawer amounts", () => {
  it("uses currency-specific evidence and labels missing, reviewed, and non-monetary amounts honestly", () => {
    renderDrawer([
      { ...baseRecord, firm_individual: "Disclosed firm", amount_gbp: 3_400, amount_disclosed: true, monetary_penalty_status: "disclosed" },
      { ...baseRecord, fine_reference: "case-2", firm_individual: "Undisclosed firm", amount_gbp: undefined, amount_disclosed: false },
      { ...baseRecord, fine_reference: "case-3", firm_individual: "Reviewed firm", amount_gbp: undefined, requires_amount_review: true, amount_disclosed: true, monetary_penalty_status: "disclosed" },
      { ...baseRecord, fine_reference: "case-4", firm_individual: "Non-monetary firm", monetary_penalty_status: "none" },
    ]);

    expect(screen.getByLabelText("Disclosed fine: £3k")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount not disclosed")).toBeInTheDocument();
    expect(screen.getByLabelText("Fine amount under review")).toBeInTheDocument();
    expect(screen.getByLabelText("Non-monetary")).toBeInTheDocument();
    expect(screen.getAllByText("£3k")).toHaveLength(2);
    expect(screen.queryByText("£0")).not.toBeInTheDocument();
  });

  it("formats disclosed drawer rows in the selected currency", () => {
    render(
      <ActionDrawer
        open
        title="Euro actions"
        records={[{ ...baseRecord, amount_eur: 4_600, amount_disclosed: true, monetary_penalty_status: "disclosed" }]}
        currency="EUR"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Disclosed fine: EUR 5k")).toBeInTheDocument();
    expect(screen.getAllByText("EUR 5k")).toHaveLength(2);
  });

  it("keeps undisclosed amounts blank in CSV exports", async () => {
    let exportedBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      exportedBlob = blob as Blob;
      return "blob:action-drawer-test";
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    renderDrawer([
      { ...baseRecord, firm_individual: "Undisclosed firm", amount_disclosed: false },
      { ...baseRecord, fine_reference: "case-2", firm_individual: "Reviewed firm", requires_amount_review: true },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(exportedBlob).toBeDefined();
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(exportedBlob!);
    });
    expect(csv.split("\n").find((line) => line.includes(",Undisclosed firm,"))?.split(",")[4]).toBe("");
    expect(csv.split("\n").find((line) => line.includes(",Reviewed firm,"))?.split(",")[4]).toBe("");
  });
});

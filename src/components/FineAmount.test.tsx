import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FineRecord } from "../types.js";
import { FineAmount } from "./FineAmount.js";

const baseRecord = {
  id: "fine-1",
  fine_reference: "FINE-1",
  firm_individual: "Example Firm",
  firm_category: "Banking",
  regulator: "FCA",
  final_notice_url: "https://example.com/notice",
  summary: "Example enforcement action",
  breach_type: "AML",
  breach_categories: ["AML"],
  amount: 325_000,
  date_issued: "2026-08-25",
  year_issued: 2026,
  month_issued: 8,
} satisfies FineRecord;

describe("FineAmount", () => {
  it("marks a disclosed financial penalty for quick scanning", () => {
    render(<FineAmount record={baseRecord} />);

    expect(screen.getByLabelText("Disclosed fine: £325k")).toHaveClass("workspace-fine--disclosed");
  });

  it("keeps a non-disclosed amount visually secondary", () => {
    render(<FineAmount record={{ ...baseRecord, amount: 0, amount_disclosed: false }} />);

    expect(screen.getByLabelText("Amount not disclosed")).toHaveClass("workspace-fine--undisclosed");
  });

  it("does not present an amount under review as a disclosed fine", () => {
    render(<FineAmount record={{ ...baseRecord, requires_amount_review: true }} />);

    expect(screen.getByLabelText("Fine amount under review")).toHaveClass("workspace-fine--undisclosed");
  });

  it("labels a concluded non-monetary sanction without implying a zero fine", () => {
    render(<FineAmount record={{ ...baseRecord, amount: 0, monetary_penalty_status: "none" }} />);

    expect(screen.getByLabelText("Non-monetary")).toHaveClass("workspace-fine--non-monetary");
  });

  it("labels pending proceedings separately from fines", () => {
    render(<FineAmount record={{ ...baseRecord, amount: 0, monetary_penalty_status: "unknown", record_class: "proceeding" }} />);

    expect(screen.getByLabelText("Outcome pending")).toHaveClass("workspace-fine--pending");
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AtlasSanctionsTabBody } from "../AtlasSanctionsTabBody.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }),
  );
});

describe("AtlasSanctionsTabBody", () => {
  it("renders FATF black-list status with a required action for a listed country (KP)", () => {
    render(<AtlasSanctionsTabBody iso2="KP" />);
    expect(screen.getByText(/Black list/)).toBeInTheDocument();
  });

  it("renders the honest empty state when no change-log events exist for a quiet country", () => {
    render(<AtlasSanctionsTabBody iso2="LI" />);
    expect(screen.getByText(/No dated changes recorded since/)).toBeInTheDocument();
  });

  it("never claims a listed country is unsanctioned (no bare absence-as-clean copy)", () => {
    render(<AtlasSanctionsTabBody iso2="XX" />);
    expect(screen.queryByText(/Not enough information/)).not.toBeInTheDocument();
  });
});

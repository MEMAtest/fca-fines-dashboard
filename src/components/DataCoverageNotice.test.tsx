import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataCoverageNotice } from "./DataCoverageNotice.js";
import { getRegulatorCoverage } from "../data/regulatorCoverage.js";

describe("DataCoverageNotice", () => {
  it("shows the lower-confidence live warning for fragile live regulators", () => {
    const coverage = getRegulatorCoverage("DFSA");

    expect(coverage).not.toBeNull();

    render(<DataCoverageNotice coverage={coverage!} />);

    expect(
      screen.getByText(/This regulator is live, but the collection path/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/19 enforcement actions/i)).toBeInTheDocument();
  });

  it("does not show the lower-confidence warning for standard live regulators", () => {
    const coverage = getRegulatorCoverage("FCA");

    expect(coverage).not.toBeNull();

    render(<DataCoverageNotice coverage={coverage!} />);

    expect(screen.queryByText(/collection path/i)).not.toBeInTheDocument();
    expect(screen.getByText(/308 enforcement actions/i)).toBeInTheDocument();
  });
});

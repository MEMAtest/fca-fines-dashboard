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
      screen.getByText(/separate official documents/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Based on official regulator publications/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/scrap|manifest|feed floor/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/19 enforcement actions/i)).toBeInTheDocument();
  });

  it("explains sparse source coverage for thin official feeds", () => {
    const coverage = getRegulatorCoverage("JFSC");

    expect(coverage).not.toBeNull();

    render(<DataCoverageNotice coverage={coverage!} />);

    expect(
      screen.getAllByText(
        /official source publishes very few explicit monetary penalties/i,
      ),
    ).toHaveLength(1);
    expect(
      screen.queryByText(/scrap|manifest|feed floor/i),
    ).not.toBeInTheDocument();
  });

  it("does not show the lower-confidence warning for standard live regulators", () => {
    const coverage = getRegulatorCoverage("FCA");

    expect(coverage).not.toBeNull();

    render(<DataCoverageNotice coverage={coverage!} recordCount={500} />);

    expect(screen.queryByText(/collection path/i)).not.toBeInTheDocument();
    expect(screen.getByText(/500 enforcement actions/i)).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RegulatorBadge from "./RegulatorBadge.js";

describe("RegulatorBadge", () => {
  it("uses regulator coverage metadata for tooltip and accessible text", () => {
    render(<RegulatorBadge regulator="SEC" size="small" />);

    const badge = screen.getByLabelText(
      "U.S. Securities and Exchange Commission (United States)",
    );

    expect(badge).toHaveAttribute(
      "title",
      "U.S. Securities and Exchange Commission (United States)",
    );
    expect(badge.querySelector(".regulator-badge__code")).toHaveTextContent(
      "SEC",
    );
  });

  it("falls back cleanly when a regulator is unknown", () => {
    render(<RegulatorBadge regulator="ZZZ" size="small" />);

    const badge = screen.getByLabelText("ZZZ");
    expect(badge).toHaveAttribute("title", "ZZZ");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegulatorMark } from "./RegulatorMark.js";

describe("RegulatorMark", () => {
  it("renders an official logo image when one is approved", () => {
    render(
      <RegulatorMark
        regulator="FCA"
        label="Financial Conduct Authority"
        country="United Kingdom"
        showCode
        decorative={false}
      />,
    );

    expect(
      screen.getByRole("img", { name: /Financial Conduct Authority/ }),
    ).toBeInTheDocument();
    expect(document.querySelector(".regulator-mark__image")).toHaveAttribute(
      "src",
      "/regulator-logos/fca.png",
    );
    expect(screen.getByText("FCA")).toBeInTheDocument();
  });

  it("renders a fallback sigil when no official logo is approved", () => {
    render(
      <RegulatorMark
        regulator="SEC"
        label="U.S. Securities and Exchange Commission"
        country="United States"
        decorative={false}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /U\.S\. Securities and Exchange Commission/,
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".regulator-mark__sigil")).toBeTruthy();
    expect(document.querySelector(".regulator-mark__image")).toBeFalsy();
  });

  it("uses the fallback sigil for tiny official logos in compact marks", () => {
    render(
      <RegulatorMark
        regulator="FCA"
        label="Financial Conduct Authority"
        country="United Kingdom"
        size="small"
        showCode
        decorative={false}
      />,
    );

    expect(screen.getByText("FCA")).toBeInTheDocument();
    expect(document.querySelector(".regulator-mark__sigil")).toBeTruthy();
    expect(document.querySelector(".regulator-mark__image")).toBeFalsy();
  });

  it("is decorative by default inside larger labeled UI", () => {
    render(
      <RegulatorMark
        regulator="FCA"
        label="Financial Conduct Authority"
        country="United Kingdom"
      />,
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByLabelText(/Financial Conduct Authority/)).toBeNull();
  });
});

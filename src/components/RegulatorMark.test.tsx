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
      "/regulator-logos/fca.ico",
    );
    expect(screen.getByText("FCA")).toBeInTheDocument();
  });

  it("renders a fallback sigil only for unknown regulators", () => {
    render(
      <RegulatorMark
        regulator="ZZZ"
        label="Unknown regulator"
        country="Unknown"
        decorative={false}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /Unknown regulator/,
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".regulator-mark__sigil")).toBeTruthy();
    expect(document.querySelector(".regulator-mark__image")).toBeFalsy();
  });

  it("uses the managed logo even in compact marks", () => {
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
    expect(document.querySelector(".regulator-mark__sigil")).toBeFalsy();
    expect(document.querySelector(".regulator-mark__image")).toHaveAttribute(
      "src",
      "/regulator-logos/fca.ico",
    );
  });

  it("switches to a compact official asset for small badges when configured", () => {
    render(
      <RegulatorMark
        regulator="DNB"
        label="De Nederlandsche Bank"
        country="Netherlands"
        size="small"
        showCode
        decorative={false}
      />,
    );

    expect(screen.getByText("DNB")).toBeInTheDocument();
    expect(document.querySelector(".regulator-mark__image")).toHaveAttribute(
      "src",
      "/regulator-logos/dnb-compact.svg",
    );
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

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthorityMark, officialLogoRegulatorCode } from "./AuthorityMark.js";
import { getRegulatorySignalCountry, listRegulatorySignalCountries } from "../data/regulatorySignal.js";

const UK = getRegulatorySignalCountry("GB")!;
const authority = (name: string) => UK.authorities.find((item) => item.name === name)!;

describe("AuthorityMark", () => {
  it("draws the official logo for an authority we already track", () => {
    expect(officialLogoRegulatorCode("The Financial Conduct Authority")).toBe("FCA");
    const { container } = render(<AuthorityMark authority={authority("The Financial Conduct Authority")} />);
    expect(container.querySelector("img.regulator-mark__image")).toBeInTheDocument();
  });

  it("falls back to the mandate icon rather than another regulator's brand", () => {
    // The Bank of England is not one of the tracked regulators — the UK feed is
    // the FCA — so it must draw a central-bank icon, never a borrowed logo.
    expect(officialLogoRegulatorCode("Bank of England")).toBeNull();
    const { container } = render(<AuthorityMark authority={authority("Bank of England")} />);
    expect(container.querySelector(".authority-mark")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("matches on the exact name, so a near-miss gets no logo", () => {
    expect(officialLogoRegulatorCode("Financial Conduct Authority of Ruritania")).toBeNull();
    expect(officialLogoRegulatorCode("Conduct Authority")).toBeNull();
  });

  it("gives every mapped authority a mark, whichever branch supplies it", () => {
    const authorities = listRegulatorySignalCountries().flatMap((country) => country.authorities);
    expect(authorities.length).toBeGreaterThan(600);
    for (const item of authorities.slice(0, 120)) {
      const { container, unmount } = render(<AuthorityMark authority={item} />);
      expect(container.querySelector(".authority-mark, .authority-mark__logo")).toBeInTheDocument();
      unmount();
    }
  });
});

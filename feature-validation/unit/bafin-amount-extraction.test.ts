import { describe, expect, test } from "vitest";
import {
  extractReferencedAmount,
  extractSanctionAmount,
} from "../../scripts/scraper/scrapeBafin.js";

describe("BaFin monetary amount classification", () => {
  test("retains a DekaBank accounting figure for identity but not as a sanction", () => {
    const text = "BaFin leitet eine Prüfung ein. Gegenstand ist eine Steuerforderung in Höhe von 478 Millionen Euro.";
    expect(extractReferencedAmount([text])).toBe(478_000_000);
    expect(extractSanctionAmount([text])).toBeNull();
  });

  test("extracts a value when BaFin explicitly describes a fine", () => {
    const text = "BaFin hat gegen die Beispiel AG ein Bußgeld in Höhe von 1,2 Millionen Euro verhängt.";
    expect(extractSanctionAmount([text])).toBe(1_200_000);
  });

  test("does not confuse assets or turnover with a fine", () => {
    const text = "Das Institut verwaltet Vermögen von 400 Milliarden Euro und erzielte 4,1 Milliarden Euro Umsatz.";
    expect(extractSanctionAmount([text])).toBeNull();
  });
});

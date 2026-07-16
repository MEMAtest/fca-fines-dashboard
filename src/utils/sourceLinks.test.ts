import { describe, expect, it } from "vitest";
import { deriveSourceLinkStatus } from "./sourceLinks.js";

describe("deriveSourceLinkStatus", () => {
  it("recognises verified case notices and publications", () => {
    expect(deriveSourceLinkStatus(
      "FCA",
      "https://www.fca.org.uk/news/news-stories/example-case",
      "https://www.fca.org.uk/news/search-results",
    )).toBe("verified_detail");
    expect(deriveSourceLinkStatus(
      "FCA",
      "https://www.fca.org.uk/publication/final-notices/example.pdf",
      null,
    )).toBe("verified_publication");
  });

  it("does not present regulator listing pages as verified case evidence", () => {
    const listing = "https://www.fca.org.uk/enforcement-actions";
    expect(deriveSourceLinkStatus("FCA", listing, listing)).toBe("listing_only");
    expect(deriveSourceLinkStatus("FCA", listing, null)).toBe("missing");
  });

  it("fails closed for synthetic CNMV details and regulators without stable case links", () => {
    expect(deriveSourceLinkStatus(
      "CNMV",
      "https://www.cnmv.es/portal/consultas/registrosanciones/s/2025/example",
      "https://www.cnmv.es/portal/consultas/registrosanciones/",
    )).toBe("listing_only");
    expect(deriveSourceLinkStatus(
      "AFM",
      "https://www.afm.nl/en/sector/actueel/2025/example",
      "https://www.afm.nl/en/sector/actueel",
    )).toBe("listing_only");
  });

  it("reports missing when no usable official URL exists", () => {
    expect(deriveSourceLinkStatus("FCA", "not-a-url", null)).toBe("missing");
  });
});

import { describe, expect, it } from "vitest";
import { CBUAE_SNAPSHOT_RECORDS } from "../data/cbuaeSnapshot.js";
import { DFSA_SNAPSHOT_RECORDS } from "../data/dfsaSnapshot.js";

describe("archive manifests", () => {
  it("keeps the widened DFSA manifest populated with official document-backed actions", () => {
    expect(DFSA_SNAPSHOT_RECORDS.some((record) => record.dateIssued === "2026-05-12" && record.firmIndividual.includes("Wael Abdelmohsen"))).toBe(true);
    expect(DFSA_SNAPSHOT_RECORDS[0].firmIndividual).toContain("Wael Abdelmohsen");
    expect(
      DFSA_SNAPSHOT_RECORDS.some((record) =>
        Boolean(record.officialDocumentUrl),
      ),
    ).toBe(true);
    expect(
      DFSA_SNAPSHOT_RECORDS.some((record) =>
        record.sourceUrl.includes("/news/"),
      ),
    ).toBe(true);
  });

  it("keeps the widened CBUAE manifest mixed between index pages and direct PDFs", () => {
    expect(CBUAE_SNAPSHOT_RECORDS[0].dateIssued).toBe("2025-12-23");
    expect(CBUAE_SNAPSHOT_RECORDS[0].firmIndividual).toBe("Omda Exchange");
    expect(
      CBUAE_SNAPSHOT_RECORDS.some((record) => record.amount === null),
    ).toBe(true);
    expect(
      CBUAE_SNAPSHOT_RECORDS.some((record) =>
        record.sourceUrl.endsWith("/enforcement/"),
      ),
    ).toBe(true);
    expect(
      CBUAE_SNAPSHOT_RECORDS.some((record) =>
        record.sourceUrl.endsWith(".pdf"),
      ),
    ).toBe(true);
  });
});

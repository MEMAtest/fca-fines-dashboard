import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import {
  aggregateByCountry,
  diffAggregate,
  parseEuSanctionsXml,
  parseOfacSanctionsXml,
  parseUkSanctionsXml,
  parseUnSanctionsXml,
  resolveEuSanctionsXmlUrl,
} from "../connectors.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, "..", "__fixtures__", name), "utf8");

describe("sanctions connectors — fixture parsing", () => {
  it("parses the UN consolidated list sample (2 individuals + 1 entity, all North Korea)", () => {
    const entries = parseUnSanctionsXml(fixture("un-sample.xml"));
    expect(entries).toHaveLength(3);
    expect(entries[0].name).toBe("Kim Jong");
    expect(entries.every((e: (typeof entries)[number]) => e.countries.some((c: string) => c.includes("Korea")))).toBe(true);

    const agg = aggregateByCountry("un", entries);
    expect(agg).toEqual([
      { regimeCode: "un", iso2: "KP", designationCount: 3, programmes: ["DPRK", "Senior official"] },
    ]);
  });

  it("parses the OFAC SDN sample (1 individual + 1 entity, both Russia)", () => {
    const entries = parseOfacSanctionsXml(fixture("ofac-sample.xml"));
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe("Ivan Petrov");
    expect(entries[0].type).toBe("individual");
    expect(entries[1].type).toBe("company");

    const agg = aggregateByCountry("ofac", entries);
    expect(agg).toEqual([
      { regimeCode: "ofac", iso2: "RU", designationCount: 2, programmes: ["RUSSIA-EO14024"] },
    ]);
  });

  it("parses the UK sanctions list sample (1 individual + 1 entity, both Belarus)", () => {
    const entries = parseUkSanctionsXml(fixture("uk-sample.xml"));
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe("Alexander Lukashenko");
    expect(entries[0].type).toBe("individual");

    const agg = aggregateByCountry("uk", entries);
    expect(agg).toEqual([{ regimeCode: "uk", iso2: "BY", designationCount: 2, programmes: ["Belarus"] }]);
  });

  it("parses the EU financial sanctions dataset sample (1 person + 1 enterprise, both Russia) — real attribute-based schema", () => {
    const entries = parseEuSanctionsXml(fixture("eu-sample.xml"));
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe("Sergei Ivanovich");
    expect(entries[0].type).toBe("individual");
    expect(entries[0].aliases).toEqual(["S. Ivanov"]);
    expect(entries[1].name).toBe("Volga Shipping JSC");
    expect(entries[1].type).toBe("company");

    const agg = aggregateByCountry("eu", entries);
    expect(agg).toEqual([{ regimeCode: "eu", iso2: "RU", designationCount: 2, programmes: ["RUS"] }]);
  });

  it("returns [] for EU XML with no sanctionEntity blocks (never fabricates entries)", () => {
    expect(parseEuSanctionsXml("<export></export>")).toEqual([]);
  });
});

describe("resolveEuSanctionsXmlUrl — runtime catalogue resolution", () => {
  it("picks the XML distribution's download_url from the catalogue API response", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          distributions: [
            { format: { id: "CSV" }, download_url: ["https://example.com/list.csv"] },
            { format: { id: "XML" }, download_url: ["https://example.com/list.xml?token=abc"] },
          ],
        },
      }),
    });
    const resolution = await resolveEuSanctionsXmlUrl(fakeFetch as unknown as typeof fetch);
    expect(resolution.url).toBe("https://example.com/list.xml?token=abc");
  });

  it("returns null with evidence when the catalogue has no XML distribution (never guesses a URL)", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { distributions: [{ format: { id: "CSV" }, download_url: ["https://example.com/list.csv"] }] } }),
    });
    const resolution = await resolveEuSanctionsXmlUrl(fakeFetch as unknown as typeof fetch);
    expect(resolution.url).toBeNull();
    expect(resolution.evidence).toContain("No XML distribution found");
    expect(resolution.evidence).toContain("CSV");
  });

  it("returns null with evidence when the catalogue API itself fails", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: "Service Unavailable" });
    const resolution = await resolveEuSanctionsXmlUrl(fakeFetch as unknown as typeof fetch);
    expect(resolution.url).toBeNull();
    expect(resolution.evidence).toContain("503");
  });
});

describe("diffAggregate — change-log line generation", () => {
  it("produces the plan's example format on an increase with a new programme", () => {
    const current = { regimeCode: "ofac" as const, iso2: "RU", designationCount: 13, programmes: ["RUSSIA-EO14024"] };
    const previous = { regimeCode: "ofac" as const, iso2: "RU", designationCount: 10, programmes: [] };
    expect(diffAggregate(current, previous)).toBe("OFAC: +3 designations linked to RU, programme RUSSIA-EO14024");
  });

  it("returns null when nothing changed", () => {
    const current = { regimeCode: "uk" as const, iso2: "BY", designationCount: 5, programmes: ["Belarus"] };
    expect(diffAggregate(current, current)).toBeNull();
  });

  it("handles a first-ever snapshot (no previous) as a full increase", () => {
    const current = { regimeCode: "un" as const, iso2: "KP", designationCount: 3, programmes: ["DPRK"] };
    expect(diffAggregate(current, null)).toBe("UN: +3 designations linked to KP, programme DPRK");
  });
});

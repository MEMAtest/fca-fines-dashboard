import { describe, expect, it, vi } from "vitest";
import { collectCurrentStateSnapshot, CORE_PLATFORM_ROUTES } from "./currentStateAudit.js";

function html(title: string, canonical?: string) {
  return `<html><head><title>${title}</title>${canonical ? `<link rel="canonical" href="${canonical}">` : ""}</head><body /></html>`;
}

describe("current RegActions state audit", () => {
  it("captures required routes, live hubs, API dates, canonical and redirect behaviour", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/unified/search")) return new Response(JSON.stringify({ results: [{ date_issued: "2026-08-12" }] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.startsWith("https://legacy.example")) return new Response(html("RegActions"), { status: 200, headers: { "content-type": "text/html" } });
      return new Response(html("RegActions page", "https://regactions.test/canonical"), { status: 200, headers: { "content-type": "text/html" } });
    });
    const snapshot = await collectCurrentStateSnapshot({
      baseUrl: "https://regactions.test",
      legacyUrl: "https://legacy.example/",
      regulators: [
        { code: "FCA", overviewPath: "/regulators/fca", years: "2020–2026" },
        { code: "AMF", overviewPath: "/regulators/amf", years: "2023–2024" },
      ],
      fetchImpl: fetchMock as typeof fetch,
      now: () => new Date("2026-08-13T12:00:00.000Z"),
    });
    expect(snapshot.fetchFailures).toEqual([]);
    expect(snapshot.urls).toHaveLength(CORE_PLATFORM_ROUTES.length + 2 + 1);
    expect(snapshot.urls).toContainEqual(expect.objectContaining({ url: "https://regactions.test/methodology/enforcement", canonicalUrl: "https://regactions.test/canonical", status: 200 }));
    expect(snapshot.regulatorHubs).toEqual(expect.arrayContaining([
      expect.objectContaining({ regulator: "FCA", coverageEnd: "2026", latestRecordDate: "2026-08-12" }),
      expect.objectContaining({ regulator: "AMF", coverageEnd: "2024", latestRecordDate: "2026-08-12" }),
    ]));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/unified/search?regulator=FCA"))).toBe(true);
  });

  it("records fetch failures instead of throwing so downstream QA artifacts can still be built", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/blog")) throw new Error("network unavailable");
      if (url.includes("/api/unified/search")) return new Response("temporarily down", { status: 503 });
      return new Response(html("Healthy"), { status: 200 });
    });
    const snapshot = await collectCurrentStateSnapshot({ baseUrl: "https://regactions.test", legacyUrl: "https://legacy.example", regulators: [{ code: "FCA", overviewPath: "/regulators/fca", years: "2026" }], fetchImpl: fetchMock as typeof fetch });
    expect(snapshot.fetchFailures).toEqual(expect.arrayContaining([
      expect.stringContaining("network unavailable"),
      expect.stringContaining("FCA unified-search check returned HTTP 503"),
    ]));
    expect(snapshot.urls).toContainEqual(expect.objectContaining({ url: "https://regactions.test/blog", status: null, errorMessage: expect.stringContaining("network unavailable") }));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { runLoaderWithGuard, SourceBlockedError } from "../lib/sourceFetchGuard.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });
const mockFetch = (fn: (url: string) => Response) => { globalThis.fetch = vi.fn(async (u: unknown) => fn(String(u))) as unknown as typeof fetch; };

// A loader that, like the real ones, swallows the failure and returns an empty list.
const swallowingLoader = (url: string) => async () => { await fetch(url); return [] as string[]; };

describe("shared source-fetch guard", () => {
  it("a 403 records blocked, not success", async () => {
    mockFetch(() => html("Access Denied", 403));
    await expect(runLoaderWithGuard(swallowingLoader("https://www.example-regulator.test/list"))).rejects.toMatchObject({ name: "SourceBlockedError", message: expect.stringContaining("[blocked]") });
  });
  it("a 200 bot-challenge page records blocked", async () => {
    mockFetch(() => html("<html><title>Just a moment...</title><body>Enable JavaScript and cookies to continue</body></html>"));
    await expect(runLoaderWithGuard(swallowingLoader("https://www.example-regulator.test/list"))).rejects.toBeInstanceOf(SourceBlockedError);
  });
  it("a maintenance page records blocked", async () => {
    mockFetch(() => html("<html><title>Manutenção programada | CMVM</title></html>"));
    await expect(runLoaderWithGuard(swallowingLoader("https://www.example-regulator.test/"))).rejects.toThrow(/maintenance/);
  });
  it("a loader that throws on a 403 is reported as blocked with the loader error kept", async () => {
    mockFetch(() => html("denied", 403));
    const loader = async () => { const r = await fetch("https://www.example-regulator.test/x"); if (!r.ok) throw new Error(`request failed ${r.status}`); return []; };
    await expect(runLoaderWithGuard(loader)).rejects.toThrow(/\[blocked\].*request failed 403/);
  });
  it("an empty but valid listing is verified", async () => {
    mockFetch(() => html("<html><body><h1>Sanctions</h1><ul class='listing'></ul>" + "x".repeat(40_000) + "</body></html>"));
    const { result } = await runLoaderWithGuard(swallowingLoader("https://www.example-regulator.test/list"));
    expect(result).toEqual([]);
  });
  it("a small valid listing page that merely lists zero results is verified", async () => {
    mockFetch(() => html("<html><body><h1>Enforcement actions</h1><p>No results.</p></body></html>"));
    await expect(runLoaderWithGuard(swallowingLoader("https://www.example-regulator.test/list"))).resolves.toBeDefined();
  });
  it("a redirect answer (DNB sitemap style) counts as fetched", async () => {
    mockFetch(() => new Response("<urlset></urlset>", { status: 301 }));
    await expect(runLoaderWithGuard(swallowingLoader("https://www.example-regulator.test/sitemap.xml"))).resolves.toBeDefined();
  });
  it("one blocked URL does not fail a run whose listing was fetched elsewhere", async () => {
    mockFetch((u) => (u.includes("blocked") ? html("no", 403) : html("<html><body>ok listing</body></html>")));
    const loader = async () => { await fetch("https://a.test/blocked"); await fetch("https://b.test/list"); return ["row"]; };
    await expect(runLoaderWithGuard(loader)).resolves.toMatchObject({ result: ["row"] });
  });
});

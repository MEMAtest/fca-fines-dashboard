import { describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import evidenceHandler from "../api/country-risk/evidence/[iso2].js";

async function invoke(query: Record<string, string>) {
  let code = 200;
  let payload: unknown;
  const headers: Record<string, string> = {};
  const req = { method: "GET", query } as unknown as VercelRequest;
  const res = {
    setHeader(name: string, value: string) { headers[name] = value; },
    status(value: number) { code = value; return this; },
    json(value: unknown) { payload = value; return this; },
    send(value: unknown) { payload = value; return this; },
  } as unknown as VercelResponse;
  await evidenceHandler(req, res);
  return { code, payload, headers };
}

describe("country-risk evidence export API", () => {
  it("downloads JSON and CSV from the same canonical bundle", async () => {
    const json = await invoke({ iso2: "MM", format: "json" });
    expect(json.code).toBe(200);
    expect(json.headers["Content-Disposition"]).toContain("regactions-mm-country-risk-evidence.json");
    expect(json.payload).toMatchObject({ result: { score: 9 }, surface: { fatfAction: { action: "enhanced-due-diligence" } } });
    const csv = await invoke({ iso2: "MM", format: "csv" });
    expect(csv.code).toBe(200);
    expect(csv.headers["Content-Type"]).toContain("text/csv");
    expect(csv.payload).toContain('"fatf-action","enhanced-due-diligence"');
  });

  it("renders a real PDF evidence pack", async () => {
    const response = await invoke({ iso2: "RU", format: "pdf" });
    expect(response.code).toBe(200);
    expect(response.headers["Content-Type"]).toBe("application/pdf");
    expect(Buffer.isBuffer(response.payload)).toBe(true);
    expect((response.payload as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  }, 30_000);

  it("rejects unknown formats and countries", async () => {
    expect((await invoke({ iso2: "GB", format: "xlsx" })).code).toBe(400);
    expect((await invoke({ iso2: "ZZ", format: "json" })).code).toBe(404);
  });
});

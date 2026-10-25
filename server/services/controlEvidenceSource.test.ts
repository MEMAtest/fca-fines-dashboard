import { describe, expect, it } from "vitest";
import { effectiveOfficialCaseSource, extractOfficialSource, fetchOfficialSource, MAX_SOURCE_BYTES, validateOfficialUrl, type Resolver } from "../../scripts/control-evidence/source.js";

const publicResolver: Resolver = async () => ["93.184.216.34"];
const response = (status: number, headers: Record<string, string>, body: string) => new Response(body, { status, headers });

describe("official control evidence source safety", () => {
  it("uses notice_url as the effective source and fails closed instead of falling back", () => {
    expect(effectiveOfficialCaseSource("https://www.fca.org.uk/notice", "https://www.fca.org.uk/archive")).toBe("https://www.fca.org.uk/notice");
    expect(effectiveOfficialCaseSource("", "https://www.fca.org.uk/archive")).toBe("https://www.fca.org.uk/archive");
    expect(() => effectiveOfficialCaseSource("https://example.com/not-an-official-notice", "https://www.fca.org.uk/archive")).toThrow(/Effective case source/);
  });

  it("accepts only approved HTTPS official hosts and public DNS answers", async () => {
    await expect(validateOfficialUrl("https://www.fca.org.uk/news/example", publicResolver)).resolves.toBeInstanceOf(URL);
    await expect(validateOfficialUrl("https://www.cbn.gov.ng/", publicResolver)).resolves.toBeInstanceOf(URL);
    await expect(validateOfficialUrl("https://prod-entitysearchwebapplication.azurewebsites.net/enforcement-actions", publicResolver)).resolves.toBeInstanceOf(URL);
    await expect(validateOfficialUrl("https://example.com/", publicResolver)).rejects.toThrow(/Unapproved/);
    await expect(validateOfficialUrl("https://not-a-regulator.gov.ng/", publicResolver)).rejects.toThrow(/Unapproved/);
    await expect(validateOfficialUrl("http://www.fca.org.uk/", publicResolver)).rejects.toThrow(/HTTPS/);
    await expect(validateOfficialUrl("https://fss.or.kr/", async () => ["127.0.0.1"])).rejects.toThrow(/private/);
    await expect(validateOfficialUrl("https://fss.or.kr/", async () => ["2001:db8::1"])).rejects.toThrow(/private/);
  });

  it("rejects cross-origin redirects and checks every redirect before fetching", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => { calls += 1; return response(302, { location: "https://example.com/steal" }, ""); };
    await expect(fetchOfficialSource("https://www.fca.org.uk/start", { fetchImpl: fakeFetch, resolver: publicResolver })).rejects.toThrow(/Unapproved/);
    expect(calls).toBe(1);
  });

  it("allows same-origin redirects and extracts paragraph-level HTML text", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) return response(302, { location: "/notice" }, "");
      return response(200, { "content-type": "text/html" }, "<html><script>hidden cash</script><h1>NatWest AML action</h1><p>National Westminster Bank Plc failed to monitor cash deposits adequately under its controls.</p></html>");
    };
    const fetched = await fetchOfficialSource("https://www.fca.org.uk/start", { fetchImpl: fakeFetch, resolver: publicResolver });
    const extracted = await extractOfficialSource(fetched);
    expect(fetched.finalUrl).toBe("https://www.fca.org.uk/notice");
    expect(extracted.passages.some((p) => p.locator === "html:p[2]" && p.text.includes("cash deposits"))).toBe(true);
    expect(extracted.passages.some((p) => p.text.includes("hidden cash"))).toBe(false);
    expect(extracted.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("enforces the streamed response byte cap even without Content-Length", async () => {
    const huge = new Uint8Array(MAX_SOURCE_BYTES + 1);
    const fakeFetch: typeof fetch = async () => new Response(huge, { status: 200, headers: { "content-type": "text/html" } });
    await expect(fetchOfficialSource("https://www.fca.org.uk/large", { fetchImpl: fakeFetch, resolver: publicResolver })).rejects.toThrow(/size cap/);
  });

  it("extracts PDF paragraphs through the existing pdftotext binary", async () => {
    const pdf = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 500 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n5 0 obj << /Length 87 >> stream\nBT /F1 12 Tf 40 440 Td (National Westminster Bank Plc failed to monitor cash deposits.) Tj ET\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF`;
    const result = await extractOfficialSource({ bytes: new TextEncoder().encode(pdf), finalUrl: "https://www.fca.org.uk/file.pdf", contentType: "application/pdf" });
    expect(result.passages.some((p) => p.locator.startsWith("pdf:paragraph[") && p.text.includes("National Westminster Bank"))).toBe(true);
  });
});

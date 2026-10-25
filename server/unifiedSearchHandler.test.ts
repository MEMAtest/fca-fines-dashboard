import { beforeEach, describe, expect, it, vi } from "vitest";

const { unsafe } = vi.hoisted(() => ({ unsafe: vi.fn() }));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({ unsafe })),
}));
vi.mock("./db.js", () => ({
  resolveConnectionString: () => "postgres://test.invalid/regactions",
  buildServerlessPostgresOptions: () => ({ max: 1 }),
}));

import handler from "../api/site/unified/search.js";
import { enforcementFinesOnlyPredicate, hasIdentifiedFineWording } from "./services/enforcementOutcomeSql.js";
import { CONTROL_DISCOVERY_REGULATOR_CODES } from "../src/data/controlDiscoveryScope.js";

const readyControlIndex = [{
  taxonomy_version: "2026-10-25.v4",
  scan_as_of: "2026-10-25T00:00:00.000Z",
  indexed_at: "2026-10-25T00:05:00.000Z",
  public_case_count: 100,
  public_max_case_id: "case-100",
  complete: true,
}];

function response() {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockImplementation((body: unknown) => body);
  return res;
}

describe("unified search theme filtering", () => {
  beforeEach(() => {
    unsafe.mockReset();
  });

  it("passes breach categories as a JSON array rather than a JSON-encoded string", async () => {
    unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "0" }]);
    const req = { method: "GET", query: { breachCategory: "FRAUD" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const searchParams = unsafe.mock.calls[0][1];
    expect(searchParams[1]).toEqual(["FRAUD"]);
    expect(searchParams[1]).not.toBe(JSON.stringify(["FRAUD"]));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("constrains monthly chart drill-downs to the selected year and month", async () => {
    unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "0" }]);
    const req = { method: "GET", query: { year: "2025", month: "8" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const [query, searchParams] = unsafe.mock.calls[0];
    expect(query).not.toContain("enforcement_control_summary_matches");
    expect(query).not.toContain("enforcement_control_evidence");
    expect(query).toContain("month_issued");
    expect(searchParams.slice(1, 3)).toEqual([2025, 8]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("uses the same outcome scope for page records and the exact filtered total", async () => {
    unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "247" }]);
    const req = { method: "GET", query: { outcome: "Monetary", regulator: "FCA", year: "2025", limit: "100", offset: "200" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const [recordsSql, recordParams] = unsafe.mock.calls[0];
    const [countSql, countParams] = unsafe.mock.calls[1];
    expect(recordsSql).toContain("requires_amount_review");
    expect(recordsSql).toContain("financial penalty");
    expect(countSql).toContain("requires_amount_review");
    expect(recordParams.slice(0, -2)).toEqual(countParams);
    expect(recordParams.slice(-2)).toEqual([100, 200]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("keeps amount-band drilldowns inside the same bounded, counted query scope", async () => {
    unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "14" }]);
    const req = { method: "GET", query: { amountBand: "100k_1m", regulator: "FCA", limit: "100", offset: "100" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const [recordsSql, recordParams] = unsafe.mock.calls[0];
    const [countSql, countParams] = unsafe.mock.calls[1];
    expect(recordsSql).toContain("trusted_amount_gbp > 100000 AND trusted_amount_gbp <= 1000000");
    expect(countSql).toContain("trusted_amount_gbp > 100000 AND trusted_amount_gbp <= 1000000");
    expect(recordParams.slice(0, -2)).toEqual(countParams);
    expect(recordParams.slice(-2)).toEqual([100, 100]);
  });

  it("uses one fingerprint-current indexed control scope for results and exact filtered totals", async () => {
    unsafe.mockResolvedValueOnce(readyControlIndex).mockResolvedValueOnce([{
      id: "row-1",
      regulator: "FCA",
      firm_individual: "NatWest",
      date_issued: "2025-01-01",
      amount_gbp: 0,
      amount_eur: 0,
      amount_original: 0,
      control_matches: [{ code: "AML_CASH_CONTROLS", basis: "official_passage", passage: "Cash monitoring controls were inadequate.", sourceUrl: "https://www.fca.org.uk/example", contentHash: "sha256:abc", locator: "paragraph 4", respondent: "NatWest", attributionMethod: "same_document_defined_alias:NatWest", date: "2025-04-05T00:00:00.000Z" }],
    }]).mockResolvedValueOnce([{ count: "1" }]);
    const req = { method: "GET", query: { control: "AML_CASH_CONTROLS", limit: "1", offset: "0" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const [recordsSql, recordParams] = unsafe.mock.calls[1];
    const [countSql, countParams] = unsafe.mock.calls[2];
    expect(recordsSql).toContain("enforcement_control_summary_matches");
    expect(recordsSql).toContain("source_field_fingerprints = jsonb_build_object");
    expect(recordsSql).toContain("UPPER(regulator) = ANY");
    expect(recordParams).toContainEqual(CONTROL_DISCOVERY_REGULATOR_CODES);
    expect(recordsSql).toContain("enforcement_control_evidence");
    expect(recordsSql).toContain("review_status = 'approved'");
    expect(recordsSql).toContain("candidate_case.created_at DESC NULLS LAST");
    expect(recordsSql).toContain("approved_evidence.respondent = canonical_case.firm_individual");
    expect(recordsSql).toContain("approved_evidence.source_url = COALESCE(");
    expect(countSql).toContain("enforcement_control_summary_matches");
    expect(countSql).toContain("enforcement_control_evidence");
    expect(countSql).toContain("approved_evidence.respondent = canonical_case.firm_individual");
    expect(recordParams.slice(0, -4)).toEqual(countParams);
    expect(recordParams.slice(-4, -2)).toEqual([["AML_CASH_CONTROLS"], expect.any(String)]);
    expect(recordParams.slice(-2)).toEqual([1, 0]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].results[0].control_matches[0]).toMatchObject({ basis: "official_passage", sourceUrl: "https://www.fca.org.uk/example", contentHash: "sha256:abc", locator: "paragraph 4", respondent: "NatWest", attributionMethod: "same_document_defined_alias:NatWest", date: "2025-04-05T00:00:00.000Z" });
    expect(res.json.mock.calls[0][0].indexing).toMatchObject({ coveragePending: true, publicCaseCount: 100 });
  });

  it("extracts natural control intent and applies monetary filtering only when fines are requested", async () => {
    unsafe.mockResolvedValueOnce(readyControlIndex).mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "0" }]);
    const req = { method: "GET", query: { q: "AML cash fines for NatWest", limit: "10" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const [recordsSql, params] = unsafe.mock.calls[1];
    expect(recordsSql).toContain("enforcement_control_evidence");
    expect(recordsSql).toContain("court fine");
    expect(enforcementFinesOnlyPredicate()).not.toContain("requires_amount_review");
    expect(params).toContainEqual(["AML_CASH_CONTROLS"]);
    expect(params).toContain("%natwest%");
    expect(params.some((value: unknown) => Array.isArray(value) && value.includes("%National Westminster Bank Plc%"))).toBe(true);
    expect(res.json.mock.calls[0][0].filters.outcome).toBe("Fines only");
  });

  it("normalizes control regulator filters and includes BaFin and live UK regulators only", async () => {
    expect(CONTROL_DISCOVERY_REGULATOR_CODES).toContain("BAFIN");
    expect(CONTROL_DISCOVERY_REGULATOR_CODES).toContain("ICO");
    expect(CONTROL_DISCOVERY_REGULATOR_CODES).toContain("PRA");
    expect(CONTROL_DISCOVERY_REGULATOR_CODES).not.toContain("FCA_FINES");

    for (const [inputCode, normalizedCode] of [["BaFin", "BAFIN"], ["ICO", "ICO"], ["PRA", "PRA"]]) {
      unsafe.mockReset().mockResolvedValueOnce(readyControlIndex).mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "0" }]);
      const req = { method: "GET", query: { regulator: inputCode, control: "AML_CASH_CONTROLS" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
      const res = response();

      await handler(req, res);

      const [recordsSql, params] = unsafe.mock.calls[1];
      expect(recordsSql).toContain("UPPER(regulator) = ANY");
      expect(params).toContainEqual([normalizedCode]);
      expect(params).toContainEqual(CONTROL_DISCOVERY_REGULATOR_CODES);
      expect(res.status).toHaveBeenCalledWith(200);
    }
  });

  it("uses UK as a country facet instead of requiring a literal UK text hit", async () => {
    unsafe.mockResolvedValueOnce(readyControlIndex).mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "0" }]);
    const req = { method: "GET", query: { q: "cash failures in UK" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const [recordsSql, params] = unsafe.mock.calls[1];
    expect(recordsSql).toContain("country_code = ANY");
    expect(recordsSql).not.toContain("ILIKE $5");
    expect(params).toContainEqual(["GB"]);
    expect(params).not.toContain("%uk%");
  });

  it("fails closed with 503 when indexed control evidence is unavailable", async () => {
    unsafe.mockRejectedValueOnce(Object.assign(new Error("relation does not exist"), { code: "42P01" }));
    const req = { method: "GET", query: { control: "AML_CASH_CONTROLS" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0]).toMatchObject({ error: "Control evidence is temporarily unavailable" });
  });

  it("fails closed when the summary index is incomplete or on another taxonomy version", async () => {
    for (const state of [
      { ...readyControlIndex[0], complete: false },
      { ...readyControlIndex[0], taxonomy_version: "old-version" },
    ]) {
      unsafe.mockReset();
      unsafe.mockResolvedValueOnce([state]);
      const req = { method: "GET", query: { control: "AML_CASH_CONTROLS" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
      const res = response();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(unsafe).toHaveBeenCalledTimes(1);
    }
  });

  it("does not resolve unknown control codes or broaden them into generic search", async () => {
    const req = { method: "GET", query: { control: "NOT_A_CONTROL" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(unsafe).not.toHaveBeenCalled();
  });

  it("defines fines-only from fine wording, not a monetary amount alone", () => {
    const predicate = enforcementFinesOnlyPredicate();
    expect(predicate).toContain("fine[ds]?");
    expect(predicate).toContain("court fine");
    expect(predicate).not.toContain("trusted_amount_gbp");
    expect(predicate).not.toContain("source_url");
    expect(predicate).not.toContain("notice_url");
    expect(predicate).toContain("no (?:financial |monetary |court )?");
    expect(predicate).toContain("previous|prior|historical|earlier");
    expect(predicate).toContain("potential");
    expect(predicate).toContain("ordered to pay (?:a )?fine");
  });

  it("distinguishes a current fine from redress-only and incidental historical wording", () => {
    expect(hasIdentifiedFineWording({ summary: "The firm repaid customers through redress; no fine was imposed." })).toBe(false);
    expect(hasIdentifiedFineWording({ summary: "A 2021 fine was mentioned in the notice; no fine was imposed for the current action, which required redress only." })).toBe(false);
    expect(hasIdentifiedFineWording({ summary: "The firm was fined £10m for previously undetected failures." })).toBe(true);
    expect(hasIdentifiedFineWording({ summary: "The firm was fined £10m; an earlier fine had addressed separate conduct." })).toBe(true);
    expect(hasIdentifiedFineWording({ summary: "Proceedings allege sanctions screening failures; the firm faces a potential fine of £10 million." })).toBe(false);
    expect(hasIdentifiedFineWording({ summary: "Proceedings allege sanctions screening failures; the firm faces a potential fine of £10 million but was fined £1 million for a separate offence." })).toBe(true);
    expect(hasIdentifiedFineWording({ summary: "The court ordered the firm to pay a fine; it could have faced a higher fine." })).toBe(true);
  });
});

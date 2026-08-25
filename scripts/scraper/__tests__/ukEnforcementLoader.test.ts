import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildUKEnforcementRecords } from "../scrapeUkEnforcement.js";
import {
  buildEnforcementContentHash,
  buildEnforcementIdentityKey,
  buildEnforcementSourceIdentityKey,
} from "../lib/ukEnforcementIdentity.js";

describe("UK enforcement loader", () => {
  it("builds deterministic db-ready records", () => {
    const records = buildUKEnforcementRecords([
      {
        regulator: "PRA",
        regulatorFullName: "Prudential Regulation Authority",
        sourceDomain: "prudential",
        firmIndividual: "Example Bank Limited",
        firmCategory: "Bank",
        amount: 1000,
        currency: "GBP",
        dateIssued: "2026-01-02",
        breachType: "Example breach",
        breachCategories: ["REPORTING"],
        summary: "Example summary",
        noticeUrl: "https://www.bankofengland.co.uk/example",
        sourceUrl: "https://www.bankofengland.co.uk/example",
        sourceWindowNote: "Test note",
      },
    ]);

    expect(records[0]).toMatchObject({
      regulator: "PRA",
      amountGbp: 1000,
      amountEur: 1180,
      yearIssued: 2026,
      monthIssued: 1,
    });
    expect(records[0].id).toMatch(/^PRA-2026-01-02-example-bank-limited-/);
  });

  it("keeps subjects in one shared official document entity-distinct", () => {
    const noticeUrl = "https://www.fca.org.uk/news/press-release-shared-document";
    const common = {
      regulator: "FCA",
      amount: null,
      currency: "GBP",
      dateIssued: "2026-08-12",
      noticeUrl,
    } as const;

    const taylor = { ...common, firmIndividual: "Paul Vincent Taylor" };
    const toni = { ...common, firmIndividual: "Esmeralda Toni" };

    expect(buildEnforcementIdentityKey(taylor)).not.toBe(buildEnforcementIdentityKey(toni));
    expect(buildEnforcementContentHash(taylor)).not.toBe(buildEnforcementContentHash(toni));
    expect(buildEnforcementContentHash(taylor)).toBe(buildEnforcementContentHash(taylor));

    const corrected = { ...taylor, amount: 489000, dateIssued: "2026-08-13" };
    expect(buildEnforcementSourceIdentityKey(corrected)).toBe(
      buildEnforcementSourceIdentityKey(taylor),
    );
    expect(buildEnforcementSourceIdentityKey(taylor)).not.toBe(
      buildEnforcementSourceIdentityKey(toni),
    );
  });

  it("uses a non-destructive forward migration for entity-aware identity", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "migrations/20260825_uk_enforcement_entity_identity.sql"),
      "utf8",
    );

    expect(migration).toContain("source_identity_key");
    expect(migration).toContain("DROP INDEX IF EXISTS uk_enforcement_notice_url_idx");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uk_enforcement_source_identity_idx");
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uk_enforcement_source_identity_idx\s+ON uk_enforcement_actions \(source_identity_key\);/s);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+uk_enforcement_actions/i);
  });

  it("keeps duplicate cleanup and record construction inside the lifecycle catch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/scraper/scrapeUkEnforcement.ts"),
      "utf8",
    );
    const tryStart = source.indexOf("  try {\n    console.log(");
    const cleanup = source.indexOf("removeExistingFcaFineDuplicates(sql, sourceRecords)");
    const build = source.indexOf("buildUKEnforcementRecords(sourceRecords)");

    expect(tryStart).toBeGreaterThanOrEqual(0);
    expect(cleanup).toBeGreaterThan(tryStart);
    expect(build).toBeGreaterThan(tryStart);
  });
});

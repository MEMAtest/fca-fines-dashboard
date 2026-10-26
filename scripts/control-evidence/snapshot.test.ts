import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONTROL_TAXONOMY_VERSION, matchControlEvidence } from "../../src/data/controlTaxonomy.js";
import { attributeRespondentPassages, buildControlEvidenceCandidates, type ControlEvidenceCase } from "../../server/services/controlEvidence.js";
import { extractOfficialSource, type FetchResponse } from "./source.js";
import { MAX_SNAPSHOT_METADATA_BYTES, retainExactSource, validateReviewedSnapshotReplay } from "./snapshot.js";

const respondent = "National Westminster Bank Plc";
const sourceUrl = "https://www.fca.org.uk/news/press-releases/natwest";
const finalUrl = sourceUrl;
const fetchedAt = "2026-10-25T10:00:00.000Z";
const caseRecord: ControlEvidenceCase = {
  publicCaseId: "natwest-case-1", respondent, sourceUrl, summary: null, breachType: null, breachCategories: null,
};
const tempDirs: string[] = [];

async function makeDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "control-evidence-snapshot-"));
  tempDirs.push(dir);
  return dir;
}

function html(alias: string, claim: string, volatile = "") {
  return `<html><body><script>${volatile}</script><p>${respondent} (${alias}) was fined for failures.</p><p>${alias} ${claim}</p></body></html>`;
}

function response(content: string): FetchResponse {
  return { bytes: new TextEncoder().encode(content), finalUrl, contentType: "text/html; charset=utf-8" };
}

async function candidatesFor(source: FetchResponse) {
  const extracted = await extractOfficialSource(source);
  const attributed = attributeRespondentPassages(extracted.passages, respondent);
  const matches = attributed.flatMap((passage) => matchControlEvidence({
    firmIndividual: respondent,
    summary: passage.text,
    breachType: null,
    breachCategories: null,
  }).map((match) => ({ ...match, passage: passage.text })));
  return buildControlEvidenceCandidates({
    caseRecord, sourceHash: extracted.contentHash, passages: attributed, matches,
    taxonomyVersion: CONTROL_TAXONOMY_VERSION, fetchedAt,
  });
}

async function setup() {
  const dir = await makeDir();
  const savedResponse = response(html("NatWest", "did not adequately monitor cash deposits from business customers.", "session=A"));
  const retained = await retainExactSource(savedResponse, sourceUrl, path.join(dir, "source.html"), fetchedAt);
  const rows = await candidatesFor(savedResponse);
  expect(rows.length).toBeGreaterThan(0);
  return { retained, rows, savedResponse };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("reviewed dynamic-source snapshots", () => {
  it("replays only exact reviewed respondent-attributed control passages and audits both hashes", async () => {
    const { retained, rows } = await setup();
    const live = response(html("NatWest", "did not adequately monitor cash deposits from business customers.", "session=B"));
    const audit = await validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows, snapshot: { ...retained, ...retained.metadata }, liveResponse: live,
    });
    expect(audit.originalHash).toBe(rows[0].content_hash);
    expect(audit.liveHash).not.toBe(rows[0].content_hash);
    expect(audit.snapshotUsed).toBe(rows.length);
  });

  it("requires the explicit snapshot opt-in", async () => {
    const { retained, rows } = await setup();
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: false, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows, snapshot: { ...retained, ...retained.metadata }, liveResponse: response("updated source"),
    })).rejects.toThrow(/explicit --allow-reviewed-snapshot/);
  });

  it("rejects a corrupted retained blob before live passage matching", async () => {
    const { retained, rows } = await setup();
    await fs.writeFile(retained.path, "changed bytes", { mode: 0o600 });
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows, snapshot: { ...retained, ...retained.metadata }, liveResponse: response(html("NatWest", "did not adequately monitor cash deposits.")),
    })).rejects.toThrow(/metadata|hash/);
  });

  it("rejects edited reviewed fetch timestamps", async () => {
    const { retained, rows } = await setup();
    const alteredRows = rows.map((row) => ({ ...row, fetched_at: "2026-10-25T10:01:00.000Z" }));
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows: alteredRows, snapshot: { ...retained, ...retained.metadata },
      liveResponse: response(html("NatWest", "did not adequately monitor cash deposits from business customers.")),
    })).rejects.toThrow(/fetch time/);
  });

  it("rejects oversized metadata before reading/parsing it", async () => {
    const { retained, rows } = await setup();
    await fs.writeFile(retained.metadataPath, "x".repeat(MAX_SNAPSHOT_METADATA_BYTES + 1), { mode: 0o600 });
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows, snapshot: { ...retained, ...retained.metadata },
      liveResponse: response(html("NatWest", "did not adequately monitor cash deposits from business customers.")),
    })).rejects.toThrow(/64 KiB cap/);
  });

  it("rejects substantive passage changes even when source origin and content type remain stable", async () => {
    const { retained, rows } = await setup();
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows, snapshot: { ...retained, ...retained.metadata },
      liveResponse: response(html("NatWest", "did not adequately monitor cash withdrawals from business customers.")),
    })).rejects.toThrow(/no longer exactly supports/);
  });

  it("rejects changed document-local alias attribution", async () => {
    const { retained, rows } = await setup();
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows, snapshot: { ...retained, ...retained.metadata },
      liveResponse: response(html("NWB", "did not adequately monitor cash deposits from business customers.")),
    })).rejects.toThrow(/no longer exactly supports/);
  });

  it("rejects a forged respondent-context locator in the reviewed row", async () => {
    const { retained, rows } = await setup();
    const forgedRows = rows.map((row) => ({ ...row, locator: row.locator.replace("html:p[2]", "html:p[99]") }));
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows: forgedRows, snapshot: { ...retained, ...retained.metadata },
      liveResponse: response(html("NatWest", "did not adequately monitor cash deposits from business customers.")),
    })).rejects.toThrow(/exactly reproducible/);
  });

  it("rejects a reviewed attribution-method edit", async () => {
    const { retained, rows } = await setup();
    const alteredRows = rows.map((row) => ({ ...row, attribution_method: "same_document_adjacent_numbered_subject_context" }));
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows: alteredRows, snapshot: { ...retained, ...retained.metadata },
      liveResponse: response(html("NatWest", "did not adequately monitor cash deposits from business customers.")),
    })).rejects.toThrow(/exactly reproducible/);
  });

  it("rejects changed live redirect path and media type", async () => {
    const { retained, rows } = await setup();
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows, snapshot: { ...retained, ...retained.metadata },
      liveResponse: { ...response(html("NatWest", "did not adequately monitor cash deposits from business customers.")), finalUrl: "https://www.fca.org.uk/news/other" },
    })).rejects.toThrow(/URL or content type/);
    await expect(validateReviewedSnapshotReplay({
      allowReviewedSnapshot: true, sourceUrl, caseRecord, taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      rows, snapshot: { ...retained, ...retained.metadata },
      liveResponse: { ...response(html("NatWest", "did not adequately monitor cash deposits from business customers.")), contentType: "application/xhtml+xml" },
    })).rejects.toThrow(/URL or content type/);
  });
});

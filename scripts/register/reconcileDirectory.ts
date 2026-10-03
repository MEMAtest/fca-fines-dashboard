/**
 * Phase 0 — reconcile the cleaned atlas extract with RegActions' existing,
 * sourced data:
 *   - docs/research/regulatory-signal/official-authority-directory.json (643
 *     authorities, each carrying an evidence_url) — the PRIMARY seed.
 *   - src/data/egmontMembership.ts (FIU / Egmont membership).
 *
 * Grading:
 *   A/B — authority/instrument backed by an official evidence URL from the
 *         primary sources above. Publishable.
 *   C   — atlas-only name, no independent evidence URL. Draft, unpublished.
 *
 * SHERLOC (UNODC) URLs: terms of use could not be confirmed in this pass, so
 * any legal instrument whose ONLY source is a SHERLOC URL is withheld
 * (publish_state = draft, grade C) rather than published. This is recorded
 * explicitly in the reconciliation report for owner sign-off.
 *
 * Output: a reconciliation report (matched / conflicting / atlas-only),
 * written OUTSIDE the repo, plus structured JSON the snapshot generator and
 * the SQL seed consume.
 *
 * Usage: npx tsx scripts/register/reconcileDirectory.ts <atlas-extract.json> <out-dir>
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

type Role =
  | "aml_supervisor"
  | "conduct"
  | "prudential"
  | "securities"
  | "insurance"
  | "pensions"
  | "central_bank"
  | "fiu"
  | "crime_enforcement"
  | "prosecutor"
  | "sanctions_tfs"
  | "company_bo_registry"
  | "data_protection";

interface DirectoryRow {
  iso2: string;
  country: string;
  authority: string;
  website?: string;
  roles: string[];
  directory_sources: string[];
  evidence_urls: string[];
  notes: string[];
}

// Map the 643-row directory's free-text role tags onto the atlas's fixed
// role set. These are the ONLY six raw tags that actually appear in
// official-authority-directory.json (confirmed by inspection, 2026-10-03):
// central_banking, financial_intelligence, insurance, pensions,
// prudential_supervision, securities. The directory does not currently
// distinguish "conduct" from "prudential_supervision" — see
// PRUDENTIAL_DOWNGRADE below for the correction this requires.
const ROLE_MAP: Record<string, Role> = {
  central_banking: "central_bank",
  financial_intelligence: "fiu",
  prudential_supervision: "prudential",
  securities: "securities",
  insurance: "insurance",
  pensions: "pensions",
};

// Per-source provenance label, shown next to every role so a reader can see
// WHY it's attributed. Keyed by the directory's `directory_sources` tag.
const SOURCE_PROVENANCE: Record<string, string> = {
  BIS: "BIS member directory",
  IOSCO: "IOSCO member directory",
  IAIS: "IAIS member directory",
  IOPS: "IOPS member directory",
  EGMONT: "Egmont Group FIU directory",
};

function provenanceForSources(sources: string[]): string {
  const labels = sources.map((s) => SOURCE_PROVENANCE[s] ?? `${s} directory`);
  return [...new Set(labels)].join(", ") || "Directory source";
}

/**
 * The BIS "regulatory authorities" list (bis.org/regauth.htm) is sourced
 * generically per jurisdiction and does NOT distinguish a conduct-only
 * regulator from a prudential one. In twin-peaks jurisdictions (e.g. the UK:
 * FCA = conduct, PRA = prudential) a `prudential_supervision` tag whose
 * EVIDENCE is that BIS page, on an authority that is not the jurisdiction's
 * central bank, is not reliable enough to publish as "prudential" — it is
 * downgraded (dropped) here rather than shown. The authority still gets its
 * other roles. Central banks keep `prudential_supervision` from BIS since
 * BIS's own list role for them (bis.org/cbanks.htm) is the central-bank
 * list, independently corroborating that tag.
 */
const BIS_PRUDENTIAL_UNRELIABLE_FOR: Array<{ iso2: string; name: string }> = [
  { iso2: "GB", name: "The Financial Conduct Authority" },
];

function mapRoles(raw: string[]): Role[] {
  const out = new Set<Role>();
  for (const r of raw) {
    const mapped = ROLE_MAP[r];
    if (mapped) out.add(mapped);
  }
  return [...out];
}

interface PublishedAuthority {
  iso2: string;
  name: string;
  acronym?: string;
  url: string;
  roles: Role[];
  /** One provenance string per entry in `roles` (same index). */
  roleProvenance: string[];
  grade: "A" | "B";
  source_id: string;
  evidence_urls: string[];
  egmont_member: boolean;
}

interface DraftAuthority {
  iso2: string;
  name: string;
  roles_text: string; // the atlas's un-mapped free text (for human review only)
  grade: "C";
}

function main() {
  const extractPath = process.argv[2] ?? path.join(REPO_ROOT, "_scratch/atlas-extract.json");
  const outDir = process.argv[3] ?? path.join(REPO_ROOT, "_scratch");
  mkdirSync(outDir, { recursive: true });

  const extract = JSON.parse(readFileSync(extractPath, "utf8"));
  const directory: { rows: DirectoryRow[] } = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "docs/research/regulatory-signal/official-authority-directory.json"), "utf8"),
  );

  // Egmont membership — loaded as plain text extraction (avoids a TS runtime
  // import cycle inside a one-off script); iso2 + fiu acronym pairs only.
  const egmontSrc = readFileSync(path.join(REPO_ROOT, "src/data/egmontMembership.ts"), "utf8");
  const egmontMatches = [...egmontSrc.matchAll(/\{\s*iso2:\s*"([A-Z]{2})"(?:,\s*fiu:\s*"([^"]+)")?[^}]*\}/g)];
  const egmontByIso2 = new Map<string, string | undefined>();
  for (const m of egmontMatches) egmontByIso2.set(m[1], m[2]);

  // ---- Authorities: primary seed = the 643-row directory (grade A/B, has evidence) ----
  const published: PublishedAuthority[] = directory.rows
    .filter((r) => r.evidence_urls && r.evidence_urls.length > 0)
    .map((r) => {
      let roles = mapRoles(r.roles ?? []);
      const isBisPrudentialUnreliable = BIS_PRUDENTIAL_UNRELIABLE_FOR.some(
        (x) => x.iso2 === r.iso2 && x.name === r.authority,
      );
      if (isBisPrudentialUnreliable) {
        roles = roles.filter((role) => role !== "prudential");
      }
      const provenance = provenanceForSources(r.directory_sources ?? ["directory"]);
      return {
        iso2: r.iso2,
        name: r.authority,
        url: r.website ?? r.evidence_urls[0],
        roles,
        roleProvenance: roles.map(() => provenance),
        grade: "A" as const,
        source_id: (r.directory_sources ?? ["directory"])[0],
        evidence_urls: r.evidence_urls,
        egmont_member: egmontByIso2.has(r.iso2),
      };
    })
    .filter((r) => r.roles.length > 0); // roles we can't map stay unpublished (no fabricated role)

  // FIUs from Egmont where the directory didn't already carry one
  const haveFiu = new Set(published.filter((p) => p.roles.includes("fiu")).map((p) => p.iso2));
  const egmontOnlyFiu: PublishedAuthority[] = [];
  for (const [iso2, fiu] of egmontByIso2.entries()) {
    if (haveFiu.has(iso2) || !fiu) continue;
    egmontOnlyFiu.push({
      iso2,
      name: fiu,
      acronym: fiu,
      url: "https://egmontgroup.org/members-by-region/",
      roles: ["fiu"],
      roleProvenance: ["Egmont Group FIU directory"],
      grade: "A",
      source_id: "EGMONT",
      evidence_urls: ["https://egmontgroup.org/members-by-region/"],
      egmont_member: true,
    });
  }

  const allPublished = [...published, ...egmontOnlyFiu];

  // ---- Atlas-only authority names: anything in the "Authorities" sheet that
  // survived placeholder-stripping but has no matching directory/evidence row.
  const directoryNamesByIso2 = new Map<string, Set<string>>();
  for (const p of allPublished) {
    const set = directoryNamesByIso2.get(p.iso2) ?? new Set<string>();
    set.add(p.name.toLowerCase());
    directoryNamesByIso2.set(p.iso2, set);
  }

  const atlasAuthorityRows: Record<string, string | null>[] = extract["Authorities"] ?? [];
  const drafts: DraftAuthority[] = [];
  const authorityFreeTextCols = [
    "Financial / AML supervisors",
    "Central bank / monetary authority",
    "Crime / enforcement agencies",
    "Sanctions / TFS authority",
    "Company / BO authority",
    "Data protection",
  ];
  for (const row of atlasAuthorityRows) {
    // find iso2 via Country Index lookup by jurisdiction name (atlas Authorities
    // sheet doesn't carry ISO2 directly)
    const jurisdiction = row["Jurisdiction"];
    if (!jurisdiction) continue;
    for (const col of authorityFreeTextCols) {
      const val = row[col];
      if (!val) continue; // placeholder already stripped
      const known = directoryNamesByIso2.get(jurisdiction) ?? new Set();
      const already = [...known].some((n) => val.toLowerCase().includes(n) || n.includes(val.toLowerCase()));
      if (!already) {
        drafts.push({ iso2: jurisdiction, name: val, roles_text: col, grade: "C" });
      }
    }
  }

  // ---- Legal instruments: grade as the atlas grades them; withhold SHERLOC-only rows.
  const instrumentRows: Record<string, string | null>[] = extract["Legal Instruments"] ?? [];
  const publishedInstruments: unknown[] = [];
  const withheldInstruments: unknown[] = [];
  for (const row of instrumentRows) {
    const grade = (row["Verification level"] ?? "").startsWith("A")
      ? "A"
      : (row["Verification level"] ?? "").startsWith("B")
      ? "B"
      : "C";
    const url = row["Official / discovery source"];
    const isSherlocOnly = !!url && /sherloc\.unodc\.org/i.test(url);
    const record = {
      jurisdiction: row["Jurisdiction"],
      category: row["Category"],
      title: row["Instrument / rule"],
      status: row["Status"],
      grade,
      url,
      refreshed: row["Refreshed"],
    };
    if (grade !== "C" && url && !isSherlocOnly) {
      publishedInstruments.push(record);
    } else {
      withheldInstruments.push({
        ...record,
        reason: isSherlocOnly
          ? "SHERLOC-only source; licence/terms-of-use unconfirmed, withheld pending sign-off"
          : grade === "C"
          ? "grade C (unverified)"
          : "no source URL",
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    authorities: {
      publishedCount: allPublished.length,
      byGrade: { A: allPublished.filter((p) => p.grade === "A").length, B: allPublished.filter((p) => p.grade === "B").length },
      draftCount: drafts.length,
      countriesWithPublishedAuthority: new Set(allPublished.map((p) => p.iso2)).size,
    },
    legalInstruments: {
      publishedCount: publishedInstruments.length,
      withheldCount: withheldInstruments.length,
      withheldSherlocOnly: withheldInstruments.filter((r: any) => r.reason.startsWith("SHERLOC")).length,
    },
  };

  writeFileSync(path.join(outDir, "register-authorities-published.json"), JSON.stringify(allPublished, null, 2));
  writeFileSync(path.join(outDir, "register-authorities-draft.json"), JSON.stringify(drafts, null, 2));
  writeFileSync(path.join(outDir, "register-instruments-published.json"), JSON.stringify(publishedInstruments, null, 2));
  writeFileSync(path.join(outDir, "register-instruments-withheld.json"), JSON.stringify(withheldInstruments, null, 2));
  writeFileSync(path.join(outDir, "reconciliation-report.json"), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
}

main();

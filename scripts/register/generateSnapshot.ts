/**
 * Phase 1 — generate the committed src/data/globalRegister.ts snapshot from
 * the Phase 0 reconciliation output. Published (grade A/B) rows only.
 *
 * Usage:
 *   npx tsx scripts/register/generateSnapshot.ts \
 *     <register-authorities-published.json> <register-instruments-published.json>
 */
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { AUTHORITY_REGULATOR_MAPPING } from "./authorityRegulatorMapping.js";
import { AUTHORITY_ROLE_OVERRIDES } from "./authorityRoleOverrides.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

interface PublishedAuthority {
  iso2: string;
  name: string;
  acronym?: string;
  url: string;
  roles: string[];
  roleProvenance?: string[];
  grade: "A" | "B";
  source_id: string;
  egmont_member: boolean;
}

function overrideFor(iso2: string, name: string) {
  return AUTHORITY_ROLE_OVERRIDES.find((o) => o.iso2 === iso2 && o.authorityName === name);
}

interface PublishedInstrument {
  jurisdiction: string;
  category: string | null;
  title: string;
  status: string | null;
  grade: "A" | "B" | "C";
  url: string | null;
  refreshed: string | null;
}

function mappingFor(iso2: string, name: string): string | null {
  const hit = AUTHORITY_REGULATOR_MAPPING.find((m) => m.iso2 === iso2 && m.authorityName === name);
  return hit ? hit.regulatorCode : null;
}

function main() {
  const authoritiesPath = process.argv[2] ?? path.join(REPO_ROOT, "_scratch/register-authorities-published.json");
  const instrumentsPath = process.argv[3] ?? path.join(REPO_ROOT, "_scratch/register-instruments-published.json");

  const authorities: PublishedAuthority[] = JSON.parse(readFileSync(authoritiesPath, "utf8"));
  const instrumentsRaw: PublishedInstrument[] = JSON.parse(readFileSync(instrumentsPath, "utf8"));

  // Expand multi-role authority rows into one register row per role, since
  // the schema/UI model one role per row (matches register_authorities).
  type FlatAuthority = {
    iso2: string;
    name: string;
    acronym: string | null;
    url: string;
    role: string;
    roleProvenance: string;
    egmontMember: boolean;
    grade: "A" | "B";
    sourceId: string;
    regactionsRegulatorId: string | null;
  };
  const flatAuthorities: FlatAuthority[] = [];
  for (const a of authorities) {
    // A hand-checked override REPLACES the directory's automatic role set
    // for this specific authority (see authorityRoleOverrides.ts for why).
    const override = overrideFor(a.iso2, a.name);
    const roles = override ? override.roles : a.roles;
    const regulatorId = mappingFor(a.iso2, a.name);
    roles.forEach((role, idx) => {
      const provenance = override
        ? `${override.provenance} (${override.sourceUrl})`
        : a.roleProvenance?.[idx] ?? "Directory source";
      flatAuthorities.push({
        iso2: a.iso2,
        name: a.name,
        acronym: a.acronym ?? null,
        url: override ? override.sourceUrl : a.url,
        role,
        roleProvenance: provenance,
        egmontMember: a.egmont_member,
        grade: a.grade,
        sourceId: a.source_id,
        regactionsRegulatorId: regulatorId,
      });
    });
  }
  flatAuthorities.sort((x, y) => (x.iso2 + x.role + x.name).localeCompare(y.iso2 + y.role + y.name));

  const instruments = instrumentsRaw
    .filter((i) => i.grade === "A" || i.grade === "B")
    .map((i) => ({
      iso2Lookup: i.jurisdiction, // jurisdiction NAME in the atlas; resolved by UI via countries.ts
      category: i.category,
      title: i.title,
      status: i.status,
      grade: i.grade as "A" | "B",
      url: i.url,
      refreshed: i.refreshed,
    }))
    .sort((x, y) => (x.iso2Lookup + x.title).localeCompare(y.iso2Lookup + y.title));

  const reviewedAt = new Date().toISOString().slice(0, 10);
  const payload = { authorities: flatAuthorities, instruments };
  const sha = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const countriesWithAuthority = new Set(flatAuthorities.map((a) => a.iso2)).size;

  const out = `/**
 * GENERATED FILE — do not hand-edit. Produced by
 * scripts/register/generateSnapshot.ts from the Phase 0 reconciliation
 * output (importAtlas.ts + reconcileDirectory.ts), itself seeded from
 * docs/research/regulatory-signal/official-authority-directory.json (643
 * sourced authorities) and src/data/egmontMembership.ts.
 *
 * Published (grade A/B) rows ONLY. Grade-C atlas drafts are never emitted
 * here — a missing role must render as "Not yet mapped — source check
 * pending" in the UI, never as an absence-implies-clean state.
 *
 * ${flatAuthorities.length} authority rows across ${countriesWithAuthority} countries;
 * ${instruments.length} legal-instrument rows.
 */

import type { RegisterAuthority, RegisterLegalInstrument, RegisterAuthorityRole } from "./globalRegisterTypes.js";
import { COUNTRIES } from "./countries.js";

export const GLOBAL_REGISTER_REVIEWED = "${reviewedAt}";
export const GLOBAL_REGISTER_SHA256 = "${sha}";

export const GLOBAL_REGISTER_AUTHORITIES: RegisterAuthority[] = ${JSON.stringify(
    flatAuthorities.map((a) => ({
      iso2: a.iso2,
      name: a.name,
      acronym: a.acronym ?? undefined,
      url: a.url,
      role: a.role,
      egmontMember: a.egmontMember,
      grade: a.grade,
      sourceId: a.sourceId,
      regactionsRegulatorId: a.regactionsRegulatorId,
      roleProvenance: a.roleProvenance,
    })),
    null,
    2,
  )};

// Legal instruments are keyed by the atlas's jurisdiction NAME (the atlas
// sheet does not carry ISO2); resolved to iso2 below via countries.ts name
// matching at module load, once, so pages key purely on iso2 like every
// other register table.
const JURISDICTION_NAME_TO_ISO2 = new Map<string, string>(
  COUNTRIES.map((c) => [c.name.toLowerCase(), c.iso2]),
);

function resolveJurisdictionNameToIso2(name: string): string | null {
  // countries.ts is the canonical name source; match case-insensitively on
  // the canonical name. Unmatched names are dropped (never fabricated).
  return JURISDICTION_NAME_TO_ISO2.get(name.toLowerCase()) ?? null;
}

const INSTRUMENTS_BY_NAME: Array<{
  jurisdictionName: string;
  category: string | null;
  title: string;
  status: string | null;
  grade: "A" | "B";
  url: string | null;
  refreshed: string | null;
}> = ${JSON.stringify(
    instruments.map((i) => ({
      jurisdictionName: i.iso2Lookup,
      category: i.category,
      title: i.title,
      status: i.status,
      grade: i.grade,
      url: i.url,
      refreshed: i.refreshed,
    })),
    null,
    2,
  )};

export const GLOBAL_REGISTER_INSTRUMENTS: RegisterLegalInstrument[] = INSTRUMENTS_BY_NAME.map((row) => ({
  iso2: resolveJurisdictionNameToIso2(row.jurisdictionName),
  category: row.category,
  title: row.title,
  status: row.status,
  grade: row.grade,
  url: row.url ?? "",
  refreshed: row.refreshed,
})).filter((r): r is RegisterLegalInstrument => !!r.iso2);

export function getAuthoritiesForCountry(iso2: string): RegisterAuthority[] {
  const upper = iso2.toUpperCase();
  return GLOBAL_REGISTER_AUTHORITIES.filter((a) => a.iso2 === upper);
}

export function getInstrumentsForCountry(iso2: string): RegisterLegalInstrument[] {
  const upper = iso2.toUpperCase();
  return GLOBAL_REGISTER_INSTRUMENTS.filter((i) => i.iso2 === upper);
}

export function getAuthorityByRole(iso2: string, role: RegisterAuthorityRole): RegisterAuthority | undefined {
  return getAuthoritiesForCountry(iso2).find((a) => a.role === role);
}

/** ISO2 codes of every country with at least one published authority row. */
export const REGISTER_COVERED_ISO2: string[] = [...new Set(GLOBAL_REGISTER_AUTHORITIES.map((a) => a.iso2))].sort();
`;

  writeFileSync(path.join(REPO_ROOT, "src/data/globalRegister.ts"), out);
  console.log(`Wrote src/data/globalRegister.ts: ${flatAuthorities.length} authority rows, ${countriesWithAuthority} countries, ${instruments.length} instruments. SHA ${sha.slice(0, 12)}…`);
}

main();

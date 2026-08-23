#!/usr/bin/env npx tsx
/**
 * Ingest the Open Ownership beneficial-ownership register map.
 *
 * Source: https://www.openownership.org/en/map/
 * Licence: CC BY 4.0 (attribution only). This is the reason we can use it and
 * the Tax Justice Network Financial Secrecy Index — which measures adjacent
 * ground and carries far more weight in the Basel AML Index — we cannot: FSI is
 * CC BY-NC-SA, so NonCommercial rules it out for a commercial product and
 * ShareAlike would pull any derived score under the same licence.
 *
 * What the export contains, and what it does not: every row is a LIVE register.
 * The map also tracks "planned" and "implementing" countries, and those do not
 * appear in this CSV. Open Ownership also states the map "is drawn from
 * publicly-available sources and may not be comprehensive for all countries".
 *
 * So a country's absence means "no live register identified in this snapshot",
 * NOT "this country has no register". That distinction is carried through to
 * the wording on the page, and it is why absence is scored as high risk but
 * never described as a finding of fact.
 *
 *   npx tsx scripts/country-risk/ingest-open-ownership.ts            # dry run
 *   npx tsx scripts/country-risk/ingest-open-ownership.ts --write
 */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "src", "data", "beneficialOwnershipRegisterData.ts");
const SOURCE_PAGE = "https://www.openownership.org/en/map/";
const CSV_URL = "https://www.openownership.org/en/map/oo_all_country_data.csv";

/** Access classes Open Ownership records, verified against the live export. */
const KNOWN_ACCESS = new Set([
  "General public",
  "Obliged entities",
  "Competent authorities",
  "Foreign competent authorities",
  "Non-competent authorities",
  "Non-obliged entities",
  "Civil society",
  "Registrar",
]);

/** Minimal RFC4180 parser: the export quotes fields containing commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (ch !== "\r") field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * The source mostly writes YYYY or YYYY-MM, but Saint Helena's register is
 * recorded as "2025/06". Normalise the separator rather than letting one
 * inconsistent row through to consumers that validate the format.
 */
function normaliseLaunched(raw: string | undefined): string | null {
  const value = (raw ?? "").trim().replace(/\//g, "-");
  if (!value) return null;
  if (!/^\d{4}(-\d{2})?$/.test(value)) {
    throw new Error(`Unrecognised "Register launched" value: ${JSON.stringify(raw)}`);
  }
  return value;
}

async function main() {
  const write = process.argv.includes("--write");
  const response = await fetch(CSV_URL, { headers: { "user-agent": "RegActions/country-risk" } });
  if (!response.ok) throw new Error(`Open Ownership CSV returned ${response.status}`);
  const text = await response.text();
  const sha256 = createHash("sha256").update(text).digest("hex");

  const [header, ...body] = parseCsv(text);
  const col = (name: string) => {
    const index = header.findIndex((h) => h.trim() === name);
    if (index < 0) throw new Error(`Missing expected column "${name}". Columns: ${header.join(", ")}`);
    return index;
  };
  const iIso = col("ISO2");
  const iStage = col("Stage");
  const iName = col("Name of register");
  const iLink = col("Link");
  const iScope = col("Scope");
  const iLaunched = col("Register launched");
  const iAccess = col("Who can access");

  // Thirteen countries run more than one register and they differ in who may
  // read them: the UK's PSC register is public while its Trust Registration is
  // not, and the Netherlands opens its trusts register to obliged entities but
  // not its main UBO register. Keyed assignment silently kept whichever row
  // came last, so keep them all and let the risk mapping decide.
  const records: Record<string, { iso2: string; registers: unknown[] }> = {};
  const unknownAccess = new Set<string>();
  for (const row of body) {
    const iso2 = (row[iIso] ?? "").trim().toUpperCase();
    if (!iso2) continue;
    // Every row in this export is a live register; refuse silently changing
    // meaning if Open Ownership ever widens it.
    const stage = (row[iStage] ?? "").trim();
    if (stage !== "Live register") {
      throw new Error(`Unexpected stage "${stage}" for ${iso2}; the export is expected to contain live registers only.`);
    }
    const access = (row[iAccess] ?? "")
      .split("|")
      .map((token) => token.trim())
      .filter(Boolean);
    access.forEach((token) => { if (!KNOWN_ACCESS.has(token)) unknownAccess.add(token); });
    (records[iso2] ??= { iso2, registers: [] }).registers.push({
      register: (row[iName] ?? "").trim() || null,
      url: (row[iLink] ?? "").trim() || null,
      scope: (row[iScope] ?? "").trim() || null,
      launched: normaliseLaunched(row[iLaunched]),
      access: [...new Set(access)].sort(),
    });
  }

  if (unknownAccess.size > 0) {
    // A new access class changes what the risk ladder means, so stop rather
    // than quietly bucketing it as "no CDD access".
    throw new Error(
      `Unrecognised access classes: ${[...unknownAccess].join(", ")}. Review accessRisk() before re-running.`,
    );
  }

  const ordered = Object.keys(records).sort();
  const lines = ordered.map((iso2) => `  ${JSON.stringify(iso2)}: ${JSON.stringify(records[iso2])},`);
  const registerCount = ordered.reduce((sum, iso2) => sum + records[iso2].registers.length, 0);
  const file = `/** GENERATED by scripts/country-risk/ingest-open-ownership.ts. Do not edit by hand. */
export interface BeneficialOwnershipRegisterEntry {
  register: string | null;
  url: string | null;
  scope: string | null;
  launched: string | null;
  /** Access classes recorded by Open Ownership, de-duplicated and sorted. */
  access: string[];
}

export interface BeneficialOwnershipRegisterRecord {
  iso2: string;
  /** A country may run several: a companies register, a trusts register, an overseas-entities register. */
  registers: BeneficialOwnershipRegisterEntry[];
}

export const BO_REGISTER_SOURCE = ${JSON.stringify(SOURCE_PAGE)};
export const BO_REGISTER_SOURCE_CSV = ${JSON.stringify(CSV_URL)};
export const BO_REGISTER_LICENCE = "CC BY 4.0 (Open Ownership)";
export const BO_REGISTER_RETRIEVED_AT = ${JSON.stringify(new Date().toISOString())};
export const BO_REGISTER_SHA256 = ${JSON.stringify(sha256)};
/**
 * Live registers only. Countries Open Ownership records as "planned" or
 * "implementing" are NOT in this export, and the map may not be comprehensive,
 * so absence means "no live register identified" rather than "no register".
 */
export const BO_REGISTER_RECORDS: Record<string, BeneficialOwnershipRegisterRecord> = {
${lines.join("\n")}
};
`;

  console.log(`Parsed ${registerCount} live registers across ${ordered.length} jurisdictions; sha256 ${sha256.slice(0, 16)}...`);
  if (!write) {
    console.log("Dry run. Re-run with --write to update src/data/beneficialOwnershipRegisterData.ts");
    return;
  }
  await writeFile(OUT, file, "utf8");
  console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
  console.error("Open Ownership ingest failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

/**
 * Sanctions list parsers for the global register ("atlas"), Phase 2.
 *
 * Ported from nasara-connect-grc `src/lib/financial-crime/sanctions-connectors.ts`
 * (parser logic only — the screening-engine integration, caching and PEP
 * plumbing in the original file do not apply here). These parsers are
 * deliberately regex/string based (not a full XML parser) matching the
 * upstream implementation, which is tolerant of the real feed formats.
 *
 * IMPORTANT (plan "Store aggregates only"): this module outputs ONLY
 * per-country aggregate counts and programme names. It never stores or
 * exposes an individual designated person's name, DOB or other details —
 * those live only transiently in memory while a GitHub Actions run computes
 * the aggregate, and are discarded before anything is written to the DB.
 */

import { createHash } from "node:crypto";
import { resolveCountry } from "../../../src/data/countries.js";

export type SanctionsRegimeCode = "un" | "ofac" | "uk" | "eu";

export interface RawSanctionsEntry {
  id: string;
  name: string;
  type: "individual" | "company";
  countries: string[]; // raw country tokens as they appear in the source feed
  programmes: string[];
}

export interface CountryRegimeAggregate {
  regimeCode: SanctionsRegimeCode;
  iso2: string;
  designationCount: number;
  programmes: string[];
}

export interface SanctionsFeedDefinition {
  code: SanctionsRegimeCode;
  sourceCode: string; // matches register_sources.code
  title: string;
  sourceUrl: string;
  licence: string;
  licenceTermsUrl: string;
  defaultMachineReadableUrl: string;
}

export const SANCTIONS_FEEDS: Record<SanctionsRegimeCode, SanctionsFeedDefinition> = {
  un: {
    code: "un",
    sourceCode: "un-consolidated",
    title: "UN Consolidated Sanctions List",
    sourceUrl: "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list",
    licence: "Public UN documentation; free use with attribution",
    licenceTermsUrl: "https://www.un.org/en/about-us/terms-of-use",
    defaultMachineReadableUrl: "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
  },
  ofac: {
    code: "ofac",
    sourceCode: "ofac-sdn",
    title: "OFAC Specially Designated Nationals List",
    sourceUrl: "https://ofac.treasury.gov/sanctions-list-service",
    licence: "US Government work; public domain",
    licenceTermsUrl: "https://www.usa.gov/government-works",
    defaultMachineReadableUrl:
      "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML",
  },
  uk: {
    code: "uk",
    sourceCode: "uk-sanctions-list",
    title: "UK Sanctions List (FCDO)",
    sourceUrl: "https://www.gov.uk/government/publications/the-uk-sanctions-list",
    licence: "Open Government Licence v3.0",
    licenceTermsUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    defaultMachineReadableUrl: "https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml",
  },
  eu: {
    code: "eu",
    sourceCode: "eu-financial-sanctions",
    title: "EU Financial Sanctions Dataset",
    sourceUrl:
      "https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions?locale=en",
    licence: "EU Open Data reuse policy (free reuse with attribution)",
    licenceTermsUrl: "https://data.europa.eu/en/legal-notice",
    defaultMachineReadableUrl: "builtin:eu-financial-sanctions",
  },
};

// ---------------------------------------------------------------------------
// XML helpers (ported verbatim from the Nasara connector)
// ---------------------------------------------------------------------------

function decodeXmlValue(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagValues(block: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const matches: string[] = [];
  for (const match of block.matchAll(pattern)) {
    const value = decodeXmlValue(match[1]);
    if (value) matches.push(value);
  }
  return matches;
}

function getFirstTagValue(block: string, tag: string): string | null {
  return getTagValues(block, tag)[0] ?? null;
}

function getBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  return Array.from(xml.matchAll(pattern), (match) => match[1] ?? "");
}

function getNestedTagValues(block: string, parentTag: string, childTag: string): string[] {
  return getBlocks(block, parentTag).flatMap((nestedBlock) => getTagValues(nestedBlock, childTag));
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const clean = decodeXmlValue(value);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(clean);
  }
  return normalized;
}

function buildOfacName(block: string): string | null {
  const firstName = getFirstTagValue(block, "firstName");
  const lastName = getFirstTagValue(block, "lastName");
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return joined || lastName || firstName;
}

// ---------------------------------------------------------------------------
// Per-regime parsers — each returns RawSanctionsEntry[] held only in memory.
// ---------------------------------------------------------------------------

export function parseUnSanctionsXml(xml: string): RawSanctionsEntry[] {
  const parseBlock = (block: string, type: "individual" | "company"): RawSanctionsEntry | null => {
    const reference = getFirstTagValue(block, "REFERENCE_NUMBER") ?? getFirstTagValue(block, "DATAID");
    const nameParts = uniqueValues([
      ...getTagValues(block, "FIRST_NAME"),
      ...getTagValues(block, "SECOND_NAME"),
      ...getTagValues(block, "THIRD_NAME"),
      ...getTagValues(block, "FOURTH_NAME"),
    ]);
    const primaryName = nameParts.join(" ").trim() || getFirstTagValue(block, "NAME_ORIGINAL_SCRIPT");
    if (!primaryName) return null;
    const countries = uniqueValues([
      ...getTagValues(block, "COUNTRY"),
      ...getNestedTagValues(block, "NATIONALITY", "VALUE"),
    ]).slice(0, 8);
    return {
      id: `un-${reference ?? primaryName.toLowerCase().replace(/\s+/g, "-")}`,
      name: primaryName,
      type,
      countries,
      programmes: uniqueValues([
        getFirstTagValue(block, "UN_LIST_TYPE"),
        getFirstTagValue(block, "COMMENTS1"),
      ]),
    };
  };
  const entries = [
    ...getBlocks(xml, "INDIVIDUAL").map((b) => parseBlock(b, "individual")),
    ...getBlocks(xml, "ENTITY").map((b) => parseBlock(b, "company")),
  ];
  return entries.filter((e): e is RawSanctionsEntry => e !== null);
}

export function parseOfacSanctionsXml(xml: string): RawSanctionsEntry[] {
  const entries = getBlocks(xml, "sdnEntry").map((block) => {
    const name = buildOfacName(block);
    if (!name) return null;
    const sdnType = (getFirstTagValue(block, "sdnType") ?? "Individual").toLowerCase();
    return {
      id: `ofac-${getFirstTagValue(block, "uid") ?? name.toLowerCase().replace(/\s+/g, "-")}`,
      name,
      type: sdnType === "individual" ? "individual" : ("company" as const),
      countries: uniqueValues(getTagValues(block, "country")),
      programmes: uniqueValues(getTagValues(block, "program")),
    };
  });
  return entries.filter((e): e is RawSanctionsEntry => e !== null);
}

export function parseUkSanctionsXml(xml: string): RawSanctionsEntry[] {
  const entries = getBlocks(xml, "Designation").map((block) => {
    const nameBlocks = getBlocks(block, "Name");
    const primaryName =
      nameBlocks
        .map((nb) => ({ name: getFirstTagValue(nb, "Name6"), type: getFirstTagValue(nb, "NameType") }))
        .find((n) => n.type?.toLowerCase().includes("primary"))?.name ?? getFirstTagValue(block, "Name6");
    if (!primaryName) return null;
    const subjectType = (getFirstTagValue(block, "IndividualEntityShip") ?? "Entity").toLowerCase();
    return {
      id: `uk-${getFirstTagValue(block, "UniqueID") ?? primaryName.toLowerCase().replace(/\s+/g, "-")}`,
      name: primaryName,
      type: subjectType === "individual" ? "individual" : ("company" as const),
      countries: uniqueValues(getTagValues(block, "AddressCountry")),
      programmes: uniqueValues([
        getFirstTagValue(block, "RegimeName"),
        getFirstTagValue(block, "DesignationSource"),
      ]),
    };
  });
  return entries.filter((e): e is RawSanctionsEntry => e !== null);
}

export function parseEuSanctionsXml(xml: string): RawSanctionsEntry[] {
  if (!xml.includes("<sanctionEntity")) return [];
  const entries = getBlocks(xml, "sanctionEntity").map((block) => {
    const primaryName = getFirstTagValue(block, "subjectName") ?? getFirstTagValue(block, "nameAlias");
    if (!primaryName) return null;
    const designationType = (getFirstTagValue(block, "subjectType") ?? "enterprise").toLowerCase();
    return {
      id: `eu-${getFirstTagValue(block, "euReferenceNumber") ?? primaryName.toLowerCase().replace(/\s+/g, "-")}`,
      name: primaryName,
      type: designationType.includes("person") ? "individual" : ("company" as const),
      countries: uniqueValues(getTagValues(block, "countryDescription")),
      programmes: uniqueValues([getFirstTagValue(block, "regulationType")]),
    };
  });
  return entries.filter((e): e is RawSanctionsEntry => e !== null);
}

export function parseSanctionsFeed(code: SanctionsRegimeCode, xml: string): RawSanctionsEntry[] {
  switch (code) {
    case "un":
      return parseUnSanctionsXml(xml);
    case "ofac":
      return parseOfacSanctionsXml(xml);
    case "uk":
      return parseUkSanctionsXml(xml);
    case "eu":
      return parseEuSanctionsXml(xml);
  }
}

// ---------------------------------------------------------------------------
// Aggregation — resolves each entry's country tokens to ISO2 via the
// canonical resolveCountry(), then rolls up counts and programme names per
// (regime, country). Individual entries are discarded after this step.
// ---------------------------------------------------------------------------

export function aggregateByCountry(
  regimeCode: SanctionsRegimeCode,
  entries: RawSanctionsEntry[],
): CountryRegimeAggregate[] {
  const byIso2 = new Map<string, { count: number; programmes: Set<string> }>();
  for (const entry of entries) {
    const matchedIso2 = new Set<string>();
    for (const token of entry.countries) {
      const country = resolveCountry(token);
      if (country) matchedIso2.add(country.iso2);
    }
    for (const iso2 of matchedIso2) {
      const bucket = byIso2.get(iso2) ?? { count: 0, programmes: new Set<string>() };
      bucket.count += 1;
      for (const programme of entry.programmes) bucket.programmes.add(programme);
      byIso2.set(iso2, bucket);
    }
  }
  return Array.from(byIso2.entries())
    .map(([iso2, bucket]) => ({
      regimeCode,
      iso2,
      designationCount: bucket.count,
      programmes: Array.from(bucket.programmes).sort(),
    }))
    .sort((a, b) => a.iso2.localeCompare(b.iso2));
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Diffs the current aggregate against the previous snapshot for one
 * (regime, country) pair and produces a change-log summary line, or null if
 * nothing changed. Matches the plan's example format: "OFAC: +3 designations
 * linked to RU, programme RUSSIA-EO14024".
 */
export function diffAggregate(
  current: CountryRegimeAggregate,
  previous: CountryRegimeAggregate | null,
): string | null {
  const regimeLabel = SANCTIONS_FEEDS[current.regimeCode].title.split(" ")[0].toUpperCase();
  const previousCount = previous?.designationCount ?? 0;
  const delta = current.designationCount - previousCount;
  if (delta === 0) return null;
  const sign = delta > 0 ? "+" : "";
  const newProgrammes = current.programmes.filter((p) => !previous?.programmes.includes(p));
  const programmeNote = newProgrammes.length > 0 ? `, programme ${newProgrammes.join(", ")}` : "";
  return `${regimeLabel}: ${sign}${delta} designation${Math.abs(delta) === 1 ? "" : "s"} linked to ${current.iso2}${programmeNote}`;
}

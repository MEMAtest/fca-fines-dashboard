/**
 * Beneficial-ownership (BO) register availability, per jurisdiction.
 *
 * A licence-clean framework signal for country pages: does the jurisdiction run
 * a live beneficial-ownership register, and can the general public access it, or
 * only competent authorities / obliged entities?
 *
 * Source & licence — Open Ownership "Worldwide action on beneficial ownership
 * transparency" map (CC BY 4.0):
 *   Map:  https://www.openownership.org/en/map/
 *   Data: https://www.openownership.org/en/map/oo_all_country_data.csv
 *   Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
 *            https://creativecommons.org/licenses/by/4.0/
 *
 * This file used to hold its own hand-compiled table, transcribed from the same
 * download on 17 July 2026. It is now DERIVED from the scripted snapshot in
 * beneficialOwnershipRegisterData.ts, refreshed by
 * scripts/country-risk/ingest-open-ownership.ts. Two independently maintained
 * copies of one source can only drift apart, and the transcription had already
 * flattened the multi-register countries down to a single row.
 *
 * The published meaning is unchanged. "General public" among a register's
 * audiences resolves to live-public, anything narrower to live-restricted, and
 * the most-open register wins where a country runs several. That is a stricter
 * test than the one the risk ladder in beneficialOwnershipRegisters.ts uses,
 * which treats obliged-entity access as equivalent to public access for
 * customer due diligence, and deliberately so: this flag reports what the
 * source says, the ladder interprets it.
 *
 * Countries the source does not list are not confirmed as running a live
 * register, which is an absence of evidence rather than a finding.
 */
import {
  BO_REGISTER_RECORDS,
  BO_REGISTER_RETRIEVED_AT,
} from "./beneficialOwnershipRegisterData.js";

export const BO_REGISTERS_SOURCE_URL = "https://www.openownership.org/en/map/";

export const BO_REGISTERS_DATA_URL =
  "https://www.openownership.org/en/map/oo_all_country_data.csv";

export const BO_REGISTERS_LICENCE = "CC BY 4.0";
export const BO_REGISTERS_LICENCE_URL =
  "https://creativecommons.org/licenses/by/4.0/";

/** Date the snapshot was retrieved, from the generated data file. */
export const BO_REGISTERS_REVIEWED = BO_REGISTER_RETRIEVED_AT.slice(0, 10);

export type BoRegisterStatus = "live-public" | "live-restricted";

export interface BoRegister {
  iso2: string;
  status: BoRegisterStatus;
  /** Year (or YYYY-MM) the register launched, where the source records it. */
  since?: string;
}

/** Earliest launch year the source records across a country's registers. */
function earliestLaunch(launches: Array<string | null>): string | undefined {
  const known = launches.filter((value): value is string => Boolean(value)).sort();
  return known[0];
}

/**
 * Open Ownership lists Greenland and Saint Helena, which are not jurisdictions
 * RegActions covers. The July transcription silently omitted them; deriving from
 * the source surfaced them, and the existing resolve-against-countries.ts test
 * caught it. Filter here rather than in the generated data, which stays faithful
 * to what the source publishes.
 */
const UNCOVERED = new Set(["GL", "SH"]);

export const BO_REGISTERS: BoRegister[] = Object.values(BO_REGISTER_RECORDS)
  .filter((record) => !UNCOVERED.has(record.iso2))
  .map((record) => {
    const anyPublic = record.registers.some((entry) => entry.access.includes("General public"));
    const since = earliestLaunch(record.registers.map((entry) => entry.launched));
    return {
      iso2: record.iso2,
      status: (anyPublic ? "live-public" : "live-restricted") as BoRegisterStatus,
      ...(since ? { since } : {}),
    };
  })
  .sort((left, right) => left.iso2.localeCompare(right.iso2));

const BY_ISO2 = new Map(BO_REGISTERS.map((register) => [register.iso2, register]));

export function getBoRegister(iso2: string): BoRegister | undefined {
  return BY_ISO2.get(iso2.toUpperCase());
}

/** Short human label for the BO register status ("Public" | "Restricted"). */
export function boRegisterLabel(status: BoRegisterStatus): string {
  return status === "live-public" ? "Public" : "Restricted";
}

/**
 * One-line framework-signal value for a jurisdiction's BO register, e.g.
 * "Public (live since 2016)" / "Restricted access" / "None identified".
 * Deterministic and derived only from the sourced data (never invented).
 */
export function boRegisterSignal(iso2: string): string {
  const reg = getBoRegister(iso2);
  if (!reg) return "None identified";
  const label = boRegisterLabel(reg.status);
  return reg.since ? `${label} (live since ${reg.since})` : `${label} (live)`;
}

/** ISO2 codes of all jurisdictions with a live BO register in the source. */
export function boRegisterIso2(): string[] {
  return BO_REGISTERS.map((r) => r.iso2);
}

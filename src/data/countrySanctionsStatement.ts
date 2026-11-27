/**
 * One plain, definite sanctions statement per country, used everywhere the
 * site talks about sanctions (decision text, FAQ, prerendered body, rail).
 *
 * Three parts, each said once:
 *   headline  - is the country itself under UN, UK, EU or US sanctions, and from whom
 *   screening - the one standing reminder to screen named people and companies
 *   domestic  - the country's own sanctions laws, only where we hold a sourced entry
 */
import type { CountrySanctions, SanctionsImposer, SanctionsTier } from "./sanctionsStatus.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "./sanctionsApprovedData.js";
import { SANCTIONS_CATALOGUE_REVIEWED_AS_OF } from "./sanctionsRegimeCandidates.js";
import { getDomesticSanctionsRegime, type DomesticSanctionsRegime } from "./domesticSanctionsRegimes.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function sanctionsCheckedLabel(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  const mon = m ? MONTHS[Number(m) - 1] : undefined;
  if (d && mon) return `${Number(d)} ${mon} ${y}`;
  if (mon) return `${mon} ${y}`;
  return y;
}

const IMPOSER_ORDER: SanctionsImposer[] = ["OFAC", "UK", "EU", "UN"];
const IMPOSER_LABEL: Record<SanctionsImposer, string> = { OFAC: "US", UK: "UK", EU: "EU", UN: "UN" };
const TIER_ORDER: SanctionsTier[] = ["comprehensive", "sectoral", "targeted"];

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export interface SanctionsStatementInput {
  name: string;
  iso2: string;
  sanctions?: CountrySanctions;
  coverageComplete: boolean;
  /** Date the sanctions data was checked (YYYY-MM-DD), taken from the data. */
  checkedDate: string;
}

export interface SanctionsStatement {
  state: "none" | "comprehensive" | "sectoral" | "targeted" | "incomplete";
  /** Part a: sanctions ON the country. */
  headline: string;
  /** Part b: the single screening reminder. */
  screening: string;
  /** Part c: the country's own regime, or null when we hold no entry. */
  domestic: string | null;
  domesticRegime: DomesticSanctionsRegime | undefined;
  checked: string;
  /** The headline without the country name or date, e.g. "not under UN, UK, EU or US country sanctions". */
  predicate: string;
  /** Short value for compact tiles. */
  short: string;
  /** Who imposes it, e.g. "US, UK and EU"; empty when none. */
  imposers: string;
}

export const SCREENING_LINE =
  "Screening individual people and companies against sanctions lists is still required.";

export function buildSanctionsStatement(input: SanctionsStatementInput): SanctionsStatement {
  const { name, iso2, sanctions, coverageComplete } = input;
  const checked = sanctionsCheckedLabel(input.checkedDate);
  const regime = getDomesticSanctionsRegime(iso2);
  const domestic = regime
    ? `${name}'s own sanctions: ${regime.laws.join(", ")}. Official list: ${regime.listName}.`
    : null;

  const base = { screening: SCREENING_LINE, domestic, domesticRegime: regime, checked };

  if (!coverageComplete) {
    return {
      ...base,
      state: "incomplete",
      headline: `Our check of UN, UK, EU and US country sanctions on ${name} is not complete, so we make no statement either way.`,
      predicate: "not fully checked against UN, UK, EU and US country sanctions",
      short: "Check not complete",
      imposers: "",
    };
  }

  const programs = sanctions?.programs ?? [];
  if (programs.length === 0) {
    return {
      ...base,
      state: "none",
      headline: `${name} is not under UN, UK, EU or US country sanctions (checked ${checked}).`,
      predicate: "not under UN, UK, EU or US country sanctions",
      short: "Not under UN, UK, EU or US country sanctions",
      imposers: "",
    };
  }

  const tierOf = (imposer: SanctionsImposer): SanctionsTier | undefined => {
    const tiers = programs.filter((p) => p.imposer === imposer).map((p) => p.tier);
    return TIER_ORDER.find((t) => tiers.includes(t));
  };
  const groups = TIER_ORDER.map((tier) => ({
    tier,
    imposers: IMPOSER_ORDER.filter((i) => tierOf(i) === tier).map((i) => IMPOSER_LABEL[i]),
  })).filter((g) => g.imposers.length > 0);

  const phrase = joinList(groups.map((g) => `${g.tier} sanctions from the ${joinList(g.imposers)}`));
  const top = groups[0].tier;
  const allImposers = IMPOSER_ORDER.filter((i) => tierOf(i)).map((i) => IMPOSER_LABEL[i]);
  return {
    ...base,
    state: top,
    headline: `${name} is under ${phrase} (checked ${checked}).`,
    predicate: `under ${phrase}`,
    short: `${top[0].toUpperCase()}${top.slice(1)} sanctions in force`,
    imposers: joinList(allImposers),
  };
}

/** The one check date shown everywhere: taken from the promoted snapshot, never hand-typed. */
export function sanctionsCheckedDate(): string {
  return SANCTIONS_APPROVED_SNAPSHOT.effectiveAt ?? SANCTIONS_CATALOGUE_REVIEWED_AS_OF;
}

import { Banknote, CandlestickChart, Landmark, PiggyBank, Search, ShieldCheck, Umbrella } from "lucide-react";
import { LIVE_REGULATOR_NAV_ITEMS } from "../data/regulatorCoverage.js";
import { getRenderableOfficialRegulatorLogo } from "../data/regulatorLogos.js";
import type { RegulatorySignalAuthority, RegulatorySignalRole } from "../data/regulatorySignal.js";
import { RegulatorMark } from "./RegulatorMark.js";
import "../styles/authority-mark.css";

/**
 * A visual signifier beside each authority.
 *
 * Two rules, in order. Where the authority is one of the regulators we already
 * track and we hold its official logo, that logo is drawn. Otherwise a plain
 * icon for the mandate family — central bank, securities, insurance and so on.
 *
 * The match is on the exact normalised name and nothing looser. A fuzzy match
 * would eventually put one regulator's brand on another regulator's card, which
 * is a factual error dressed as a design detail; 42 of the 643 mapped
 * authorities match, so the mandate icon is the ordinary case and the
 * logo is the exception.
 *
 * `RegulatorMark` is only reached when a real logo exists. Its own fallback is
 * an abstract sigil that carries no meaning, so mandate icons are drawn here
 * instead.
 */

const MANDATE_ICON: Record<RegulatorySignalRole, typeof Landmark> = {
  central_banking: Landmark,
  prudential_supervision: ShieldCheck,
  securities: CandlestickChart,
  insurance: Umbrella,
  pensions: PiggyBank,
  financial_intelligence: Search,
};

/**
 * Case, punctuation and spacing are dropped, and so is a leading "the" — the
 * directory records "The Financial Conduct Authority" where coverage records
 * "Financial Conduct Authority". Dropping an article is not a loosening of the
 * match: no two regulators differ only by one.
 */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "").replace(/^the/, "");
}

/** Built once: 643 authorities × 80-odd regulators is not worth repeating per render. */
const REGULATOR_BY_NAME = new Map<string, string>();
for (const regulator of LIVE_REGULATOR_NAV_ITEMS) {
  for (const candidate of [regulator.fullName, regulator.name]) {
    const key = normalise(candidate);
    // First writer wins, so a short `name` never displaces a full-name match.
    if (key && !REGULATOR_BY_NAME.has(key)) REGULATOR_BY_NAME.set(key, regulator.code);
  }
}

/** The tracked regulator whose official logo we may draw for this authority, if any. */
export function officialLogoRegulatorCode(authorityName: string): string | null {
  const code = REGULATOR_BY_NAME.get(normalise(authorityName));
  if (!code) return null;
  // A tracked regulator without a rendered asset falls through to the mandate
  // icon rather than to RegulatorMark's meaningless sigil.
  return getRenderableOfficialRegulatorLogo(code, "light", "small") ? code : null;
}

export function AuthorityMark({ authority }: { authority: RegulatorySignalAuthority }) {
  const code = officialLogoRegulatorCode(authority.name);
  if (code) {
    return <RegulatorMark regulator={code} label={authority.name} size="small" className="authority-mark__logo" />;
  }

  const roles = authority.mandate.length ? authority.mandate : authority.roles;
  const Icon = MANDATE_ICON[roles[0] as RegulatorySignalRole] ?? Banknote;
  return (
    <span className="authority-mark" aria-hidden="true">
      <Icon size={14} strokeWidth={2} />
    </span>
  );
}

export default AuthorityMark;

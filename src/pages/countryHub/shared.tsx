import { Flag, Landmark, Layers, Scale, ShieldCheck } from "lucide-react";
import { bandFor, type RiskBand } from "../../data/countryRiskScore.js";
import { CountryRiskEvidencePopover } from "../../components/CountryRiskEvidencePopover.js";
import { authorityAccessLabel } from "../../data/regulatorySignal.js";

export const BAND_COLOUR: Record<RiskBand, string> = {
  "very-high": "#dc2626",
  high: "#ea580c",
  moderate: "#f59e0b",
  low: "#10b981",
};

export const LEVEL_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, enhanced: 4 };

/** Pillar → the kind of thing it measures. Institutions, law, practice, determination. */
export const PILLAR_ICON: Record<string, typeof Scale> = {
  effectiveness: ShieldCheck,
  safeguards: Scale,
  governance: Landmark,
  icrg: Flag,
};

/** Consideration row → its subject, so the table can be scanned by eye. */
export const CONSIDER_ICON: Record<string, typeof Scale> = {
  sanctions: Scale,
  fatf: ShieldCheck,
  governance: Landmark,
  "beneficial-ownership": Layers,
};

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function controlTiles(band: RiskBand | null): { name: string; blurb: string; priority: string }[] {
  const elevated = band === null || band === "very-high" || band === "high";
  return [
    {
      name: band === null
        ? "Complete Country Risk Assessment"
        : band === "low"
          ? "Standard Due Diligence"
          : "Enhanced Due Diligence",
      blurb: band === null
        ? "Obtain an approved alternative assessment before assigning a low-risk treatment."
        : "Apply risk-based due diligence to new counterparties and higher-risk transactions.",
      priority: elevated ? "High" : "Medium",
    },
    {
      name: "Beneficial Ownership",
      blurb: "Verify ultimate beneficial owners and the control structure.",
      priority: "High",
    },
    {
      name: "Sanctions & PEP Screening",
      blurb: "Screen against OFAC, UN, UK and EU lists and relevant sectoral programmes.",
      priority: elevated ? "High" : "Medium",
    },
    {
      name: "Transaction Monitoring",
      blurb: "Monitor for trade-based money laundering, layering and unusual routing.",
      priority: "Medium",
    },
    {
      name: "Ongoing Monitoring",
      blurb: "Review policy changes, enforcement trends and counterparty profiles.",
      priority: "Medium",
    },
  ];
}

/**
 * What we could see of an authority's own site when we last looked.
 *
 * Two of the states are not access failures and must not be described as one:
 * an authority with no public website has nothing to fail, and an unobserved
 * one was never checked. Everything else is a limit on our check — the wording
 * says the publications could not be read, never that there were none.
 */
export function authoritySiteStatus(state: Parameters<typeof authorityAccessLabel>[0]): string {
  if (state === "reachable") return "official site reachable when checked";
  if (state === "no-public-website") return "no public official website identified";
  if (state === "not-observed") return "official site not checked in this snapshot";
  return `${authorityAccessLabel(state).toLowerCase()} when checked, so its publications could not be read`;
}

/**
 * A pillar we hold no evidence for used to render as "0%" beside "n/a".
 *
 * The weight is zero because the pillar was rebalanced out of the formula, not
 * because safeguards or governance stopped mattering — but "Legal and
 * supervisory safeguards 0%" reads as a judgement that they count for nothing.
 * An unavailable pillar now says so, and says the other weights absorbed its
 * share. The popover still carries the score, weight and contribution for
 * anyone auditing the arithmetic.
 */
export function DomainBar({ label, weightPct, risk, explanation, contribution, source }: { label: string; weightPct: number; risk: number | null; explanation?: string; contribution?: number | null; source?: { name: string; url: string; effectiveAt?: string; checkedAt?: string; confidence?: string; note?: string } }) {
  const band = risk === null ? null : bandFor(risk);
  const unavailable = risk === null;
  return (
    <li className={`cx-domain${unavailable ? " cx-domain--unavailable" : ""}`}>
      <span className="cx-domain__label">
        {label}{" "}
        {unavailable
          ? <span className="cx-domain__wt cx-domain__wt--none">not available &mdash; remaining weights rebalanced</span>
          : <span className="cx-domain__wt">{weightPct}%</span>}
        {explanation && <CountryRiskEvidencePopover compact label={label} description={explanation} value={risk === null ? null : `${risk.toFixed(1)} / 10`} weight={`${weightPct}%`} contribution={contribution === null || contribution === undefined ? null : `${contribution.toFixed(1)} / 10`} source={source} />}
      </span>
      <span className="cx-domain__track">
        <span
          className="cx-domain__fill"
          style={{
            width: risk === null ? "0%" : `${(risk / 10) * 100}%`,
            background: band ? BAND_COLOUR[band] : "#cbd5e1",
          }}
        />
      </span>
      <span className="cx-domain__val">{risk === null ? "n/a" : risk.toFixed(1)}</span>
    </li>
  );
}

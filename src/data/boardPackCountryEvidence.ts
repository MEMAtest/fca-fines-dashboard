import { countryRiskSourceStatus } from "./countryRiskSources.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "./sanctionsApprovedData.js";

const CHECK_DATE = "27 Nov 2026";
const SANCTIONS_CHECKED_VERSION = "sanctions-2026-11-15-a42d2c44079b";
const sourceLabels: Record<string, string> = {
  "un-consolidated-list": "UN Security Council consolidated list",
  "uk-regimes": "UK FCDO sanctions regimes",
  "eu-resources": "EU Sanctions Map catalogue",
  "ofac-programmes": "US Treasury OFAC programmes",
};

function dateLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "Not recorded";
}

export const BOARD_PACK_COUNTRY_EVIDENCE_SCOPE =
  "Country context only. These sources do not determine the pack's enforcement-pressure findings or provide sanctions screening or legal clearance.";

export function getBoardPackCountryEvidence(asOf = new Date()) {
  const fatf = countryRiskSourceStatus("fatf-lists", asOf);
  const sanctions = countryRiskSourceStatus("sanctions-regimes", asOf);
  return [
    {
      id: fatf.id,
      title: "FATF monitored jurisdictions",
      state: fatf.state,
      effective: dateLabel(fatf.effectiveAt),
      retained: dateLabel(fatf.retrievedAt),
      sources: [{ label: "Official FATF high-risk and monitored lists", url: fatf.sourceUrl }],
      check: fatf.effectiveAt === "2026-10-30" && fatf.retrievedAt === "2026-11-05"
        ? `Cross-check (${CHECK_DATE}): FATF's official overview still lists the same 3 call-for-action and 18 increased-monitoring jurisdictions.`
        : null,
      limitation: "A listing is not a firm-level risk decision. The cross-check does not renew the versioned evidence or establish operational scoring readiness.",
    },
    {
      id: sanctions.id,
      title: "Geographic sanctions regimes",
      state: sanctions.state,
      effective: dateLabel(sanctions.effectiveAt),
      retained: dateLabel(sanctions.retrievedAt),
      sources: SANCTIONS_APPROVED_SNAPSHOT.sources.map(({ id, url }) => ({ label: sourceLabels[id] ?? id, url })),
      check: SANCTIONS_APPROVED_SNAPSHOT.version === SANCTIONS_CHECKED_VERSION
        ? `Cross-check (${CHECK_DATE}): all four official catalogue fingerprints matched the retained snapshot.`
        : null,
      limitation: "A catalogue match does not revalidate individual legal instruments, restrictions, exemptions, or designations. The snapshot is not a substitute for current official rules or transaction screening.",
    },
  ].map((entry) => ({
    ...entry,
    statusLabel: entry.state === "current" ? "Within snapshot freshness window" : "Not current for reliance",
    dates: `Evidence effective: ${entry.effective} | Retained snapshot checked or generated: ${entry.retained}`,
  }));
}

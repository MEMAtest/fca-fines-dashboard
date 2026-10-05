import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildRegulatorySignalEvidence,
  REGULATORY_SIGNAL_METHODOLOGY_VERSION,
} from "../../src/data/regulatorySignalExport.js";
import { listRegulatorySignalCountries, REGULATORY_SIGNAL_COUNTRY_COUNT, REGULATORY_SIGNAL_GENERATED_AT } from "../../src/data/regulatorySignal.js";
import { PUBLIC_REGULATOR_CODES } from "../../src/data/regulatorCoverage.js";
import { authoriseDeveloperApiRequest, setDeveloperApiCache } from "../../server/services/developerApiAccess.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const access = await authoriseDeveloperApiRequest(req, res, "/api/regulatory-signal/list");
  if (!access) return;
  setDeveloperApiCache(res, access);

  const region = typeof req.query.region === "string" ? req.query.region.trim().toLowerCase() : "";
  const rows = listRegulatorySignalCountries()
    .filter((country) => !region || country.region.toLowerCase() === region)
    .map((country) => {
      const evidence = buildRegulatorySignalEvidence(country.iso2)!;
      return {
        country: evidence.country,
        evidenceDisposition: evidence.evidenceDisposition,
        ecosystem: {
          researchDepth: evidence.ecosystem.researchDepth,
          authorityCount: evidence.ecosystem.authorityCount,
          roleFamilies: evidence.ecosystem.roleFamilies,
        },
        regActionsCoverage: evidence.regActionsCoverage,
        activitySignal: evidence.activitySignal,
        activitySummary: evidence.activitySummary,
        evidenceLevels: evidence.ecosystem.authorities.reduce<Record<string, number>>((counts, authority) => {
          counts[authority.evidenceLevel] = (counts[authority.evidenceLevel] ?? 0) + 1;
          return counts;
        }, {}),
        secondaryReporting: null,
        transparencyIndex: null,
      };
    });
  const allCountries = listRegulatorySignalCountries();
  const liveRegulatorCodes = new Set(allCountries.flatMap((country) => country.liveRegulatorCodes));
  const configuredRegulatorCodes = new Set(allCountries.flatMap((country) => [...country.liveRegulatorCodes, ...country.pipelineRegulatorCodes]));
  return res.status(200).json({
    schemaVersion: "1.0.0",
    methodologyVersion: REGULATORY_SIGNAL_METHODOLOGY_VERSION,
    status: "research-only",
    generatedAt: REGULATORY_SIGNAL_GENERATED_AT,
    count: rows.length,
    totalJurisdictions: REGULATORY_SIGNAL_COUNTRY_COUNT,
    liveRegulatorCount: liveRegulatorCodes.size,
    configuredRegulatorCount: PUBLIC_REGULATOR_CODES.length,
    countryMappedConfiguredRegulatorCount: configuredRegulatorCodes.size,
    rows,
  });
}

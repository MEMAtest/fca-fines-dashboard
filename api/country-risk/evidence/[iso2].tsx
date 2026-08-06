import React from "react";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderToBuffer } from "@react-pdf/renderer";
import { CountryRiskEvidencePdf } from "../../../src/components/CountryRiskEvidencePdf.js";
import {
  buildCountryRiskEvidenceBundle,
  countryRiskEvidenceCsv,
} from "../../../src/data/countryRiskEvidenceExport.js";

type EvidenceFormat = "json" | "csv" | "pdf";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const iso2 = String(req.query.iso2 ?? "").toUpperCase();
  const format = String(req.query.format ?? "json").toLowerCase() as EvidenceFormat;
  if (!(["json", "csv", "pdf"] as string[]).includes(format)) {
    return res.status(400).json({ error: `Unsupported evidence format: ${format}` });
  }
  const bundle = buildCountryRiskEvidenceBundle(iso2, new Date());
  if (!bundle) return res.status(404).json({ error: "Country not found" });
  const filename = `regactions-${bundle.country.iso2.toLowerCase()}-country-risk-evidence.${format}`;
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(countryRiskEvidenceCsv(bundle));
  }
  if (format === "pdf") {
    const buffer = await renderToBuffer(<CountryRiskEvidencePdf bundle={bundle} />);
    res.setHeader("Content-Type", "application/pdf");
    return res.status(200).send(buffer);
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).json(bundle);
}

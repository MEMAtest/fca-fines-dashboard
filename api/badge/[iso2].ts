/**
 * Embeddable country AML-risk SVG badge.
 *
 * GET /api/badge/{iso2}  ->  image/svg+xml
 *
 * Returns a small, self-contained SVG that third parties can embed with a
 * plain <img> tag. The badge reads its score from the SAME scoring path as
 * /api/country-risk/[iso2] (computeCountryRiskV2), so the number on the badge
 * can never drift from the number on the country report. Scores that the
 * methodology withholds (insufficient-data) render an honest "Not rated"
 * variant rather than inventing a value.
 *
 * The site sets `frame-ancestors 'none'` / `X-Frame-Options: DENY`, but those
 * only govern <iframe> framing; an <img> embed of an SVG is unaffected, so no
 * header changes are needed for the badge to render on external pages.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCountryByIso2 } from "../../src/data/countries.js";
import { computeCountryRiskV2 } from "../../src/data/countryRiskV2.js";
import { bandLabel, type RiskBand } from "../../src/data/countryRiskScore.js";

// Local copy of the band palette. We deliberately do NOT import it from
// src/components/mapShared.ts because that module pulls in React, which must
// not leak into a serverless function bundle.
const BAND_COLOUR: Record<RiskBand, string> = {
  "very-high": "#dc2626",
  high: "#ea580c",
  moderate: "#f59e0b",
  low: "#10b981",
};
const NOT_RATED_COLOUR = "#64748b";
const LABEL_BG = "#0f172a";
const BRAND = "RegActions";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Rough monospace-ish width estimate so the value pill sizes itself to its
// text. 6.6px per character at 12px SemiBold is a safe over-estimate for the
// font stack below; a little slack is harmless.
function textWidth(text: string): number {
  return Math.ceil(text.length * 6.6) + 16;
}

function badgeSvg(opts: {
  label: string;
  value: string;
  valueColour: string;
  title: string;
}): string {
  const { label, value, valueColour, title } = opts;
  const height = 20;
  const labelText = escapeXml(label);
  const valueText = escapeXml(value);
  const labelWidth = textWidth(label);
  const valueWidth = textWidth(value);
  const totalWidth = labelWidth + valueWidth;
  const labelMid = labelWidth / 2;
  const valueMid = labelWidth + valueWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".12"/>
    <stop offset="1" stop-opacity=".12"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="${height}" rx="3"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="${LABEL_BG}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${height}" fill="${valueColour}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#ffffff" text-anchor="middle" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="11" font-weight="600">
    <text x="${labelMid}" y="14">${labelText}</text>
    <text x="${valueMid}" y="14">${valueText}</text>
  </g>
</svg>`;
}

function notFoundSvg(iso2: string): string {
  return badgeSvg({
    label: `${BRAND} risk`,
    value: "Unknown country",
    valueColour: NOT_RATED_COLOUR,
    title: `${BRAND} does not recognise the country code ${iso2}.`,
  });
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawIso2 = String(req.query.iso2 ?? "").replace(/\.svg$/i, "");
  const iso2 = rawIso2.toUpperCase();

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");

  // Reject anything that is not a plausible ISO 3166-1 alpha-2 code before we
  // touch the country lookup, so garbage never reaches the scoring path.
  if (!/^[A-Z]{2}$/.test(iso2)) {
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    return res.status(404).send(notFoundSvg(iso2 || "??"));
  }

  const country = getCountryByIso2(iso2);
  if (!country) {
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    return res.status(404).send(notFoundSvg(iso2));
  }

  // Reuse the exact scoring path that powers /api/country-risk/[iso2].
  const result = computeCountryRiskV2(iso2, { asOf: new Date() });

  if (result.score === null || result.band === null) {
    // The methodology withholds a score for this jurisdiction. Say so plainly.
    const svg = badgeSvg({
      label: `${country.name} AML risk`,
      value: "Not rated",
      valueColour: NOT_RATED_COLOUR,
      title: `${country.name} AML risk: not rated by ${BRAND} (insufficient source coverage).`,
    });
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return res.status(200).send(svg);
  }

  const label = bandLabel(result.band);
  const svg = badgeSvg({
    label: `${country.name} AML risk`,
    value: `${label} (${result.score}/10)`,
    valueColour: BAND_COLOUR[result.band],
    title: `${country.name} AML risk: ${label} (${result.score}/10) via ${BRAND}.`,
  });
  // A day at the CDN, a day for stale-while-revalidate; scores move at most weekly.
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
  return res.status(200).send(svg);
}

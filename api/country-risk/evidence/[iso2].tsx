import React from "react";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  buildCountryRiskEvidenceBundle,
  countryRiskEvidenceCsv,
  countryRiskEvidenceRows,
  type CountryRiskEvidenceBundle,
} from "../../../src/data/countryRiskEvidenceExport.js";

type EvidenceFormat = "json" | "csv" | "pdf";

const colours = {
  green: "#0f5132",
  ink: "#17211b",
  muted: "#526057",
  border: "#d7dfda",
  wash: "#f4f7f5",
  gold: "#b58a3a",
};

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: "Helvetica", color: colours.ink, fontSize: 9, lineHeight: 1.45 },
  brand: { color: colours.green, fontSize: 10, letterSpacing: 1.2, marginBottom: 18 },
  title: { fontSize: 23, fontWeight: 700, lineHeight: 1.2, marginBottom: 8 },
  subtitle: { color: colours.muted, fontSize: 10, lineHeight: 1.3, marginBottom: 20 },
  scoreCard: { backgroundColor: colours.green, color: "#ffffff", padding: 15, marginBottom: 16 },
  score: { fontSize: 26, fontWeight: 700, lineHeight: 1.15, marginBottom: 7 },
  scoreMeta: { fontSize: 9, lineHeight: 1.35, marginTop: 2 },
  section: { marginTop: 14 },
  heading: { fontSize: 12, fontWeight: 700, color: colours.green, borderBottom: `1 solid ${colours.border}`, paddingBottom: 4, marginBottom: 7 },
  row: { flexDirection: "row", borderBottom: `1 solid ${colours.border}`, paddingVertical: 5 },
  key: { width: "28%", fontWeight: 700, paddingRight: 6 },
  value: { width: "46%", paddingRight: 6 },
  status: { width: "14%", color: colours.muted },
  date: { width: "12%", color: colours.muted },
  callout: { borderLeft: `3 solid ${colours.gold}`, backgroundColor: colours.wash, padding: 9, marginTop: 7 },
  source: { marginTop: 3, fontSize: 7, color: colours.muted },
  footerLeft: { position: "absolute", bottom: 22, left: 34, color: colours.muted, fontSize: 7 },
  footerRight: { position: "absolute", bottom: 22, right: 34, color: colours.muted, fontSize: 7 },
});

const shortDate = (value: string) => value ? value.slice(0, 10) : "";

function CountryRiskEvidencePdf({ bundle }: { bundle: CountryRiskEvidenceBundle }) {
  const rows = countryRiskEvidenceRows(bundle);
  const grouped = rows.reduce<Record<string, typeof rows>>((acc, row) => {
    (acc[row.section] ??= []).push(row);
    return acc;
  }, {});
  const score = bundle.result.score === null ? "Not scored" : `${bundle.result.score.toFixed(1)} / 10`;
  return (
    <Document
      title={`${bundle.country.name} country-risk evidence pack`}
      author="RegActions"
      subject={`Public country-risk methodology ${bundle.methodologyVersion}`}
      creator="RegActions"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>REGACTIONS · PUBLIC COUNTRY-RISK EVIDENCE</Text>
        <Text style={styles.title}>{bundle.country.name}</Text>
        <Text style={styles.subtitle}>
          Methodology {bundle.methodologyVersion} · Exported {shortDate(bundle.exportedAt)} · ISO {bundle.country.iso2}/{bundle.country.iso3}
        </Text>
        <View style={styles.scoreCard}>
          <Text style={styles.score}>{score}</Text>
          <Text style={styles.scoreMeta}>
            {bundle.result.band ?? "No band"} · {bundle.result.status} · {bundle.result.confidence} confidence
          </Text>
          <Text style={styles.scoreMeta}>{bundle.result.arithmetic}</Text>
        </View>
        <View style={styles.callout}>
          <Text>{bundle.surface.fatfAction.explanation}</Text>
          <Link src={bundle.surface.fatfAction.sourceUrl} style={styles.source}>
            FATF source · reviewed {bundle.surface.fatfAction.lastReviewed}
          </Link>
        </View>
        {Object.entries(grouped).map(([section, sectionRows]) => (
          <View key={section} style={styles.section} wrap={false}>
            <Text style={styles.heading}>{section.replaceAll("-", " ").toUpperCase()}</Text>
            {sectionRows.map((row, index) => (
              <View key={`${row.key}-${index}`} style={styles.row}>
                <Text style={styles.key}>{row.key}</Text>
                <Text style={styles.value}>{row.value || "Not available"}</Text>
                <Text style={styles.status}>{row.status}</Text>
                <Text style={styles.date}>{shortDate(row.effectiveAt)}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={styles.section}>
          <Text style={styles.heading}>ASSURANCE</Text>
          <Text>Contextual signals do not change the v2 score. Missing evidence is not treated as zero risk.</Text>
          <Text>{bundle.assurance.disclaimer}</Text>
          <Text style={styles.source}>Sanctions external validation: {bundle.assurance.externalSanctionsValidation ?? "not recorded"}</Text>
        </View>
        <Text style={styles.footerLeft} fixed>regactions.com/countries/methodology/v2</Text>
        <Text style={styles.footerRight} fixed>Public evidence pack</Text>
      </Page>
    </Document>
  );
}

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

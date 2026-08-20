import React from "react";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import {
  buildRegulatorySignalEvidence,
  regulatorySignalEvidenceCsv,
  type RegulatorySignalEvidence,
} from "../../../src/data/regulatorySignalExport.js";

type EvidenceFormat = "json" | "csv" | "pdf";

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", color: "#17211b", fontSize: 9, lineHeight: 1.4 },
  brand: { color: "#0f5132", fontSize: 10, letterSpacing: 1.2, marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 5 },
  muted: { color: "#526057", marginBottom: 14 },
  heading: { color: "#0f5132", fontSize: 12, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  card: { backgroundColor: "#f4f7f5", padding: 10, marginBottom: 10 },
  row: { borderBottom: "1 solid #d7dfda", paddingVertical: 4 },
  source: { color: "#526057", fontSize: 7, marginTop: 2 },
});

function EvidencePdf({ evidence }: { evidence: RegulatorySignalEvidence }) {
  return (
    <Document title={`${evidence.country.name} regulatory ecosystem evidence`} author="RegActions">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>REGACTIONS · REGULATORY ECOSYSTEM EVIDENCE</Text>
        <Text style={styles.title}>{evidence.country.name}</Text>
        <Text style={styles.muted}>ISO {evidence.country.iso2} · {evidence.country.region} · Research snapshot {evidence.generatedAt.slice(0, 10)}</Text>
        <View style={styles.card}>
          <Text>Publication status: research-only · Transparency Index: not assessed</Text>
          <Text>Evidence disposition: {evidence.evidenceDisposition.label}</Text>
          <Text>RegActions coverage: {evidence.regActionsCoverage.state}</Text>
          <Text>Activity: {evidence.activitySignal.label} (neutral)</Text>
        </View>
        <Text style={styles.heading}>Regulatory ecosystem</Text>
        <Text>{evidence.ecosystem.authorityCount} mapped official authorities across {evidence.ecosystem.roleFamilies.filter((role) => role.authorityCount > 0).length} role families.</Text>
        {evidence.ecosystem.authorities.map((authority) => (
          <View key={authority.name} style={styles.row} wrap={false}>
            <Text>{authority.name}</Text>
            <Text>Mandate: {authority.mandate.map((role) => role.label).join(", ") || "Mandate not classified"}</Text>
            <Text>Evidence level: {authority.evidenceLevel}</Text>
            <Text>Selected candidate kind: {authority.publicationKind} · source scope: {authority.sourceHostScope ?? "not qualified"}</Text>
            <Text>{authority.accessLabel}</Text>
            {authority.website && <Text style={styles.source}>{authority.website}</Text>}
            {authority.publicationUrl && <Text style={styles.source}>{authority.publicationUrl}</Text>}
            {authority.publicationCandidates.length > 0 && <Text style={styles.source}>Candidate routes: {authority.publicationCandidates.map((candidate) => `${candidate.url} [${candidate.contextLabel}; ${candidate.qualificationState ?? "unqualified"}]`).join("; ")}</Text>}
            {authority.regulatoryUpdates.length > 0 && <Text style={styles.source}>Authority-owned qualified regulatory-update routes: {authority.regulatoryUpdates.map((candidate) => candidate.url).join("; ")}</Text>}
            {authority.enforcementCandidates.length > 0 && <Text style={styles.source}>Authority-owned qualified enforcement routes: {authority.enforcementCandidates.map((candidate) => candidate.url).join("; ")}</Text>}
            {authority.externalContextCandidates.length > 0 && <Text style={styles.source}>External official context only (not authority publication evidence): {authority.externalContextCandidates.map((candidate) => candidate.url).join("; ")}</Text>}
            <Text style={styles.source}>Directory source: {authority.directorySources.join(", ") || "not recorded"}</Text>
            <Text style={styles.source}>Research/publication snapshot checked: {authority.researchPublicationSnapshotCheckedAt.slice(0, 10)}</Text>
            {authority.directoryEvidenceUrls.length > 0 && <Text style={styles.source}>Directory evidence: {authority.directoryEvidenceUrls.join("; ")}</Text>}
            <Text style={styles.source}>Research effective: {authority.researchEffectiveAt.slice(0, 10)} · retrieved: {authority.retrievedAt.slice(0, 10)}</Text>
            <Text style={styles.source}>Provisional first-page scan signal: {authority.activity.signal} · observed month count: {authority.activity.observedMonthCount} · scan contract: {authority.activity.scanContract.startMonth} to {authority.activity.scanContract.endMonth}, as of {authority.activity.scanContract.asOf}, month precision · latest observed month: {authority.activity.latestObservedMonth ?? "not observed"}</Text>
          </View>
        ))}
        <Text style={styles.heading}>RegActions coverage</Text>
        <Text>{evidence.regActionsCoverage.liveRegulators} live regulator feeds; {evidence.regActionsCoverage.observedRecords.toLocaleString("en-GB")} records in the research snapshot.</Text>
        {evidence.evidenceDisposition.externalEvidenceUrl && <Text style={styles.source}>External evidence: {evidence.evidenceDisposition.externalEvidenceUrl}</Text>}
        <Text style={styles.source}>Provisional first-page scan summary: recent {evidence.activitySummary.recentAuthorities}; periodic {evidence.activitySummary.periodicAuthorities}; low-frequency {evidence.activitySummary.lowFrequencyAuthorities}; unknown {evidence.activitySummary.unknownAuthorities}. Automated scan contract {evidence.activitySummary.scanContract.startMonth} to {evidence.activitySummary.scanContract.endMonth}, as of {evidence.activitySummary.scanContract.asOf}; month precision; first-page-only and unvalidated.</Text>
        <Text style={styles.heading}>Limitations</Text>
        {evidence.limitations.map((limitation) => <Text key={limitation} style={styles.row}>• {limitation}</Text>)}
      </Page>
    </Document>
  );
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const iso2 = String(req.query.iso2 ?? "").trim().toUpperCase();
  const format = String(req.query.format ?? "json").toLowerCase() as EvidenceFormat;
  if (!["json", "csv", "pdf"].includes(format)) return res.status(400).json({ error: `Unsupported evidence format: ${format}` });
  const evidence = buildRegulatorySignalEvidence(iso2);
  if (!evidence) return res.status(404).json({ error: "Jurisdiction not found" });
  const filename = `regactions-${iso2.toLowerCase()}-regulatory-ecosystem.${format}`;
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(regulatorySignalEvidenceCsv(evidence));
  }
  if (format === "pdf") {
    const buffer = await renderToBuffer(<EvidencePdf evidence={evidence} />);
    res.setHeader("Content-Type", "application/pdf");
    return res.status(200).send(buffer);
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).json(evidence);
}

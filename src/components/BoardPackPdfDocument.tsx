import {
  Document,
  Font,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { BoardFirmProfile } from "../data/boardIntelligence.js";
import type {
  BoardPackResult,
  ControlChallengeSummary,
  ControlChecklistItem,
} from "../utils/boardIntelligence.js";

Font.registerHyphenationCallback((word) => [word]);

interface BoardPackPdfDocumentProps {
  pack: BoardPackResult;
  profile: BoardFirmProfile;
  generatedLabel: string;
  controlSummary: ControlChallengeSummary;
  controlChecklist: ControlChecklistItem[];
}

const colours = {
  navy: "#102536",
  green: "#069A67",
  blue: "#1B67D8",
  muted: "#617185",
  line: "#DDE5EC",
  soft: "#F4F8F7",
  paleBlue: "#EFF5FF",
  red: "#C9342B",
  amber: "#B46B08",
};

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: "Helvetica", color: colours.navy, fontSize: 9, lineHeight: 1.45 },
  cover: { padding: 42, fontFamily: "Helvetica", color: colours.navy, fontSize: 10 },
  brand: { color: colours.green, fontSize: 14, fontWeight: 700, marginBottom: 55 },
  eyebrow: { color: colours.blue, fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 9 },
  coverTitle: { fontSize: 28, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 },
  coverSub: { maxWidth: 430, color: colours.muted, fontSize: 12, lineHeight: 1.5, marginBottom: 28 },
  scopeBox: { marginTop: 10, padding: 18, border: `1 solid ${colours.line}`, borderRadius: 7, backgroundColor: colours.soft },
  scopeRow: { flexDirection: "row", paddingVertical: 6, borderBottom: `1 solid ${colours.line}` },
  scopeLabel: { width: 115, color: colours.muted, fontSize: 8, textTransform: "uppercase" },
  scopeValue: { flex: 1, fontSize: 9.5, fontWeight: 700 },
  disclaimer: { marginTop: "auto", paddingTop: 12, borderTop: `1 solid ${colours.line}`, color: colours.muted, fontSize: 7.5 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18, paddingBottom: 8, borderBottom: `1 solid ${colours.line}` },
  headerTitle: { fontSize: 8, fontWeight: 700, color: colours.green },
  headerMeta: { fontSize: 7.5, color: colours.muted },
  title: { fontSize: 18, fontWeight: 700, lineHeight: 1.35, marginBottom: 10 },
  lead: { color: colours.muted, fontSize: 9.5, lineHeight: 1.55, marginBottom: 18 },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 16 },
  kpi: { flex: 1, minHeight: 62, padding: 10, border: `1 solid ${colours.line}`, borderRadius: 6 },
  kpiLabel: { color: colours.muted, fontSize: 6.8, textTransform: "uppercase", marginBottom: 7 },
  kpiValue: { fontSize: 17, fontWeight: 700 },
  kpiMeta: { marginTop: 4, color: colours.muted, fontSize: 7 },
  grid: { flexDirection: "row", gap: 10, marginBottom: 12 },
  card: { flex: 1, padding: 12, border: `1 solid ${colours.line}`, borderRadius: 6 },
  panel: { padding: 12, border: `1 solid ${colours.line}`, borderRadius: 6 },
  cardGreen: { flex: 1, padding: 12, borderRadius: 6, backgroundColor: colours.soft },
  cardBlue: { flex: 1, padding: 12, borderRadius: 6, backgroundColor: colours.paleBlue },
  cardTitle: { fontSize: 10, fontWeight: 700, marginBottom: 8 },
  bullet: { flexDirection: "row", gap: 6, marginBottom: 6 },
  bulletMark: { color: colours.green, fontWeight: 700 },
  bulletText: { flex: 1, fontSize: 8.3 },
  table: { border: `1 solid ${colours.line}`, borderRadius: 5, overflow: "hidden", marginBottom: 12 },
  tableHeader: { flexDirection: "row", padding: 7, backgroundColor: "#F3F6F9", borderBottom: `1 solid ${colours.line}` },
  tableRow: { flexDirection: "row", padding: 7, borderBottom: `1 solid ${colours.line}` },
  colWide: { flex: 2.2, paddingRight: 6 },
  col: { flex: 1, paddingRight: 6 },
  colSmall: { width: 54 },
  th: { fontSize: 6.5, color: colours.muted, textTransform: "uppercase", fontWeight: 700 },
  td: { fontSize: 7.5 },
  barRow: { marginBottom: 10 },
  barHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { fontSize: 8, fontWeight: 700 },
  barTrack: { height: 7, backgroundColor: "#E9EEF3", borderRadius: 4 },
  barFill: { height: 7, backgroundColor: colours.green, borderRadius: 4 },
  statusHigh: { color: colours.red, fontWeight: 700 },
  statusMedium: { color: colours.amber, fontWeight: 700 },
  sourceLink: { color: colours.blue, fontSize: 7.2, textDecoration: "none" },
  footer: { position: "absolute", left: 34, right: 34, bottom: 18, flexDirection: "row", justifyContent: "space-between", color: colours.muted, fontSize: 7 },
});

function PageHeader({ profile, generatedLabel, section }: { profile: BoardFirmProfile; generatedLabel: string; section: string }) {
  return <View style={styles.header} fixed><Text style={styles.headerTitle}>RegActions | Board Pack</Text><Text style={styles.headerMeta}>{profile.firmName} | {section} | {generatedLabel}</Text></View>;
}

function PageFooter() {
  return <View style={styles.footer} fixed><Text>Public regulatory intelligence. Validate material decisions against the linked official evidence.</Text><Text render={({pageNumber,totalPages}) => `${pageNumber} / ${totalPages}`} /></View>;
}

function Bullets({ items, limit = 8 }: { items: string[]; limit?: number }) {
  return <View>{items.slice(0,limit).map((item) => <View style={styles.bullet} key={item}><Text style={styles.bulletMark}>+</Text><Text style={styles.bulletText}>{item.replaceAll("—", "-")}</Text></View>)}</View>;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function boardFocusLabel(value: BoardFirmProfile["boardFocus"]) {
  if (value === "assurance") return "Board assurance";
  if (value === "remediation") return "Remediation pressure";
  return "Growth or market entry";
}

export function BoardPackPdfDocument({ pack, profile, generatedLabel, controlSummary, controlChecklist }: BoardPackPdfDocumentProps) {
  const primaryThemes = pack.topThemes.slice(0, 5);
  return (
    <Document title={`${profile.firmName} Board Pack`} author="RegActions" subject="Regulatory enforcement intelligence board pack">
      <Page size="A4" style={styles.cover}>
        <Text style={styles.brand}>RegActions</Text>
        <Text style={styles.eyebrow}>Board and risk committee intelligence</Text>
        <Text style={styles.coverTitle}>{profile.firmName}</Text>
        <Text style={styles.coverSub}>A concise enforcement intelligence and control challenge pack for board and risk committee decision-making.</Text>
        <View style={styles.scopeBox}>
          <View style={styles.scopeRow}><Text style={styles.scopeLabel}>Generated</Text><Text style={styles.scopeValue}>{generatedLabel}</Text></View>
          <View style={styles.scopeRow}><Text style={styles.scopeLabel}>Committee lens</Text><Text style={styles.scopeValue}>{boardFocusLabel(profile.boardFocus)}</Text></View>
          <View style={styles.scopeRow}><Text style={styles.scopeLabel}>Regulators</Text><Text style={styles.scopeValue}>{profile.priorityRegulators.join(", ")}</Text></View>
          <View style={styles.scopeRow}><Text style={styles.scopeLabel}>Regions</Text><Text style={styles.scopeValue}>{profile.focusRegions.join(", ")}</Text></View>
          <View style={[styles.scopeRow,{borderBottom:0}]}><Text style={styles.scopeLabel}>Classification</Text><Text style={styles.scopeValue}>Board / Risk Committee Use</Text></View>
        </View>
        <Text style={styles.disclaimer}>This pack is generated from the RegActions public enforcement evidence base. It supports informed challenge and does not replace legal advice, regulatory source verification or firm-specific control testing.</Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <PageHeader profile={profile} generatedLabel={generatedLabel} section="Executive summary" />
        <Text style={styles.eyebrow}>Executive summary</Text><Text style={styles.title}>{pack.summaryHeadline.replaceAll("—", "-")}</Text><Text style={styles.lead}>{pack.summaryNarrative.replaceAll("—", "-")}</Text>
        <View style={styles.kpis}>
          <View style={styles.kpi}><Text style={styles.kpiLabel}>Exposure score</Text><Text style={styles.kpiValue}>{pack.exposureScore}/100</Text><Text style={styles.kpiMeta}>{pack.exposureBand} exposure</Text></View>
          <View style={styles.kpi}><Text style={styles.kpiLabel}>Peer baseline</Text><Text style={styles.kpiValue}>{pack.peerBaselineScore}/100</Text><Text style={styles.kpiMeta}>{pack.peerBaselineDelta >= 0 ? "+" : ""}{pack.peerBaselineDelta} points</Text></View>
          <View style={styles.kpi}><Text style={styles.kpiLabel}>Relevant actions</Text><Text style={styles.kpiValue}>{pack.relevantActionCount}</Text><Text style={styles.kpiMeta}>{pack.activeRegulatorCount} regulators</Text></View>
          <View style={styles.kpi}><Text style={styles.kpiLabel}>Control readiness</Text><Text style={styles.kpiValue}>{titleCase(controlSummary.readinessBand)}</Text><Text style={styles.kpiMeta}>{controlSummary.weakControlCount} weak controls</Text></View>
        </View>
        <View style={styles.grid}><View style={styles.cardGreen}><Text style={styles.cardTitle}>Executive takeaways</Text><Bullets items={pack.executiveSummaryBullets} limit={5}/></View><View style={styles.cardBlue}><Text style={styles.cardTitle}>Why this matters now</Text><Bullets items={pack.whyNowBullets} limit={5}/></View></View>
        <View style={styles.panel}><Text style={styles.cardTitle}>Board conclusion</Text><Text>{pack.summaryHeadline.replaceAll("—", "-")}</Text></View>
        <PageFooter />
      </Page>

      <Page size="A4" style={styles.page}>
        <PageHeader profile={profile} generatedLabel={generatedLabel} section="Exposure and peers" />
        <Text style={styles.eyebrow}>Exposure and peer comparison</Text><Text style={styles.title}>The themes driving regulatory exposure</Text><Text style={styles.lead}>{pack.peerBaselineNarrative.replaceAll("—", "-")}</Text>
        <View style={styles.grid}>
          <View style={styles.card}><Text style={styles.cardTitle}>Exposure drivers</Text>{primaryThemes.map((theme) => <View style={styles.barRow} key={theme.id}><View style={styles.barHead}><Text style={styles.barLabel}>{theme.shortLabel}</Text><Text>{theme.score}/100</Text></View><View style={styles.barTrack}><View style={[styles.barFill,{width:`${Math.max(theme.score,3)}%`}]} /></View><Text style={styles.kpiMeta}>{theme.matchedActions} matched actions | {theme.activeRegulators.join(", ") || "Regulator mix limited"}</Text></View>)}</View>
          <View style={styles.card}><Text style={styles.cardTitle}>Regulator signals</Text>{pack.regulatorSignals.slice(0,6).map((signal) => <View style={styles.scopeRow} key={signal.code}><Text style={styles.colSmall}>{signal.code}</Text><Text style={styles.col}>{signal.actionCount} actions</Text><Text style={signal.band === "severe" || signal.band === "material" ? styles.statusHigh : styles.statusMedium}>{titleCase(signal.band)}</Text></View>)}</View>
        </View>
        <View style={styles.panel}><Text style={styles.cardTitle}>Board implications</Text><Bullets items={pack.implications} limit={6}/></View>
        <PageFooter />
      </Page>

      <Page size="A4" style={styles.page}>
        <PageHeader profile={profile} generatedLabel={generatedLabel} section="Actions and challenge" />
        <Text style={styles.eyebrow}>Actions and challenge</Text><Text style={styles.title}>What the board should request next</Text><Text style={styles.lead}>{controlSummary.challengeHeadline.replaceAll("—", "-")}</Text>
        <View style={styles.grid}><View style={styles.cardGreen}><Text style={styles.cardTitle}>Questions for management</Text><Bullets items={pack.boardQuestions} limit={7}/></View><View style={styles.cardBlue}><Text style={styles.cardTitle}>Recommended responses</Text><Bullets items={pack.recommendedActions} limit={7}/></View></View>
        <Text style={styles.cardTitle}>Control evidence challenge</Text>
        <View style={styles.table}><View style={styles.tableHeader}><Text style={[styles.col,styles.th]}>Theme</Text><Text style={[styles.colWide,styles.th]}>Control</Text><Text style={[styles.col,styles.th]}>Starting position</Text></View>{controlChecklist.slice(0,7).map((item)=><View style={styles.tableRow} key={item.id}><Text style={[styles.col,styles.td]}>{item.themeLabel}</Text><Text style={[styles.colWide,styles.td]}>{item.control}</Text><Text style={[styles.col,styles.td]}>{item.defaultStatus.replaceAll("-"," ")}</Text></View>)}</View>
        <PageFooter />
      </Page>

      <Page size="A4" style={styles.page}>
        <PageHeader profile={profile} generatedLabel={generatedLabel} section="Evidence and methodology" />
        <Text style={styles.eyebrow}>Evidence and methodology</Text><Text style={styles.title}>Source-linked cases supporting this pack</Text><Text style={styles.lead}>The cases below are the strongest public evidence matches for the selected firm profile. Open the linked official evidence before relying on a case for a material decision.</Text>
        <View style={styles.table}><View style={styles.tableHeader}><Text style={[styles.colWide,styles.th]}>Firm / individual</Text><Text style={[styles.col,styles.th]}>Regulator</Text><Text style={[styles.col,styles.th]}>Date</Text><Text style={[styles.colWide,styles.th]}>Reason</Text></View>{pack.notableCases.slice(0,8).map((item)=><View style={styles.tableRow} key={item.id}><View style={styles.colWide}><Text style={styles.td}>{item.firm}</Text>{item.sourceUrl && <Link src={item.sourceUrl} style={styles.sourceLink}>Open official evidence</Link>}</View><Text style={[styles.col,styles.td]}>{item.regulator}</Text><Text style={[styles.col,styles.td]}>{new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(item.dateIssued))}</Text><Text style={[styles.colWide,styles.td]}>{item.reason.replaceAll("·","|").replaceAll("—","-")}</Text></View>)}</View>
        <View style={styles.grid}><View style={styles.card}><Text style={styles.cardTitle}>Methodology</Text><Bullets items={pack.appendix.methodology} limit={5}/></View><View style={styles.card}><Text style={styles.cardTitle}>Important limitations</Text><Bullets items={["Public records may omit non-monetary outcomes or confidential supervisory activity.","Currency normalisation supports comparison but does not restate the original legal outcome.","Theme classification is a decision-support aid and should be checked against the source notice.","RegActions does not infer firm-specific control effectiveness from enforcement history alone."]}/></View></View>
        <PageFooter />
      </Page>
    </Document>
  );
}

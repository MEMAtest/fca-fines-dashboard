import { describe, expect, test } from "vitest";
import {
  runQualityGate,
  type ArticleContent,
} from "../../scripts/lib/articleQuality.js";
import type { EnforcementRecord } from "../../scripts/lib/articleData.js";

// ─── Test Data ──────────────────────────────────��──────────────────────────────

const sampleRecords: EnforcementRecord[] = [
  { regulator: "FCA", firm_individual: "Acme Bank Ltd", amount: 1500000, date_issued: "2026-04-15", breach_type: "AML", summary: "Failure to maintain adequate AML controls" },
  { regulator: "SEC", firm_individual: "GlobalTrade Inc", amount: 5000000, date_issued: "2026-04-10", breach_type: "Market Abuse", summary: "Insider dealing violations" },
  { regulator: "BaFin", firm_individual: "Deutsche Finanz AG", amount: 800000, date_issued: "2026-04-08", breach_type: "AML", summary: "KYC failures" },
  { regulator: "ASIC", firm_individual: "Oceanic Capital Pty", amount: 2000000, date_issued: "2026-04-05", breach_type: "Consumer Protection", summary: "Mis-selling of financial products" },
  { regulator: "MAS", firm_individual: "Singapore Wealth Mgmt", amount: 3500000, date_issued: "2026-04-01", breach_type: "AML", summary: "Sanctions screening failures" },
];

function buildValidArticle(): ArticleContent {
  // Build content that passes all checks (must be 800+ words)
  const sections = [
    "## Overview\n\nThe regulatory enforcement landscape continues to intensify across global jurisdictions. In the first two weeks of April 2026, multiple regulators took decisive action against financial institutions for failures ranging from inadequate AML controls to market abuse. This analysis examines five significant enforcement actions totalling over £12.8M in fines, highlighting the cross-border nature of modern regulatory enforcement. The actions span the FCA in the United Kingdom, the SEC in the United States, BaFin in Germany, ASIC in Australia, and MAS in Singapore. The breadth of these actions demonstrates that regulatory bodies are working together more closely than ever before to ensure financial institutions maintain robust compliance frameworks. Each of these cases carries important lessons for compliance professionals and board members alike across the global financial services industry.",
    "## Key Enforcement Actions\n\nThe FCA imposed a £1.5M fine on Acme Bank Ltd for persistent failures in anti-money laundering controls. The regulator found that the bank had inadequate transaction monitoring systems in place for over two years, with automated alerts failing to flag suspicious transactions that should have triggered further investigation. The bank's compliance team was understaffed and lacked sufficient training according to the FCA's final notice.\n\nSeparately, the SEC levied a $5M penalty against GlobalTrade Inc for insider dealing violations involving senior executives trading ahead of material announcements. The investigation revealed a pattern of systematic information misuse spanning multiple quarters. BaFin also took action, fining Deutsche Finanz AG €800K for systematic KYC failures affecting over 500 customer accounts where documentation was either missing or outdated.\n\nIn the Asia-Pacific region, ASIC penalised Oceanic Capital Pty £2M for mis-selling financial products to retail investors who were not adequately informed of the risks involved. MAS imposed a £3.5M fine on Singapore Wealth Mgmt for sanctions screening failures that allowed prohibited transactions to pass through the institution undetected for several months.",
    "## Analysis\n\nSeveral patterns emerge from these enforcement actions. AML-related breaches account for three of the five actions (60%), reinforcing this as the dominant enforcement theme globally. The SEC action demonstrates that market abuse remains a priority even as regulators focus on financial crime. Notably, the geographic spread spanning Europe, North America, and Asia-Pacific shows regulatory enforcement is coordinated and simultaneous across jurisdictions. Fine amounts range from £800K to £5M, with an average of £2.56M per action.\n\nThe enforcement data shows that regulators are increasingly focused on the effectiveness of controls rather than their mere existence. Both the FCA and BaFin actions specifically cited inadequate implementation and monitoring as the core failures, not the absence of policies. This represents a clear shift in regulatory expectations that firms must respond to proactively. Transaction monitoring systems in particular are under scrutiny, with regulators expecting real-time detection capabilities and regular calibration of alert thresholds.",
    "## Regulatory Implications\n\nThese actions signal continued regulatory intensity for 2026. Financial institutions should note that AML controls remain the highest-risk area for enforcement. The FCA and BaFin actions specifically targeted transaction monitoring and KYC processes, suggesting that operational effectiveness rather than mere policy existence is the standard. Firms operating across multiple jurisdictions face compounding risk as regulators increasingly share intelligence and coordinate enforcement timing.\n\nThe convergence of enforcement standards across jurisdictions means that firms cannot rely on geographic arbitrage to avoid scrutiny. What constitutes adequate AML controls in London is increasingly aligned with expectations in Singapore, Frankfurt, and Sydney. Compliance teams should benchmark their practices against the highest common denominator rather than local minimum standards. The data confirms that regulators are exchanging information more frequently and timing their enforcement actions to maximise impact.\n\nBoard members and senior management should pay particular attention to the individual accountability aspects of these enforcement actions. Several regulators have signalled a willingness to pursue personal liability where governance failures contribute to systemic compliance weaknesses. The trend towards holding named individuals responsible means that passive oversight is no longer sufficient to discharge regulatory obligations. Firms should review their governance frameworks and ensure clear lines of accountability exist for all material compliance functions.",
    "## Looking Ahead\n\nThe enforcement pipeline for the second half of 2026 shows no signs of slowing. Both the FCA and SEC have publicly stated their intention to increase enforcement resourcing, with the FCA hiring additional investigators and the SEC expanding its digital assets enforcement unit. BaFin has similarly indicated that cross-border AML enforcement will remain a strategic priority through 2027. For financial institutions, the message is clear: investment in compliance infrastructure is not optional but essential for business continuity. The cost of non-compliance consistently exceeds the cost of proactive investment in systems and people. Institutions that demonstrate genuine commitment to compliance culture through adequate resourcing, regular testing, and board-level engagement are far less likely to face punitive enforcement outcomes.",
    "## Key Takeaways\n\n- AML remains the dominant enforcement theme, accounting for 60% of recent actions across all major jurisdictions\n- Cross-border enforcement coordination is increasing substantially between regulators globally\n- Operational effectiveness of controls is the standard, not just policy documentation on paper\n- Fine amounts average £2.56M across these five actions, representing significant financial impact\n- MAS and ASIC are matching European and US regulators in both enforcement intensity and scope\n- Firms should prioritise transaction monitoring system upgrades and KYC process improvements\n\nCompliance professionals should use these enforcement actions as a catalyst for reviewing their own control frameworks. The regulators have clearly signalled their priorities for the remainder of 2026 and institutions that fail to respond proactively risk finding themselves subject to similar enforcement outcomes.",
  ];

  return {
    title: "Global Enforcement Actions: April 2026 Analysis",
    excerpt: "Five major regulators imposed over £12.8M in fines across AML, market abuse, and consumer protection breaches in early April 2026, signalling sustained enforcement intensity.",
    content: sections.join("\n\n"),
    keywords: ["enforcement", "AML", "FCA", "SEC", "BaFin", "ASIC", "fines", "compliance"],
  };
}

// ─── Tests ────────────────���──────────────────────────���─────────────────────────

describe("Article Quality Gate", () => {
  test("passes a well-formed article", () => {
    const article = buildValidArticle();
    // Verify word count is sufficient
    const wordCount = article.content.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(800);
    const report = runQualityGate(article, sampleRecords);
    expect(report.requiredPassed).toBe(report.requiredTotal);
    expect(report.passed).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(70);
  });

  test("fails word_count when content is too short", () => {
    const article = buildValidArticle();
    article.content = "## Overview\n\nShort content here.";
    const report = runQualityGate(article, sampleRecords);
    const wordCheck = report.checks.find((c) => c.id === "word_count");
    expect(wordCheck?.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  test("fails section_structure when fewer than 4 H2 sections", () => {
    const article = buildValidArticle();
    article.content = "## Only One Section\n\n" + "Lorem ipsum ".repeat(200);
    const report = runQualityGate(article, sampleRecords);
    const structureCheck = report.checks.find(
      (c) => c.id === "section_structure",
    );
    expect(structureCheck?.passed).toBe(false);
  });

  test("passes data_accuracy when article mentions real regulators not in source data", () => {
    const article = buildValidArticle();
    // CSSF and ESMA are real regulators (in KNOWN_REGULATORS) but not in sampleRecords.
    // The check should pass — articles legitimately compare across regulators.
    article.content += "\n\nThe CSSF imposed additional sanctions across multiple jurisdictions.";
    article.content += "\n\nESMA coordinated a cross-border investigation into the matter.";
    const report = runQualityGate(article, sampleRecords);
    const dataCheck = report.checks.find((c) => c.id === "data_accuracy");
    expect(dataCheck?.passed).toBe(true);
  });

  test("fails no_hallucinated_firms with invented firm names", () => {
    const article = buildValidArticle();
    // Add multiple quoted firm names not in data
    article.content +=
      '\n\n"Phantom Capital Holdings" was also penalised. "Fake Trading Corp" received sanctions. "Another Invented LLC" was investigated.';
    const report = runQualityGate(article, sampleRecords);
    const firmsCheck = report.checks.find(
      (c) => c.id === "no_hallucinated_firms",
    );
    // With >1 unmatched quoted firm, this should fail
    expect(firmsCheck?.passed).toBe(false);
  });

  test("fails title_quality when title exceeds 70 chars", () => {
    const article = buildValidArticle();
    article.title =
      "This Is An Extremely Long Title That Exceeds The Maximum Seventy Character Limit For SEO Purposes";
    const report = runQualityGate(article, sampleRecords);
    const titleCheck = report.checks.find((c) => c.id === "title_quality");
    expect(titleCheck?.passed).toBe(false);
  });

  test("fails title_quality when excerpt is too short", () => {
    const article = buildValidArticle();
    article.excerpt = "Too short";
    const report = runQualityGate(article, sampleRecords);
    const titleCheck = report.checks.find((c) => c.id === "title_quality");
    expect(titleCheck?.passed).toBe(false);
  });

  test("fails editorial_tone with first person", () => {
    const article = buildValidArticle();
    article.content += "\n\nWe believe this trend will continue into 2027.";
    const report = runQualityGate(article, sampleRecords);
    const toneCheck = report.checks.find((c) => c.id === "editorial_tone");
    expect(toneCheck?.passed).toBe(false);
  });

  test("fails editorial_tone with hedging language", () => {
    const article = buildValidArticle();
    article.content +=
      "\n\nRegulators might increase enforcement in the coming months.";
    const report = runQualityGate(article, sampleRecords);
    const toneCheck = report.checks.find((c) => c.id === "editorial_tone");
    expect(toneCheck?.passed).toBe(false);
  });

  test("fails keyword_count with too few keywords", () => {
    const article = buildValidArticle();
    article.keywords = ["enforcement", "fines"];
    const report = runQualityGate(article, sampleRecords);
    const keywordCheck = report.checks.find((c) => c.id === "keyword_count");
    expect(keywordCheck?.passed).toBe(false);
  });

  test("detects duplicate paragraphs", () => {
    const article = buildValidArticle();
    const duplicatedParagraph =
      "This is a sufficiently long paragraph that should be detected as a duplicate when it appears multiple times in the article content.";
    article.content += `\n\n${duplicatedParagraph}\n\n${duplicatedParagraph}`;
    const report = runQualityGate(article, sampleRecords);
    const dupCheck = report.checks.find((c) => c.id === "no_duplicates");
    expect(dupCheck?.passed).toBe(false);
  });

  test("passes with empty source data (no validation needed)", () => {
    const article = buildValidArticle();
    const report = runQualityGate(article, []);
    const dataCheck = report.checks.find((c) => c.id === "data_accuracy");
    expect(dataCheck?.passed).toBe(true);
  });

  test("overall pass requires all required + at least 3 soft checks", () => {
    const article = buildValidArticle();
    // This article should pass — confirm counts
    const report = runQualityGate(article, sampleRecords);
    expect(report.requiredTotal).toBe(8);
    expect(report.softTotal).toBe(4);
    if (report.passed) {
      expect(report.requiredPassed).toBe(8);
      expect(report.softPassed).toBeGreaterThanOrEqual(3);
    }
  });
});

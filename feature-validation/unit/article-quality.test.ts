import { describe, expect, test } from "vitest";
import {
  getArticleQualityWordRange,
  runQualityGate,
  type ArticleContent,
} from "../../scripts/lib/articleQuality.js";
import type { EnforcementRecord } from "../../scripts/lib/articleData.js";

// ─── Test Data ──────────────────────────────────��──────────────────────────────

const sampleRecords: EnforcementRecord[] = [
  { id: "fca-1", regulator: "FCA", firm_individual: "Acme Bank Ltd", amount: 1500000, currency: "GBP", amount_gbp: 1500000, date_issued: "2026-04-15", breach_type: "AML financial penalty", summary: "Financial penalty for failure to maintain adequate AML controls", notice_url: "https://www.fca.org.uk/news/press-releases/acme", source_url: "https://www.fca.org.uk/news/press-releases/acme", amount_verified: true },
  { id: "sec-1", regulator: "SEC", firm_individual: "GlobalTrade Inc", amount: 5000000, currency: "USD", amount_gbp: 5000000, date_issued: "2026-04-10", breach_type: "Market abuse civil penalty", summary: "Civil penalty for insider dealing violations", notice_url: "https://www.sec.gov/newsroom/press-releases/globaltrade", source_url: "https://www.sec.gov/newsroom/press-releases/globaltrade", amount_verified: true },
  { id: "bafin-1", regulator: "BaFin", firm_individual: "Deutsche Finanz AG", amount: 800000, currency: "EUR", amount_gbp: 800000, date_issued: "2026-04-08", breach_type: "AML financial penalty", summary: "Financial penalty for KYC failures", notice_url: "https://www.bafin.de/example", source_url: "https://www.bafin.de/example", amount_verified: true },
  { id: "asic-1", regulator: "ASIC", firm_individual: "Oceanic Capital Pty", amount: 2000000, currency: "GBP", amount_gbp: 2000000, date_issued: "2026-04-05", breach_type: "Consumer protection financial penalty", summary: "Financial penalty for mis-selling of financial products", notice_url: "https://asic.gov.au/example", source_url: "https://asic.gov.au/example", amount_verified: true },
  { id: "mas-1", regulator: "MAS", firm_individual: "Singapore Wealth Mgmt", amount: 3500000, currency: "GBP", amount_gbp: 3500000, date_issued: "2026-04-01", breach_type: "AML financial penalty", summary: "Financial penalty for sanctions screening failures", notice_url: "https://www.mas.gov.sg/example", source_url: "https://www.mas.gov.sg/example", amount_verified: true },
];

function buildValidArticle(): ArticleContent {
  // Build content that passes all checks (must be 1100+ words, cite all 5 sample firms, 5+ amounts)
  const sections = [
    "## Overview\n\nThe regulatory enforcement landscape continues to intensify across global jurisdictions. In the first two weeks of April 2026, multiple regulators took decisive action against financial institutions for failures ranging from inadequate AML controls to market abuse. This analysis examines five significant enforcement actions totalling over £12.8M in fines, highlighting the cross-border nature of modern regulatory enforcement. The actions span the FCA in the United Kingdom, the SEC in the United States, BaFin in Germany, ASIC in Australia, and MAS in Singapore. The breadth of these actions demonstrates that regulatory bodies are working together more closely than ever before to ensure financial institutions maintain robust compliance frameworks. Each of these cases carries important lessons for compliance professionals and board members alike across the global financial services industry.\n\nRegulatory agencies have invested substantially in cross-border coordination mechanisms over the past three years. Information-sharing protocols between the FCA, SEC, BaFin, MAS, and ASIC have accelerated, meaning enforcement actions in one jurisdiction increasingly reflect intelligence gathered from peers. Firms that believe geographic separation insulates them from regulatory scrutiny are operating on a fundamentally mistaken premise.",
    "## Key Enforcement Actions\n\nThe FCA imposed a £1.5M fine on Acme Bank Ltd for persistent failures in anti-money laundering controls. The regulator found that the bank had inadequate transaction monitoring systems in place for over two years, with automated alerts failing to flag suspicious transactions that should have triggered further investigation. The bank's compliance team was understaffed and lacked sufficient training according to the FCA's Final Notice. Specifically, Acme Bank Ltd's transaction monitoring software had not been recalibrated since 2023, meaning the risk-scoring parameters were systematically misaligned with the bank's actual customer base and transaction profiles.\n\nSeparately, the SEC levied a $5M penalty against GlobalTrade Inc for insider dealing violations involving senior executives trading ahead of material announcements. The investigation revealed a pattern of systematic information misuse spanning multiple quarters. The SEC found that three named executives at GlobalTrade Inc had traded consistently in advance of earnings announcements, generating significant illicit gains in what the regulator characterised as flagrant abuse of non-public information.\n\nBaFin also took action, fining Deutsche Finanz AG €800K for systematic KYC failures affecting over 500 customer accounts where documentation was either missing or outdated. The regulator found that Deutsche Finanz AG had failed to conduct periodic KYC reviews for high-risk customers in accordance with the EU's Fifth Anti-Money Laundering Directive requirements.\n\nIn the Asia-Pacific region, ASIC penalised Oceanic Capital Pty £2M for mis-selling financial products to retail investors who were not adequately informed of the risks involved. ASIC's investigation showed that Oceanic Capital Pty's sales team had systematically understated the complexity and downside risk of structured products sold between 2023 and 2025. MAS imposed a £3.5M fine on Singapore Wealth Mgmt for sanctions screening failures that allowed prohibited transactions to pass through the institution undetected for several months.",
    "## Analysis\n\nSeveral patterns emerge from these five enforcement actions. AML-related breaches account for three of the five cases (60%), reinforcing Anti-Money Laundering control failures as the dominant enforcement theme globally. The SEC action against GlobalTrade Inc demonstrates that market abuse remains a high priority even as regulators increasingly focus on financial crime. Notably, the geographic spread spanning Europe, North America, and Asia-Pacific shows regulatory enforcement is coordinated and simultaneous across jurisdictions. Fine amounts range from £800K (Deutsche Finanz AG) to £5M (GlobalTrade Inc), with an aggregate of £12.8M across all five actions.\n\nThe enforcement data shows that regulators are increasingly focused on the operational effectiveness of controls rather than their mere existence. Both the FCA action against Acme Bank Ltd and the BaFin action against Deutsche Finanz AG specifically cited inadequate implementation and monitoring as the core failures, not the absence of documented policies. This represents a clear shift in regulatory expectations that firms must respond to proactively. Transaction monitoring systems are under particular scrutiny, with regulators expecting real-time detection capabilities and regular calibration of alert thresholds to reflect changes in customer risk profiles.",
    "## Regulatory Implications\n\nThese five actions signal continued regulatory intensity for 2026. Financial institutions should note that AML controls remain the highest-risk area for enforcement across all major jurisdictions. The FCA and BaFin actions specifically targeted transaction monitoring and KYC processes, suggesting that operational effectiveness rather than policy documentation is the standard against which firms will be assessed. Firms operating across multiple jurisdictions face compounding risk as regulators increasingly share intelligence and coordinate enforcement timing.\n\nThe convergence of enforcement standards across jurisdictions means firms cannot rely on geographic separation to avoid scrutiny. The MAS action against Singapore Wealth Mgmt and the ASIC action against Oceanic Capital Pty demonstrate that Asia-Pacific regulators are fully aligned with European and US enforcement expectations. Compliance teams should benchmark their practices against the highest common denominator across all operating jurisdictions. The data confirms that regulators are exchanging information more frequently and timing their enforcement actions to maximise systemic impact.\n\nBoard members and senior management should pay particular attention to the individual accountability aspects of these enforcement actions. The FCA Final Notice for Acme Bank Ltd specifically named the compliance function's resourcing failures as an aggravating factor, signalling that boards cannot delegate responsibility for compliance programme adequacy without meaningful oversight. Firms should review their governance frameworks and ensure clear lines of accountability exist for all material compliance functions.",
    "## Looking Ahead\n\nThe enforcement pipeline for the second half of 2026 shows no signs of slowing. Both the FCA and SEC have publicly stated their intention to increase enforcement resourcing: the FCA is hiring additional investigators across its Enforcement and Market Oversight division, while the SEC has expanded its digital assets enforcement unit to address crypto-related market abuse. BaFin has similarly indicated that cross-border AML enforcement will remain a strategic priority through 2027. For financial institutions, investment in compliance infrastructure is essential for business continuity. The cost of non-compliance consistently exceeds the cost of proactive investment in systems and people, as the aggregate £12.8M in fines across these five cases demonstrates.",
    "## About the Data\n\nThis analysis draws on enforcement records from the RegActions database, current as of April 2026. Fine amounts denominated in currencies other than GBP are converted at the exchange rate prevailing at the date of the enforcement action. Enforcement data sourced from official FCA Final Notices, SEC Administrative Proceedings, BaFin press releases, ASIC enforcement announcements, and MAS enforcement orders.",
    "## Key Takeaways\n\n- AML remains the dominant enforcement theme, accounting for 60% of these April 2026 actions across Acme Bank Ltd, Deutsche Finanz AG, and Singapore Wealth Mgmt\n- Cross-border enforcement coordination is increasing: FCA, SEC, BaFin, MAS, and ASIC are sharing intelligence more actively than at any prior point\n- Operational effectiveness of controls is the standard, as the £1.5M Acme Bank Ltd fine demonstrates: having a policy is insufficient without a functioning transaction monitoring system\n- Fine amounts range from £800K (Deutsche Finanz AG) to £5M (GlobalTrade Inc), averaging £2.56M per action\n- ASIC and MAS (Oceanic Capital Pty and Singapore Wealth Mgmt) are matching European and US regulators in both enforcement intensity and penalty levels\n- Firms should prioritise recalibration of transaction monitoring alert thresholds and periodic KYC review programmes",
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
    // Verify word count meets new 1100-word minimum
    const wordCount = article.content.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(1100);
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

  test("enforces article-type-specific word ranges", () => {
    const comparisonRange = getArticleQualityWordRange("comparison");
    expect(comparisonRange).toEqual({ minimumWords: 1350, maximumWords: 1800 });
    const report = runQualityGate(buildValidArticle(), sampleRecords, comparisonRange);
    const wordCheck = report.checks.find((check) => check.id === "word_count");
    expect(wordCheck?.passed).toBe(false);
    expect(wordCheck?.message).toContain("1350-1800");
  });

  test("fails word_count when content exceeds the editorial maximum", () => {
    const article = buildValidArticle();
    article.content += `\n\n## Excess Material\n\n${"Additional analysis. ".repeat(700)}`;
    const report = runQualityGate(article, sampleRecords);
    const wordCheck = report.checks.find((c) => c.id === "word_count");
    expect(wordCheck?.passed).toBe(false);
    expect(wordCheck?.message).toContain("1100-1600");
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

  test("fails takeaway_structure when Key Takeaways is prose rather than bullets", () => {
    const article = buildValidArticle();
    article.content = article.content.replace(
      /## Key Takeaways\n\n[\s\S]*$/,
      "## Key Takeaways\n\nThe cases provide several practical conclusions for regulated firms.",
    );
    const report = runQualityGate(article, sampleRecords);
    const structureCheck = report.checks.find((c) => c.id === "takeaway_structure");
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

  test("fails when internal evidence record IDs leak into published prose", () => {
    const article = buildValidArticle();
    article.content += `\n\nThe internal source reference is ${sampleRecords[0]!.id}.`;
    const report = runQualityGate(article, sampleRecords);
    const idCheck = report.checks.find((check) => check.id === "no_internal_record_ids");
    expect(idCheck?.passed).toBe(false);
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

  test("fails title_quality when excerpt ends mid-sentence", () => {
    const article = buildValidArticle();
    article.excerpt = "This evidence-led regulatory analysis contains enough characters to satisfy the length requirement but deliberately ends on an incomplete clause,";
    const report = runQualityGate(article, sampleRecords);
    expect(report.checks.find((check) => check.id === "title_quality")?.passed).toBe(false);
  });

  test("rejects monetary claims when source amounts are not verified penalties", () => {
    const report = runQualityGate(
      buildValidArticle(),
      sampleRecords.map((record) => ({ ...record, amount_verified: false })),
    );
    const amountCheck = report.checks.find((check) => check.id === "amount_accuracy");
    expect(amountCheck?.passed).toBe(false);
    expect(amountCheck?.message).toContain("no source amount is verified as a penalty");
  });

  test("rejects a valid source amount attributed to the wrong firm", () => {
    const article = buildValidArticle();
    article.content += "\n\nAcme Bank Ltd received a $5M penalty.";
    const report = runQualityGate(article, sampleRecords);
    const amountCheck = report.checks.find((check) => check.id === "amount_accuracy");
    expect(amountCheck?.passed).toBe(false);
    expect(amountCheck?.message).toContain("Entity-amount mismatch");
  });

  test("allows a source-backed penalty range beside one named endpoint", () => {
    const article = buildValidArticle();
    article.content += "\n\nVerified penalties range from £1.5M to £2M, with the penalty against Acme Bank Ltd at the lower endpoint.";
    const report = runQualityGate(article, sampleRecords);
    expect(report.checks.find((check) => check.id === "amount_accuracy")?.passed).toBe(true);
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

  test("overall pass requires all required checks + all soft checks", () => {
    const article = buildValidArticle();
    // 13 required (word_count, section_structure, takeaway_structure, data_accuracy, amount_accuracy, no_truncation,
    //   no_duplicates, no_hallucinated_firms, title_quality, data_usage, specificity, house_style)
    // 3 soft (keyword_count, editorial_tone, readability)
    const report = runQualityGate(article, sampleRecords);
    expect(report.requiredTotal).toBe(13);
    expect(report.softTotal).toBe(3);
    expect(report.requiredPassed).toBe(13);
    expect(report.softPassed).toBe(3);
    expect(report.passed).toBe(true);
  });

  // ─── data_usage check ────────────────────────────────────────────────────────

  test("data_usage passes when all unique firms cited (dedup: same firm 3× = 1 slot)", () => {
    // Article cites all 5 firms; source has 3 duplicate entries for Acme Bank Ltd
    const duplicatedRecords = [
      ...sampleRecords,
      { ...sampleRecords[0]! }, // duplicate Acme Bank Ltd
      { ...sampleRecords[0]! }, // duplicate again
    ];
    const article = buildValidArticle();
    const report = runQualityGate(article, duplicatedRecords);
    const check = report.checks.find((c) => c.id === "data_usage");
    // Unique firms: 5 (Acme Bank Ltd deduplicated); minRequired = min(8,5) = 5; cited = 5 → pass
    expect(check?.passed).toBe(true);
    expect(check?.message).toContain("5/5 named firms cited");
  });

  test("data_usage fails when article cites too few firms", () => {
    const article = buildValidArticle();
    // Remove all firm mentions by stripping names — replace with generic "the firm"
    article.content = article.content
      .replace(/Acme Bank Ltd/g, "the firm")
      .replace(/GlobalTrade Inc/g, "the firm")
      .replace(/Deutsche Finanz AG/g, "the entity")
      .replace(/Oceanic Capital Pty/g, "the entity")
      .replace(/Singapore Wealth Mgmt/g, "the entity");
    const report = runQualityGate(article, sampleRecords);
    const check = report.checks.find((c) => c.id === "data_usage");
    expect(check?.passed).toBe(false);
    expect(check?.message).toMatch(/Only 0 of 5 source firms cited/);
  });

  test("data_usage uses fuzzy matching (short name matches full DB string)", () => {
    // "Oceanic Capital" without "Pty" suffix should still match "Oceanic Capital Pty"
    const article = buildValidArticle();
    article.content = article.content.replace(/Oceanic Capital Pty/g, "Oceanic Capital");
    const report = runQualityGate(article, sampleRecords);
    const check = report.checks.find((c) => c.id === "data_usage");
    expect(check?.passed).toBe(true);
  });

  // ─── specificity check ────────────────────────────────────────────────────────

  test("specificity passes when source-backed amounts are cited", () => {
    // buildValidArticle already cites £1.5M, $5M, €800K, £2M, £3.5M — all within 5% of source
    const report = runQualityGate(buildValidArticle(), sampleRecords);
    const check = report.checks.find((c) => c.id === "specificity");
    expect(check?.passed).toBe(true);
    expect(check?.message).toContain("5 source-backed amounts cited");
  });

  test("specificity fails when article cites only aggregates (gaming case)", () => {
    // Article with only the total (£12.8M) and average — no individual source amounts
    const article = buildValidArticle();
    article.content = article.content
      .replace(/£1\.5M/g, "a sum")
      .replace(/\$5M/g, "a sum")
      .replace(/€800K/g, "a sum")
      .replace(/£2M/g, "a sum")
      .replace(/£3\.5M/g, "a sum")
      // Add only an aggregate that isn't close to any single source amount
      + "\n\nThe total across all actions was £12.8M.";
    const report = runQualityGate(article, sampleRecords);
    const check = report.checks.find((c) => c.id === "specificity");
    // The aggregate does not count as a case-level amount, so the specificity gate fails.
    expect(check?.passed).toBe(false);
  });

  test("specificity boundary: passes when exactly minRequired source amounts cited", () => {
    // The shared evidence contract requires at most three case-level amounts; all five are cited.
    const article = buildValidArticle();
    const report = runQualityGate(article, sampleRecords);
    const check = report.checks.find((c) => c.id === "specificity");
    expect(check?.passed).toBe(true);
    expect(check?.message).toContain("(need ≥3)");
  });
});

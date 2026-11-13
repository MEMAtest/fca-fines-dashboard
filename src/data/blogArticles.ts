// Shared blog article metadata — consumed by both React components and build scripts.
// NO React/JSX imports here. The `icon` field lives in Blog.tsx only.

import { regulatorBlogs } from "./regulatorBlogs.js";
import { blogArticleEditorialUpgrades } from "./blogArticleEditorialUpgrades.js";
import { fcaMonthly2026Articles } from "./fcaMonthly2026/index.js";
import { dataStudyArticles } from "./blogDataStudies.js";
import { blogCataloguePart01 } from "./blogCatalogue/part01.js";
import { blogCataloguePart02 } from "./blogCatalogue/part02.js";
import { blogCataloguePart03 } from "./blogCatalogue/part03.js";
import { blogCataloguePart04 } from "./blogCatalogue/part04.js";
import { blogCataloguePart05 } from "./blogCatalogue/part05.js";
import { blogCataloguePart06 } from "./blogCatalogue/part06.js";
import { blogCataloguePart07 } from "./blogCatalogue/part07.js";
import { yearlyArticleData } from "./yearlyArticleData.js";
import type {
  ArticleStatus,
  ArticleType,
  BlogArticleMeta,
  StructuredRegulatorMetric,
  StructuredRegulatorSection,
  StructuredRegulatorLink,
  StructuredRegulatorSignal,
  StructuredRegulatorFaq,
  StructuredRegulatorArticle,
  YearlyArticleMeta,
  YearlyArticleSource,
} from "./blogArticleTypes.js";
import type { EditorialManifest, PublicationManifest } from "../types/editorial.js";
import type { ArticleRevisionManifest } from "../types/articleRevision.js";

const CONTROLLED_REVISION_SLUGS = new Set([
  "aml-kyc-enforcement-trends",
  "cyber-operational-resilience-enforcement",
  "regulatory-roundup-october-2026",
]);
const REQUIRED_REVISION_CHECK_IDS = [
  "word_count", "section_structure", "takeaway_structure", "data_accuracy",
  "amount_accuracy", "no_truncation", "no_duplicates", "no_hallucinated_firms",
  "no_internal_record_ids", "title_quality", "house_style", "data_usage",
  "specificity", "keyword_count", "editorial_tone", "readability",
  "article_evidence_contract", "grounded_cyber_topic",
];

export type {
  ArticleStatus,
  ArticleType,
  BlogArticleMeta,
  StructuredRegulatorMetric,
  StructuredRegulatorSection,
  StructuredRegulatorLink,
  StructuredRegulatorSignal,
  StructuredRegulatorFaq,
  StructuredRegulatorArticle,
  YearlyArticleMeta,
};


export function isPublished(
  article: {
    slug?: string;
    status?: ArticleStatus | string;
    dateISO: string;
    generatedBy?: "ai" | "manual";
    editorialManifest?: EditorialManifest;
    publicationManifest?: PublicationManifest;
    revisionManifest?: ArticleRevisionManifest;
    updatedAt?: string;
    dateModified?: string;
  },
  todayISO = new Date().toISOString().slice(0, 10),
): boolean {
  if (article.generatedBy === "ai") {
    const manifest = article.editorialManifest;
    const publication = article.publicationManifest;
    const revision = article.revisionManifest;
    const revisionCheckIds = Array.isArray(revision?.checks)
      ? revision.checks.map((check) => check.id)
      : [];
    const revisionSourceIds = Array.isArray(revision?.sourceRecordIds)
      ? revision.sourceRecordIds
      : [];
    const revisionSources = Array.isArray(revision?.sources) ? revision.sources : [];
    const validRevision = Boolean(
      revision?.version === 1 &&
      CONTROLLED_REVISION_SLUGS.has(article.slug || "") &&
      revision.slug === article.slug &&
      /^[a-f0-9]{64}$/.test(revision.contentHash) &&
      /^[a-f0-9]{64}$/.test(revision.previousContentHash) &&
      /^[a-f0-9]{64}$/.test(revision.sourceContractHash) &&
      /^[a-f0-9]{64}$/.test(revision.approvalManifestSha256) &&
      revision.operatorRecord?.identity === "root-primary-qa" &&
      revision.operatorRecord.result === "passed" &&
      revision.revisedAt === revision.operatorRecord.completedAt &&
      Number.isFinite(Date.parse(revision.revisedAt)) &&
      revision.revisedAt.slice(0, 10) <= todayISO &&
      article.dateModified === revision.revisedAt &&
      article.updatedAt === revision.revisedAt.slice(0, 10) &&
      new Set(revisionCheckIds).size === revisionCheckIds.length &&
      REQUIRED_REVISION_CHECK_IDS.every((id) => revision?.checks.some((check) => check.id === id && check.passed === true)) &&
      revisionSourceIds.length > 0 &&
      new Set(revisionSourceIds).size === revisionSourceIds.length &&
      revisionSources.length > 0 &&
      new Set(revisionSources.map((source) => source.id)).size === revisionSources.length &&
      revisionSources.every((source) => revisionSourceIds.includes(source.id)) &&
      /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(article.dateISO) &&
      (article.status === "published" || article.status === "scheduled"),
    );
    if (validRevision) {
      if (article.status === "scheduled") return article.dateISO <= todayISO;
      return true;
    }
    if (
      !manifest ||
      !publication ||
      manifest.headApproval?.status !== "approved" ||
      manifest.headApproval.contentHash !== manifest.contentHash ||
      publication.contentHash !== manifest.contentHash ||
      publication.approvedBy !== "head-editorial-agent" ||
      publication.publishedBy !== "publisher-agent" ||
      !new Set(["scheduled", "published"]).has(manifest.status)
    ) {
      return false;
    }
  }
  if (!article.status || article.status === "published") return true;
  if (article.status === "draft") return false;
  return article.dateISO <= todayISO;
}

const baseBlogArticles: BlogArticleMeta[] = [
  ...dataStudyArticles,
  ...blogCataloguePart01,
  ...blogCataloguePart02,
  ...fcaMonthly2026Articles,
  ...blogCataloguePart03,
  ...blogCataloguePart04,
  ...blogCataloguePart05,
  ...blogCataloguePart06,
  ...blogCataloguePart07,
  {
    id: "ai-board-guide-aml-controls",
    slug: "board-guide-aml-controls",
    title: "Board Guide: Enhancing AML Controls Through Enforcement Insights",
    seoTitle: "Board Guide: Enhancing AML Controls Through Enforcement Insights | RegActions",
    excerpt: "Recent enforcement data highlights persistent Anti-Money Laundering (AML) control failures across global regulators. This analysis identifies common deficiencies in independent testing, risk-based procedures.",
    content: `## Overview
Recent enforcement data reveals a concentrated period of Anti-Money Laundering (AML) supervision. Regulators in multiple jurisdictions have taken action against firms for fundamental control failures. The core deficiencies centre on three critical programme pillars: independent testing, risk-based procedures, and suspicious activity detection. These are not isolated incidents but represent a consistent pattern of supervisory focus across different firm types and regions. The data provides a clear snapshot of where board oversight must be directed to ensure programme effectiveness and regulatory compliance. Failures in these areas have led to significant regulatory consequences, underscoring their importance. For instance, FINRA fined MCAP LLC USD 15,000 for failures in independent testing of its AML programme. Similarly, The Ultima Global Markets (USA), Inc. was fined USD 100,000 by FINRA for an AML programme that failed to detect suspicious activity in low-priced securities. Concurrently, Banca d'Italia has issued sanctions against several institutions, including Banco di Credito Paolo Azzoaglio Spa, Banca Popolare Commerciale Spa, and Cherry Bank Spa. While the monetary amounts for these Italian actions are not verified, the regulatory orders confirm the enforcement outcomes. This pattern across FINRA and Banca d'Italia highlights that these programme pillars are universal regulatory expectations, not jurisdiction-specific requirements.

## Key Enforcement Actions
Recent enforcement actions by FINRA, Banca d'Italia (BDI), and the Central Bank of the UAE (CBUAE) illustrate specific AML control failures. These cases show deficiencies in independent testing, correspondent account monitoring, and the maintenance of regulatory licences. The outcomes include fines, sanctions, and licence revocation, demonstrating the tangible consequences of inadequate controls. The following examples are drawn from official sources and highlight recurring themes across jurisdictions. They serve as concrete reference points for boards assessing their own AML frameworks.

FINRA censured and fined MCAP LLC USD 15,000 for failing to conduct any independent AML testing in 2021 and 2022. Its testing in 2023 and 2024 was unreasonable. FINRA also censured and fined The Ultima Global Markets (USA), Inc. USD 100,000. This firm's AML programme was not reasonably designed to detect suspicious activity in low-priced securities transactions within correspondent accounts. FINRA also censured and fined Moors & Cabot, Inc. for failing to develop and implement an AML compliance programme. This programme was not reasonably designed to detect and report suspicious transactions; the monetary amount is not verified.

Banca d'Italia sanctioned Banco di Credito Paolo Azzoaglio Spa for AML violations; the monetary amount is not verified. The CBUAE revoked the licence of Omda Exchange, struck it off the register, and imposed a financial sanction following AML and regulatory failures; the monetary amount is not verified.

These actions demonstrate that regulators impose significant penalties for non-compliance. Consequences range from fines to the loss of operating licences. Diligent oversight of AML programmes is a critical board responsibility. The cases are illustrative, not exhaustive, of the broader regulatory landscape. They represent a snapshot of enforcement activity within the specified period. Boards can use these examples to benchmark their own control environments.

## Analysis
The selected enforcement actions reveal recurring deficiencies in three core areas of anti-money laundering control frameworks. These patterns persist across multiple firms and regulators, indicating systemic weaknesses rather than isolated lapses. The failure to conduct adequate independent testing is a primary concern. MCAP LLC, for instance, failed to conduct any independent testing of its AML programme in 2021 and 2022. Its testing in 2023 and 2024 was deemed unreasonable by FINRA, which imposed a censure and a verified fine of USD 15,000. This case underscores that the mere existence of a testing function is insufficient; the testing must be both performed and reasonable in scope and execution. A second pattern involves the absence of risk-based procedures tailored to specific products or customer types. The Ultima Global Markets (USA), Inc. was fined USD 100,000 by FINRA for a programme that failed to detect suspicious activity in low-priced securities transactions within correspondent accounts. Similarly, UBS Financial Services Inc. lacked procedures for monitoring foreign currency wires, while Outset Global Trading Limited's programme was not reasonably designed for its role in executing transactions in thinly traded low-priced securities. These cases demonstrate that generic AML programmes are inadequate for firms with specialised business lines. The third critical gap is in the fundamental design and implementation of suspicious activity monitoring programmes. FINRA found that RBC Capital Markets, LLC failed to develop and implement a programme reasonably designed to detect and report suspicious transactions from February 2016 through September 2023. Beta Capital Securities LLC d/b/a Creand Securities had a similar failure from October 2019 to July 2023. These prolonged periods of non-compliance highlight a foundational weakness: the failure to establish a monitoring system capable of meeting its core objective. The convergence of these three failure modes across different firms suggests that effective AML governance requires boards to scrutinise not just policy documents but the operational reality of testing, risk-based tailoring, and transaction monitoring efficacy.

## Regulatory Implications
Recent enforcement actions demonstrate that regulators are scrutinising the operational reality of AML programmes. They require controls to be dynamic, tested, and tailored to a firm's actual risk profile and business activities. The evidence shows a focus on programme implementation and independent testing, not just written policies. For example, MCAP LLC was fined USD 15,000 by FINRA for failing to conduct any independent testing of its AML programme in 2021 and 2022, and for unreasonable testing in 2023 and 2024. Similarly, Prime Number Capital, LLC and TradingBlock were both censured by FINRA for failing to establish and implement reasonably designed AML programmes, with Prime Number also cited for inadequate testing. These actions highlight that a programme's design must be capable of detecting specific risks, such as suspicious transactions in low-priced securities or foreign currency wires. Regulators across jurisdictions are taking firm measures for such failures. The Central Bank of the UAE revoked the licence of Omda Exchange and imposed a financial sanction following AML failures. The OCC issued a cease-and-desist order to American Express National Bank covering BSA independent testing and internal controls. The SFC reprimanded and fined Zheng Da International Financial Holding Limited and suspended a responsible officer for AML/CFT failures. These varied outcomes, from fines to licence revocation and orders, underscore that boards must ensure their AML controls are effectively executed and validated through rigorous, ongoing testing.

## Key Takeaways
*   FINRA fined MCAP LLC USD 15,000 for failing to conduct independent testing of its anti-money laundering (AML) programme in 2021 and 2022, with testing in 2023 and 2024 deemed unreasonable.
*   The Ultima Global Markets (USA), Inc. received a USD 100,000 fine from FINRA for failing to establish and implement an AML programme capable of detecting and reporting suspicious activity related to low-priced securities transactions from August 2021 to September 2024.
*   UBS Financial Services Inc. failed to establish and implement adequate AML compliance policies and procedures from January 2019 to June 2023, which should have detected and reported suspicious foreign currency wire transactions.
*   Beta Capital Securities LLC d/b/a Creand Securities did not establish and implement an AML programme reasonably designed to detect and report suspicious transactions, including a lack of risk-based procedures, from October 2019 to July 2023.
*   Brentwood Capital Advisers LLC failed to establish and implement an AML compliance programme that should have identified and verified the beneficial owners of its legal entity customers between January 2021 and December 2025.

## About the Data

This analysis uses 25 unique source records linked to official regulatory material across 6 regulators (BDI, CBI, CBUAE, FINRA, OCC, SFC). The evidence dates run from 2025-11-06 to 2026-10-08. 2 source records have a verified penalty amount, comprising 2 distinct source amounts. The selection supports this analysis but is not a complete catalogue of all actions in the period. Monetary values retain their source currency; GBP-normalised values are reserved for explicitly labelled aggregate charts. Other records may describe cancellations, prohibitions, investigations, orders or sanctions whose monetary value is not verified.

`,
    category: "Board Governance",
    readTime: "7 min read",
    date: "13 November 2026",
    dateISO: "2026-11-13",
    keywords: ["AML controls","independent testing","risk-based procedures","suspicious activity monitoring","enforcement trends","regulatory compliance","board oversight","FINRA"],
    status: "published",
    generatedBy: "ai",
    generatedAt: "2026-11-13T03:09:22.623Z",
    articleType: "thematic",
    editorialManifest: {"version":1,"status":"published","contentHash":"20d318be611c3aee36c7947169cca67120b3d862db4614a001806877ce2d523c","generatedAt":"2026-11-13T03:09:22.623Z","generationModel":"deepseek/deepseek-v3.2","promptVersion":"regactions-editorial-v2.1","sources":[{"id":"source:03541267-9ca2-46cb-9283-ae54c716a2b5","url":"https://www.finra.org/sites/default/files/fda_documents/2023077010801%20MCAP%20LLC%20CRD%20139515%20AWC%20ks.pdf","title":"FINRA action concerning MCAP LLC","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-04-09. Verified penalty amount: USD 15000. Evidence summary: MCAP failed to conduct any independent testing of its anti-money laundering (AML) program in calendar years 2021 and 2022, and the firm’s independent testing of its AML program in calendar years 2023 and 2024 was unreasonable, in violation of FINRA Rules 3310(c) and 2010. For these violations, MCAP is censured and fined $15,000."},{"id":"source:f3b7e9d9-d15f-4184-a013-94a254b33622","url":"https://www.finra.org/sites/default/files/fda_documents/2023078062701%20The%20Ultima%20Global%20Markets%20%28USA%29%2C%20Inc.%2C%20fka%20BCS%20Global%20Markets%20CRD%2047895%20AWC%20vrp.pdf","title":"FINRA action concerning The Ultima Global Markets (USA), Inc., fka BCS Global Markets","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-03-16. Verified penalty amount: USD 100000. Evidence summary: From at least August 2021 through September 2024, Ultima failed to establish and implement an anti-money laundering (AML) program that could be reasonably expected to detect and cause the reporting of potentially suspicious activity relating to low-priced securities transactions in correspondent accounts controlled by the firm’s affiliated FFIs, who traded on behalf of undisclosed customers. As a result, Ultima violated FINRA Rules 3310(a), 3310(f)(ii), and 2010. During the same period, Ultima also failed to establish and implement a reasonably designed due diligence program for correspondent accounts of FFIs, including by failing to conduct periodic reviews of account activity to determine whether the activity was consistent with the type, purpose, and anticipated activity of the account. As a result, the firm violated FINRA Rules 3310(b) and 2010. For these violations, Ultima is censured and fined $100,000..."},{"id":"source:4a1be5b1-a429-428e-9dcf-a85b9553a586","url":"https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/documenti/2026/Banco_di_Credito_Paolo_Azzoaglio_Spa_provv_281_del_29_09_2026_AML.pdf","title":"BDI action concerning Banco di Credito Paolo Azzoaglio Spa","publisher":"BDI","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-09-29. No verified penalty amount. Evidence summary: Banco di Credito Paolo Azzoaglio Spa was sanctioned by Banca d'Italia. Banco di Credito Paolo Azzoaglio Spa - Provvedimento n. 281 del 29 settembre 2026 (AML)"},{"id":"source:f88efa7c-7864-4ca5-a3e4-85f6aa5fa3e3","url":"https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/documenti/2026/Banca_Popolare_Commerciale_Spa_provv_190_del_23_06_2026_AML.pdf","title":"BDI action concerning Banca Popolare Commerciale Spa","publisher":"BDI","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-06-23. No verified penalty amount. Evidence summary: Banca Popolare Commerciale Spa was sanctioned by Banca d'Italia. Banca Popolare Commerciale Spa - Provvedimento n. 190 del 23 giugno 2026 (AML)"},{"id":"source:602cb8d4-e137-4606-bf2b-c6ef06fa096a","url":"https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/documenti/2026/Cherry_Bank_Spa_provv_112_del_21_04_2026_AML.pdf","title":"BDI action concerning Cherry Bank Spa","publisher":"BDI","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-04-21. No verified penalty amount. Evidence summary: Cherry Bank Spa was sanctioned by Banca d'Italia. Cherry Bank Spa - Provvedimento n. 112 del 21 aprile 2026 (AML)"},{"id":"source:1c14069d-5f7e-4bcf-b7ae-50899d6809fc","url":"https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/documenti/2026/Banca_Progetto_Spa_in_a.s._provv_89_del_30_03_2026_AML.pdf","title":"BDI action concerning Banca Progetto Spa in a.s.","publisher":"BDI","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-03-30. No verified penalty amount. Evidence summary: Banca Progetto Spa in a.s. was sanctioned by Banca d'Italia. Banca Progetto Spa in a.s. - Provvedimento n. 89 del 30 marzo 2026 (AML)"},{"id":"source:6b37de96-54f0-4ba5-b18d-9cee44632ab5","url":"https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/documenti/2026/Banca_Popolare_Pugliese_Scpa_provv_28_del_03_02_2026_AML.pdf","title":"BDI action concerning Banca Popolare Pugliese Scpa","publisher":"BDI","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-02-03. No verified penalty amount. Evidence summary: Banca Popolare Pugliese Scpa was sanctioned by Banca d'Italia. Banca Popolare Pugliese Scpa - Provvedimento n. 28 del 3 febbraio 2026 (AML)"},{"id":"source:cd9b073d-b271-4b5a-bc34-9c4fbfc6a706","url":"https://www.centralbank.ae/en/news-and-publications/news-and-insights/press-release/cbuae-revokes-the-licence-of-omda-exchange-and-imposes-a-financial-sanction-of-aed-10-million/","title":"CBUAE action concerning Omda Exchange","publisher":"CBUAE","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2025-12-23. No verified penalty amount. Evidence summary: The Central Bank of the UAE revoked the licence of Omda Exchange, struck it off the register, and imposed a financial sanction of [unverified monetary figure removed] following AML and regulatory failures."},{"id":"source:b608e9a0-0b28-4cc1-a816-5c0b35a26ca2","url":"https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/documenti/2026/MAG_2_Finance_Soc.Coop._provv_372_del_25_11_2025.pdf","title":"BDI action concerning MAG 2 Finance Soc. Coop.","publisher":"BDI","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2025-11-25. No verified penalty amount. Evidence summary: MAG 2 Finance Soc. Coop. was sanctioned by Banca d'Italia. MAG 2 Finance Soc. Coop. - Provvedimento n. 372 del 25 novembre 2025 (AML)"},{"id":"source:4d39cdcd-9d36-4698-982c-48ea6f16c867","url":"https://apps.occ.gov/EASearch?q=American%20Express%20National%20Bank&cat=&srt=&pgsz=100","title":"OCC action concerning American Express National Bank","publisher":"OCC","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-10-08. No verified penalty amount. Evidence summary: American Express National Bank subject to OCC Cease-and-Desist Order (C&D) or Personal Cease-and-Desist Order (PC&D). Subject matters: BSA Independent Testing/Audit; BSA Internal Controls; BSA Pillar Violation / 12 CFR 21.21(d); BSA Program Violation / 12 CFR 21.21; BSA Risk Assessment; BSA SAR Violation / 12 CFR 21.11 or 163.180; BSA Training; BSA Violation Cited; BSA/AML; Customer/Enhanced Due Diligence (CDD/EDD); SAR/CTR Monitoring/Filing Issue"},{"id":"source:db4dca30-cb65-4e72-bbd0-a2bacc045081","url":"https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/doc?refNo=26PR158","title":"SFC action concerning Zheng Da International Financial Holding Limited","publisher":"SFC","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-09-29. No verified penalty amount. Evidence summary: The Securities and Futures Commission (SFC) has reprimanded and fined Zheng Da International Financial Holding Limited (Zheng Da) [unverified monetary figure removed] for failures in complying with anti-money laundering and counter-financing of terrorism (AML/CFT) and other regulatory requirements between 1 December 2021 and 30 September 2023 (Relevant Period) (Note 1). The SFC has also suspended the licence of Zheng Da’s responsible officer, Mr Zhong Hao, for seven months from 28 September 2026 to 27 April 2027 (Note 2)"},{"id":"source:f310d0bf-b8b9-4f5f-a088-4e44bb29cdae","url":"https://data-portal.finra.org/fda_documents/2022073341601%20Moors%20%26%20Cabot%2C%20Inc.%20CRD%20594%20AWC%20vrp.pdf","title":"FINRA action concerning Moors & Cabot; Inc.","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-08-24. No verified penalty amount. Evidence summary: From at least January 2020 to May 2024, Moors & Cabot violated FINRA Rules 3310(a), 3310(f)(ii), and 2010 by failing to develop and implement an anti-money laundering (AML) compliance program reasonably expected to detect and cause the reporting of suspicious transactions, including transactions ..."},{"id":"source:4cd1bf16-7d06-4bf9-8fbf-14d8a3ef6ded","url":"https://data-portal.finra.org/fda_documents/2021069426901%20UBS%20Financial%20Services%20Inc.%20CRD%208174%20AWC%20vrp.pdf","title":"FINRA action concerning UBS Financial Services Inc.","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-07-31. No verified penalty amount. Evidence summary: From January 2019 through June 2023, UBS Financial failed to establish and implement policies and procedures for its AML compliance program that could be reasonably expected to detect and cause the reporting of suspicious transactions involving foreign currency wires. As a result, the firm failed..."},{"id":"source:08c83b79-5573-45ef-946b-4e7e20a04341","url":"https://data-portal.finra.org/fda_documents/2022075967301%20RBC%20Capital%20Markets%20LLC%20CRD%2031194%20AWC%20lp%20.pdf","title":"FINRA action concerning RBC Capital Markets; LLC","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-07-28. No verified penalty amount. Evidence summary: From February 2016 through September 2023, RBC failed to develop and implement an anti-money laundering (AML) compliance program reasonably designed to detect and cause the reporting of suspicious transactions, in violation of FINRA Rules 3310(a), 3310(f)(ii) and 2010. For these violations, RBC i..."},{"id":"source:c8f196d0-54af-4312-8b02-c5c3fb66ddcd","url":"https://data-portal.finra.org/fda_documents/2022073419001%20Beta%20Capital%20Securities%20LLC%20dba%20Creand%20Securities%20CRD%2038964%20AWC%20lp.pdf","title":"FINRA action concerning Beta Capital Securities LLC d/b/a Creand Securities","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-06-29. No verified penalty amount. Evidence summary: From October 2019 to July 2023, Beta Capital failed to establish and implement an antimoney laundering (AML) program that was reasonably designed to detect and cause the reporting of suspicious transactions. During the same period, the firm’s AML program also failed to include appropriate risk-ba..."},{"id":"source:6aa8bcc1-be1c-49bc-98cc-d7f4a1ad9677","url":"https://data-portal.finra.org/fda_documents/2024080217601%20Outset%20Global%20Trading%20Limited%20CRD%20281065%20AWC%20vrp.pdf","title":"FINRA action concerning Outset Global Trading Limited","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-06-16. No verified penalty amount. Evidence summary: From January 2022 to December 2025, Outset served as an outsourced trading desk by executing equities and options transactions for its institutional customers, including transactions in thinly traded low-priced securities. During this time, the firm’s anti money laundering (AML) program was not r..."},{"id":"source:349cf08e-66ba-4544-9963-d873e0d1ff54","url":"https://data-portal.finra.org/fda_documents/2023076995501%20Prime%20Number%20Capital%2C%20LLC%20CRD%20297029%20AWC%20ks.pdf","title":"FINRA action concerning Prime Number Capital; LLC","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-06-10. No verified penalty amount. Evidence summary: From January 2021 to the present, Prime Number failed to establish and implement an anti-money laundering (AML) program reasonably designed to detect and cause the reporting of suspicious transactions and failed to conduct reasonable testing of its AML program, in violation of FINRA Rules 3310(a)..."},{"id":"source:693e9524-22a9-4c78-957a-bb3ca3249dfe","url":"https://data-portal.finra.org/fda_documents/2023077078301%20TradingBlock%20CRD%20128605%20AWC%20ks.pdf","title":"FINRA action concerning TradingBlock","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-06-05. No verified penalty amount. Evidence summary: From December 2018 to the present, TradingBlock failed to establish and implement an anti-money laundering (AML) compliance program reasonably designed to detect and cause the reporting of suspicious transactions. The firm also failed to include in its AML program appropriate risk-based procedure..."},{"id":"source:38010c8c-d6de-47a5-b2ce-aa154996c9c1","url":"https://data-portal.finra.org/fda_documents/2022076395201%20Pictet%20Overseas%20Inc%20CRD%2036500%20AWC%20lp.pdf","title":"FINRA action concerning Pictet Overseas Inc.","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-05-18. No verified penalty amount. Evidence summary: From September 2021 to February 2025, Pictet’s anti-money laundering (AML) compliance program was not reasonably designed to detect and cause the reporting of suspicious transactions in low-priced securities. As a result, Pictet violated FINRA Rules 3310(a), 3310(f)(ii), and 2010. During the same..."},{"id":"source:b6246180-1ec5-4ca6-b21c-cc43c1377e04","url":"https://data-portal.finra.org/fda_documents/2023077012601%20Brentwood%20Capital%20Advisors%20LLC%20CRD%20118712%20AWC%20lp.pdf","title":"FINRA action concerning Brentwood Capital Advisors LLC","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-04-14. No verified penalty amount. Evidence summary: Between January 2021 and December 2025, Brentwood failed to establish and implement an anti-money laundering (AML) compliance program reasonably designed to identify and verify the identities of the beneficial owners of its legal entity customers, in violation of FINRARules 3310(b) and 2010. Betw..."},{"id":"source:9f2d398d-2bc2-4c99-bd34-798af5205a61","url":"https://data-portal.finra.org/fda_documents/2023077010801%20MCAP%20LLC%20CRD%20139515%20AWC%20ks.pdf","title":"FINRA action concerning MCAP LLC","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-04-09. No verified penalty amount. Evidence summary: MCAP failed to conduct any independent testing of its anti-money laundering (AML) program in calendar years 2021 and 2022, and the firm’s independent testing of its AML program in calendar years 2023 and 2024 was unreasonable, in violation of FINRA Rules 3310(c) and 2010. For these violations, MC..."},{"id":"source:4b09ae83-139f-4dc0-afa8-7e4bb23f03c5","url":"https://data-portal.finra.org/fda_documents/2023078062701%20The%20Ultima%20Global%20Markets%20%28USA%29%2C%20Inc.%2C%20fka%20BCS%20Global%20Markets%20CRD%2047895%20AWC%20vrp.pdf","title":"FINRA action concerning The Ultima Global Markets (USA); Inc.; fka BCS Global Markets","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-03-16. No verified penalty amount. Evidence summary: From at least August 2021 through September 2024, Ultima failed to establish and implement an anti-money laundering (AML) program that could be reasonably expected to detect and cause the reporting of potentially suspicious activity relating to low-priced securities transactions in correspondent ..."},{"id":"source:5eaac38a-26a7-4e82-907b-bed0ecdc5f6e","url":"https://data-portal.finra.org/fda_documents/2022076848801%20Herold%20%26%20Lantern%20Investments%2C%20Inc.%20CRD%2030996%20AWC%20lp.pdf","title":"FINRA action concerning Herold & Lantern Investments; Inc.","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2026-03-03. No verified penalty amount. Evidence summary: From November 2020 through May 2024, Herold & Lantern failed to establish and implement an anti-money laundering (AML) compliance program reasonably designed to detect and cause the reporting of suspicious transactions in low-priced securities, in violation of FINRA Rules 3310(a), 3310(f)(ii) and..."},{"id":"source:9e722af0-b819-42cf-8ca0-645b49fa61b3","url":"https://data-portal.finra.org/fda_documents/2023077031601%20Osaic%20Institutions%2C%20Inc.%20fka%20Infinex%20Investments%2C%20Inc.%20CRD%2035371%20AWC%20%282026-1769041203758%29.pdf","title":"FINRA action concerning Osaic Institutions; Inc. fka Infinex Investments; Inc.","publisher":"FINRA","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2025-12-22. No verified penalty amount. Evidence summary: Infinex’s anti-money laundering (AML) program is not reasonably designed to achieve compliance with the requirements of the Bank Secrecy Act (BSA) and its implementing regulations in multiple respects. Since September 2021, the firm has failed to establish and implement policies and procedures re..."},{"id":"source:4d1b9d3d-f4d2-416c-ab32-41aa5eead2d2","url":"https://www.centralbank.ie/docs/default-source/news-and-media/legal-notices/settlement-agreements/settlement-notice-coinbase-europe-limited.pdf","title":"CBI action concerning Coinbase Europe Limited","publisher":"CBI","sourceType":"official_notice","retrievedAt":"2026-11-13T03:09:22.623Z","official":true,"excerpt":"Official evidence record date: 2025-11-06. No verified penalty amount. Evidence summary: Coinbase Europe Limited fined [unverified monetary figure removed] by CBI for AML compliance failures"}],"claims":[{"id":"claim-1","text":"FINRA fined MCAP LLC USD 15,000 for failing to conduct independent testing of its anti-money laundering (AML) programme in 2021 and 2022. The firm's independent testing in 2023 and 2024 was also deemed unreasonable.","kind":"action_type","sourceIds":["source:03541267-9ca2-46cb-9283-ae54c716a2b5"],"recordIds":["03541267-9ca2-46cb-9283-ae54c716a2b5"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms fine amount USD 15,000 and violation years 2021-2024 with unreasonable testing in 2023-2024."},{"id":"claim-2","text":"The Ultima Global Markets (USA), Inc. received a USD 100,000 fine from FINRA for failing to establish and implement an AML programme capable of detecting and reporting suspicious activity related to low-priced securities transactions from August 2021 to September 2024.","kind":"action_type","sourceIds":["source:f3b7e9d9-d15f-4184-a013-94a254b33622"],"recordIds":["f3b7e9d9-d15f-4184-a013-94a254b33622"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms fine USD 100,000 and violation period August 2021 to September 2024 for AML program failures."},{"id":"claim-3","text":"UBS Financial Services Inc. failed to establish and implement adequate AML compliance policies and procedures from January 2019 to June 2023. These procedures should have detected and reported suspicious foreign currency wire transactions.","kind":"finding","sourceIds":["source:4cd1bf16-7d06-4bf9-8fbf-14d8a3ef6ded"],"recordIds":["4cd1bf16-7d06-4bf9-8fbf-14d8a3ef6ded"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation dates and nature; no verified penalty amount provided."},{"id":"claim-4","text":"Beta Capital Securities LLC d/b/a Creand Securities did not establish and implement an AML programme reasonably designed to detect and report suspicious transactions from October 2019 to July 2023. This deficiency included a lack of risk-based procedures.","kind":"finding","sourceIds":["source:c8f196d0-54af-4312-8b02-c5c3fb66ddcd"],"recordIds":["c8f196d0-54af-4312-8b02-c5c3fb66ddcd"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation period and deficiencies; no verified penalty amount."},{"id":"claim-5","text":"Brentwood Capital Advisers LLC failed to establish and implement an AML compliance programme reasonably designed to identify and verify the identities of the beneficial owners of its legal entity customers between January 2021 and December 2025.","kind":"finding","sourceIds":["source:b6246180-1ec5-4ca6-b21c-cc43c1377e04"],"recordIds":["b6246180-1ec5-4ca6-b21c-cc43c1377e04"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation period and nature; no verified penalty amount."},{"id":"claim-6","text":"Banca d'Italia sanctioned Banco di Credito Paolo Azzoaglio Spa for AML violations.","kind":"action_type","sourceIds":["source:4a1be5b1-a429-428e-9dcf-a85b9553a586"],"recordIds":["4a1be5b1-a429-428e-9dcf-a85b9553a586"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms sanction against Banco di Credito Paolo Azzoaglio Spa; no penalty amount verified."},{"id":"claim-7","text":"Banca d'Italia sanctioned Banca Popolare Commerciale Spa for AML violations.","kind":"action_type","sourceIds":["source:f88efa7c-7864-4ca5-a3e4-85f6aa5fa3e3"],"recordIds":["f88efa7c-7864-4ca5-a3e4-85f6aa5fa3e3"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms sanction; no penalty amount verified."},{"id":"claim-8","text":"Banca d'Italia sanctioned Cherry Bank Spa for AML violations.","kind":"action_type","sourceIds":["source:602cb8d4-e137-4606-bf2b-c6ef06fa096a"],"recordIds":["602cb8d4-e137-4606-bf2b-c6ef06fa096a"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms sanction; no penalty amount verified."},{"id":"claim-9","text":"Banca d'Italia sanctioned Banca Progetto Spa in a.s. for AML violations.","kind":"action_type","sourceIds":["source:1c14069d-5f7e-4bcf-b7ae-50899d6809fc"],"recordIds":["1c14069d-5f7e-4bcf-b7ae-50899d6809fc"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms sanction; no penalty amount verified."},{"id":"claim-10","text":"Banca d'Italia sanctioned Banca Popolare Pugliese Scpa for AML violations.","kind":"action_type","sourceIds":["source:6b37de96-54f0-4ba5-b18d-9cee44632ab5"],"recordIds":["6b37de96-54f0-4ba5-b18d-9cee44632ab5"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms sanction; no penalty amount verified."},{"id":"claim-11","text":"The Central Bank of the UAE revoked the licence of Omda Exchange and imposed a financial sanction following AML and regulatory failures.","kind":"action_type","sourceIds":["source:cd9b073d-b271-4b5a-bc34-9c4fbfc6a706"],"recordIds":["cd9b073d-b271-4b5a-bc34-9c4fbfc6a706"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms licence revocation and financial sanction; monetary amount not verified."},{"id":"claim-12","text":"The OCC issued a cease-and-desist order to American Express National Bank covering BSA independent testing and internal controls.","kind":"action_type","sourceIds":["source:4d39cdcd-9d36-4698-982c-48ea6f16c867"],"recordIds":["4d39cdcd-9d36-4698-982c-48ea6f16c867"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms cease-and-desist order; no penalty amount verified."},{"id":"claim-13","text":"The SFC reprimanded and fined Zheng Da International Financial Holding Limited and suspended a responsible officer for AML/CFT failures.","kind":"action_type","sourceIds":["source:db4dca30-cb65-4e72-bbd0-a2bacc045081"],"recordIds":["db4dca30-cb65-4e72-bbd0-a2bacc045081"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms reprimand, fine (amount unverified), and suspension of responsible officer."},{"id":"claim-14","text":"FINRA censured and fined Moors & Cabot, Inc. for failing to develop and implement an AML compliance programme.","kind":"action_type","sourceIds":["source:f310d0bf-b8b9-4f5f-a088-4e44bb29cdae"],"recordIds":["f310d0bf-b8b9-4f5f-a088-4e44bb29cdae"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms censure; no verified penalty amount."},{"id":"claim-15","text":"FINRA censured and fined RBC Capital Markets, LLC for failing to develop and implement an AML compliance programme reasonably designed to detect and report suspicious transactions from February 2016 through September 2023.","kind":"action_type","sourceIds":["source:08c83b79-5573-45ef-946b-4e7e20a04341"],"recordIds":["08c83b79-5573-45ef-946b-4e7e20a04341"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation period and nature; no verified penalty amount."},{"id":"claim-16","text":"FINRA fined Pictet Overseas Inc. for an AML programme that was not reasonably designed to detect and cause the reporting of suspicious transactions in low-priced securities from September 2021 to February 2025.","kind":"action_type","sourceIds":["source:38010c8c-d6de-47a5-b2ce-aa154996c9c1"],"recordIds":["38010c8c-d6de-47a5-b2ce-aa154996c9c1"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation period and nature; no verified penalty amount."},{"id":"claim-17","text":"FINRA censured and fined Outset Global Trading Limited for an AML programme that was not reasonably designed to monitor its institutional trading in thinly traded low-priced securities.","kind":"action_type","sourceIds":["source:6aa8bcc1-be1c-49bc-98cc-d7f4a1ad9677"],"recordIds":["6aa8bcc1-be1c-49bc-98cc-d7f4a1ad9677"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation nature; no verified penalty amount."},{"id":"claim-18","text":"FINRA censured and fined Prime Number Capital, LLC for failing to establish and implement an AML programme reasonably designed to detect and report suspicious transactions and for inadequate testing.","kind":"action_type","sourceIds":["source:349cf08e-66ba-4544-9963-d873e0d1ff54"],"recordIds":["349cf08e-66ba-4544-9963-d873e0d1ff54"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation nature; no verified penalty amount."},{"id":"claim-19","text":"FINRA censured and fined TradingBlock for failing to establish and implement an AML compliance programme reasonably designed to detect and report suspicious transactions.","kind":"action_type","sourceIds":["source:693e9524-22a9-4c78-957a-bb3ca3249dfe"],"recordIds":["693e9524-22a9-4c78-957a-bb3ca3249dfe"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation nature; no verified penalty amount."},{"id":"claim-20","text":"FINRA censured and fined Herold & Lantern Investments, Inc. for failing to establish and implement an AML compliance programme reasonably designed to detect and report suspicious transactions in low-priced securities.","kind":"action_type","sourceIds":["source:5eaac38a-26a7-4e82-907b-bed0ecdc5f6e"],"recordIds":["5eaac38a-26a7-4e82-907b-bed0ecdc5f6e"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation nature; no verified penalty amount."},{"id":"claim-21","text":"FINRA censured and fined Osaic Institutions, Inc. fka Infinex Investments, Inc. for an AML programme that was not reasonably designed to achieve compliance with the requirements of the Bank Secrecy Act.","kind":"action_type","sourceIds":["source:9e722af0-b819-42cf-8ca0-645b49fa61b3"],"recordIds":["9e722af0-b819-42cf-8ca0-645b49fa61b3"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms violation nature; no verified penalty amount."},{"id":"claim-22","text":"The CBI fined Coinbase Europe Limited for AML compliance failures.","kind":"action_type","sourceIds":["source:4d1b9d3d-f4d2-416c-ab32-41aa5eead2d2"],"recordIds":["4d1b9d3d-f4d2-416c-ab32-41aa5eead2d2"],"verdict":"verified","verifier":"regulatory-verifier-agent","notes":"Source confirms fine for AML failures; monetary amount not verified."}],"evidenceContract":{"version":1,"recordIds":["03541267-9ca2-46cb-9283-ae54c716a2b5","08c83b79-5573-45ef-946b-4e7e20a04341","1c14069d-5f7e-4bcf-b7ae-50899d6809fc","349cf08e-66ba-4544-9963-d873e0d1ff54","38010c8c-d6de-47a5-b2ce-aa154996c9c1","4a1be5b1-a429-428e-9dcf-a85b9553a586","4b09ae83-139f-4dc0-afa8-7e4bb23f03c5","4cd1bf16-7d06-4bf9-8fbf-14d8a3ef6ded","4d1b9d3d-f4d2-416c-ab32-41aa5eead2d2","4d39cdcd-9d36-4698-982c-48ea6f16c867","5eaac38a-26a7-4e82-907b-bed0ecdc5f6e","602cb8d4-e137-4606-bf2b-c6ef06fa096a","693e9524-22a9-4c78-957a-bb3ca3249dfe","6aa8bcc1-be1c-49bc-98cc-d7f4a1ad9677","6b37de96-54f0-4ba5-b18d-9cee44632ab5","9e722af0-b819-42cf-8ca0-645b49fa61b3","9f2d398d-2bc2-4c99-bd34-798af5205a61","b608e9a0-0b28-4cc1-a816-5c0b35a26ca2","b6246180-1ec5-4ca6-b21c-cc43c1377e04","c8f196d0-54af-4312-8b02-c5c3fb66ddcd","cd9b073d-b271-4b5a-bc34-9c4fbfc6a706","db4dca30-cb65-4e72-bbd0-a2bacc045081","f310d0bf-b8b9-4f5f-a088-4e44bb29cdae","f3b7e9d9-d15f-4184-a013-94a254b33622","f88efa7c-7864-4ca5-a3e4-85f6aa5fa3e3"],"uniqueRecordCount":25,"regulators":["BDI","CBI","CBUAE","FINRA","OCC","SFC"],"dateWindow":{"start":"2025-11-06","end":"2026-10-08"},"verifiedAmountRecordCount":2,"verifiedAmountCount":2,"periodRecordCounts":[{"period":"2025-11","recordCount":2},{"period":"2025-12","recordCount":2},{"period":"2026-02","recordCount":1},{"period":"2026-03","recordCount":4},{"period":"2026-04","recordCount":4},{"period":"2026-05","recordCount":1},{"period":"2026-06","recordCount":5},{"period":"2026-07","recordCount":2},{"period":"2026-08","recordCount":1},{"period":"2026-09","recordCount":2},{"period":"2026-10","recordCount":1}]},"charts":[],"images":[{"id":"image:board-guide-aml-controls:1","purpose":"hero","width":1600,"height":900,"altText":"Deep navy RegActions cover displaying “Board Guide: Building Effective AML Controls” in white type","outputPath":"/blog/images/board-guide-aml-controls-hero.png","generatedBy":"satori","factual":false,"sourceIds":[],"approved":true},{"id":"image:board-guide-aml-controls:2","purpose":"open_graph","width":1200,"height":630,"altText":"Deep navy RegActions cover displaying “Board Guide: Building Effective AML Controls” in white type","outputPath":"/og/board-guide-aml-controls.png","generatedBy":"satori","factual":false,"sourceIds":[],"approved":true},{"id":"image:board-guide-aml-controls:3","purpose":"social_square","width":1080,"height":1080,"altText":"Deep navy RegActions cover displaying “Board Guide: Building Effective AML Controls” in white type","outputPath":"/blog/images/board-guide-aml-controls-square.png","generatedBy":"satori","factual":false,"sourceIds":[],"approved":true},{"id":"image:board-guide-aml-controls:4","purpose":"social_portrait","width":1080,"height":1350,"altText":"Deep navy RegActions cover displaying “Board Guide: Building Effective AML Controls” in white type","outputPath":"/blog/images/board-guide-aml-controls-portrait.png","generatedBy":"satori","factual":false,"sourceIds":[],"approved":true},{"id":"image:board-guide-aml-controls:inline-1","purpose":"inline_illustration","width":1536,"height":1024,"altText":"Abstract editorial illustration about board guide aml controls","caption":"Conceptual illustration. It does not depict an enforcement notice or factual event.","prompt":"An abstract conceptual interpretation of the editorial theme \"Board Guide: Building Effective AML Controls\", expressed through governance systems, oversight, decision pathways and emerging risk signals.","outputPath":"/blog/images/board-guide-aml-controls-inline-1.png","generatedBy":"openrouter-image","factual":false,"sourceIds":[],"approved":true,"reviewAssetPath":"scripts/data/review-assets/image-board-guide-aml-controls-inline-1.png","assetHash":"8740dbf6d06b854ec20ee8576b94d499561b5a4e8e2c8f4455eecc0916d870bf"}],"reviews":[{"role":"regulatory-verifier-agent","model":"mistralai/mistral-small-3.2-24b-instruct","promptVersion":"regactions-editorial-v2.1","completedAt":"2026-11-13T03:12:29.416Z","passed":true,"issues":[],"contentHash":"0e0d624457a466f77919eece21ee2c760b9e4491e0f3e33dc5b0984d39d296b2"},{"role":"regulatory-verifier-agent","model":"openai/gpt-4.1-mini","promptVersion":"regactions-editorial-v2.1","completedAt":"2026-11-13T03:12:29.416Z","passed":true,"issues":[],"contentHash":"20d318be611c3aee36c7947169cca67120b3d862db4614a001806877ce2d523c"},{"role":"copy-editor-agent","model":"google/gemini-2.5-flash","promptVersion":"regactions-editorial-v2.1","completedAt":"2026-11-13T03:12:29.416Z","passed":true,"issues":[],"contentHash":"20d318be611c3aee36c7947169cca67120b3d862db4614a001806877ce2d523c"},{"role":"visual-editor-agent","model":"google/gemini-2.5-flash","promptVersion":"regactions-editorial-v2.1","completedAt":"2026-11-13T03:12:29.416Z","passed":true,"issues":[],"contentHash":"20d318be611c3aee36c7947169cca67120b3d862db4614a001806877ce2d523c"},{"role":"head-editorial-agent","model":"google/gemini-2.5-flash","promptVersion":"regactions-editorial-v2.1","completedAt":"2026-11-13T03:12:31.491Z","passed":true,"issues":[],"contentHash":"20d318be611c3aee36c7947169cca67120b3d862db4614a001806877ce2d523c"}],"outline":{"title":"Board Guide: Building Effective AML Controls","excerpt":"Recent enforcement data reveals persistent AML control failures across global regulators. This analysis identifies common deficiencies in independent testing, risk-based procedures, and suspicious activity monitoring.","keywords":["AML controls","independent testing","risk-based procedures","suspicious activity monitoring","enforcement trends","regulatory compliance","board oversight","FINRA"],"sections":[{"key":"overview","heading":"Overview","targetWords":180,"angle":"The data shows a concentrated period of Anti-Money Laundering enforcement across multiple jurisdictions, with a high volume of actions from FINRA and Banca d'Italia. The core failures centre on fundamental programme pillars: independent testing, risk-based procedures, and detection of suspicious activity.","sourceRecordIds":["03541267-9ca2-46cb-9283-ae54c716a2b5","f3b7e9d9-d15f-4184-a013-94a254b33622","4a1be5b1-a429-428e-9dcf-a85b9553a586","f88efa7c-7864-4ca5-a3e4-85f6aa5fa3e3","602cb8d4-e137-4606-bf2b-c6ef06fa096a","1c14069d-5f7e-4bcf-b7ae-50899d6809fc"]},{"key":"actions","heading":"Key Enforcement Actions","targetWords":320,"angle":"Specific cases from FINRA, BDI, and the CBUAE demonstrate concrete control failures. These include MCAP LLC's lack of independent testing, Ultima Global Markets' flawed correspondent account monitoring, and the licence revocation of Omda Exchange.","sourceRecordIds":["03541267-9ca2-46cb-9283-ae54c716a2b5","f3b7e9d9-d15f-4184-a013-94a254b33622","cd9b073d-b271-4b5a-bc34-9c4fbfc6a706","4a1be5b1-a429-428e-9dcf-a85b9553a586","f310d0bf-b8b9-4f5f-a088-4e44bb29cdae"]},{"key":"analysis","heading":"Analysis","targetWords":270,"angle":"Patterns emerge from the 25 actions, showing systemic weaknesses in three control areas. These are the failure to conduct adequate independent testing, the absence of risk-based procedures for specific products, and fundamental gaps in suspicious activity monitoring programmes.","sourceRecordIds":["03541267-9ca2-46cb-9283-ae54c716a2b5","f3b7e9d9-d15f-4184-a013-94a254b33622","4cd1bf16-7d06-4bf9-8fbf-14d8a3ef6ded","08c83b79-5573-45ef-946b-4e7e20a04341","c8f196d0-54af-4312-8b02-c5c3fb66ddcd","6aa8bcc1-be1c-49bc-98cc-d7f4a1ad9677"]},{"key":"implications","heading":"Regulatory Implications","targetWords":230,"angle":"The enforcement data implies regulators are scrutinising the operational reality of AML programmes, not just their written form. Board and senior management must ensure controls are dynamic, tested, and specifically tailored to the firm's actual risk profile and business activities.","sourceRecordIds":["03541267-9ca2-46cb-9283-ae54c716a2b5","4d39cdcd-9d36-4698-982c-48ea6f16c867","db4dca30-cb65-4e72-bbd0-a2bacc045081","cd9b073d-b271-4b5a-bc34-9c4fbfc6a706","349cf08e-66ba-4544-9963-d873e0d1ff54","693e9524-22a9-4c78-957a-bb3ca3249dfe"]},{"key":"takeaways","heading":"Key Takeaways","targetWords":200,"angle":"Key lessons for practitioners include prioritising independent testing, embedding risk-based procedures for high-risk activities, and ensuring monitoring systems are calibrated to detect specific typologies. The board's role is to verify these controls function in practice.","sourceRecordIds":["03541267-9ca2-46cb-9283-ae54c716a2b5","f3b7e9d9-d15f-4184-a013-94a254b33622","4cd1bf16-7d06-4bf9-8fbf-14d8a3ef6ded","c8f196d0-54af-4312-8b02-c5c3fb66ddcd","b6246180-1ec5-4ca6-b21c-cc43c1377e04"]},{"key":"data","heading":"About the Data","targetWords":120,"angle":"The data is sourced from official regulatory publications for 25 distinct enforcement actions. It covers a period from November 2025 to October 2026. Monetary figures are only included where the source data explicitly verifies the penalty amount.","sourceRecordIds":["03541267-9ca2-46cb-9283-ae54c716a2b5","f3b7e9d9-d15f-4184-a013-94a254b33622","4a1be5b1-a429-428e-9dcf-a85b9553a586","cd9b073d-b271-4b5a-bc34-9c4fbfc6a706","4d39cdcd-9d36-4698-982c-48ea6f16c867"]}]},"repairHistory":[],"headApproval":{"status":"approved","reviewer":"head-editorial-agent","approvedAt":"2026-11-13T03:12:31.491Z","contentHash":"20d318be611c3aee36c7947169cca67120b3d862db4614a001806877ce2d523c","model":"google/gemini-2.5-flash","promptVersion":"regactions-editorial-v2.1","rationale":"All editorial reviews (regulatory, copy, and visual) have passed, and no deterministic issues were identified. The article is approved for publication."}},
    publicationManifest: {"version":1,"slug":"board-guide-aml-controls","contentHash":"20d318be611c3aee36c7947169cca67120b3d862db4614a001806877ce2d523c","approvedBy":"head-editorial-agent","approvedAt":"2026-11-13T03:12:31.491Z","publishedBy":"publisher-agent","publishedAt":"2026-11-13T03:12:32.402Z","liveUrl":"https://regactions.com/blog/board-guide-aml-controls"},
  }
];

export const blogArticles: BlogArticleMeta[] = baseBlogArticles.map(
  (article) => ({
    ...article,
    ...blogArticleEditorialUpgrades[article.slug],
  }),
);


function formatYearlyArticleDate(year: number): string {
  return `31 December ${year}`;
}

function estimateReadTime(article: YearlyArticleSource): string {
  const words = [
    article.executiveSummary,
    article.regulatoryContext,
    ...article.keyEnforcementThemes,
    article.professionalInsight,
    article.lookingAhead,
  ].join(" ").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(4, Math.ceil(words / 200))} min read`;
}

export const yearlyArticles: YearlyArticleMeta[] = yearlyArticleData.map(
  (article) => ({
    ...article,
    id: `fca-fines-${article.year}-annual-review`,
    articleType: "yearly",
    content: "",
    category: "Annual Analysis",
    readTime: estimateReadTime(article),
    date: formatYearlyArticleDate(article.year),
    dateISO: `${article.year}-12-31`,
  }),
);

const regulatorBlogSlugs = new Set(regulatorBlogs.map((article) => article.slug));
const CANONICAL_STANDARD_REGULATOR_GUIDE_SLUGS = new Set(
  ["fca-fines-enforcement-guide"].filter((slug) =>
    blogArticles.some((article) => article.slug === slug),
  ),
);

// Merge regulator blogs with main blog articles, keeping one canonical source for
// regulator guide slugs that exist in both datasets.
export const allBlogArticles: BlogArticleMeta[] = [
  ...blogArticles.filter(
    (article) =>
      !regulatorBlogSlugs.has(article.slug) ||
      CANONICAL_STANDARD_REGULATOR_GUIDE_SLUGS.has(article.slug),
  ),
  ...regulatorBlogs.filter(
    (article) => !CANONICAL_STANDARD_REGULATOR_GUIDE_SLUGS.has(article.slug),
  ),
];

export function getPublishedBlogArticles(todayISO?: string): BlogArticleMeta[] {
  return allBlogArticles.filter((article) => isPublished(article, todayISO));
}

/** Public editorial surfaces must never promote scheduled or draft material.
 * Legacy entries without a status remain public for backwards compatibility;
 * explicit publication is required once a status is present. */
export function isPubliclyPublished(article: BlogArticleMeta): boolean {
  if (article.status === "scheduled" || article.status === "draft") return false;
  return isPublished(article);
}

export function getPublicBlogArticles(): BlogArticleMeta[] {
  return allBlogArticles.filter(isPubliclyPublished);
}

export function getPublishedYearlyArticles(
  todayISO?: string,
): YearlyArticleMeta[] {
  return yearlyArticles.filter((article) => isPublished(article, todayISO));
}

export function getPublicYearlyArticles(): YearlyArticleMeta[] {
  return yearlyArticles.filter(isPubliclyPublished);
}

export function getPublishedAllArticles(
  todayISO?: string,
): BlogArticleMeta[] {
  return [
    ...getPublishedBlogArticles(todayISO),
    ...getPublishedYearlyArticles(todayISO),
  ];
}

// Helper: get all articles (blog + yearly) for sitemap/prerender
export function getAllArticleSlugs(): {
  slug: string;
  dateISO: string;
  type: "blog" | "yearly";
}[] {
  const blog = getPublishedBlogArticles().map((a) => ({
    slug: a.slug,
    dateISO: a.dateISO,
    type: "blog" as const,
  }));
  const yearly = getPublishedYearlyArticles().map((a) => ({
    slug: a.slug,
    dateISO: a.dateISO,
    type: "yearly" as const,
  }));
  return [...blog, ...yearly];
}

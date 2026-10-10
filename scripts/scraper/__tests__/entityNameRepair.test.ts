import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
const cheerioLoad = (html: string) => cheerio.load(html);
import {
  UNNAMED_PARTY_CATEGORY,
  assessEntityName,
  decodeHtmlEntities,
  isUnnamedPartyName,
  separateIdentityCollisions,
  unnamedParty,
} from "../lib/entityName.js";
import { buildEuFineContentHash, buildEuFineRecord } from "../lib/euFineHelpers.js";
import { finalizeAmfName, finalizeCbiName, finalizeCnmvName } from "../lib/partyDisplayNames.js";
import { validatePreparedRecords } from "../lib/runScraper.js";
import { validateDiscoveryCandidate } from "../lib/coverageDiscoveryCandidates.js";
import { buildBmaRecords, parseBmaActionsHtml } from "../scrapeBma.js";
import { loadCbuaeArchiveRecords } from "../scrapeCbuae.js";
import { buildCiroListingRecord, extractCiroFirm, legacyExtractCiroFirm } from "../scrapeCiro.js";
import { finalizeDnbName, transformRecord as transformDnbRecord } from "../scrapeDnb.js";
import { countDistinctNoticeLinks, fcaSubjectsCompatible, mergeFcaEnforcementActions, parseFcaPressReleaseDetails, repairFcaSubjectNames } from "../scrapeFcaEnforcement.js";
import { finalizeFsmaName } from "../scrapeFsma.js";
import { buildFssRecord } from "../scrapeFss.js";
import { extractFtdkFirm, legacyExtractFtdkFirm, refineFtdkParty } from "../scrapeFtdk.js";
import { buildNgsecCriminalRecords, buildNgsecRecord, legacyNgsecAmount, cleanNgsecDisplayName, extractNgsecDefendants, isNgsecCourtOutcome } from "../scrapeNgsec.js";
import { extractSecNamedParty, extractSecPrimaryEntity, legacyExtractSecPrimaryEntity } from "../scrapeSec.js";
import { extractSebiFirm, legacyExtractSebiFirm } from "../scrapeSebi.js";
import { buildSfcRecord, buildSfcRecords, extractSfcFirm, isSfcNonRecord, legacyExtractSfcFirm, resolveSfcParties } from "../scrapeSfc.js";
import { buildTwfscRecord, extractTwfscFirm, legacyExtractTwfscFirm } from "../scrapeTwfsc.js";
import { buildUKEnforcementRecords } from "../scrapeUkEnforcement.js";
import { isGenericFrcRespondent, parseFrcEnforcementCases } from "../ukEnforcementScrapers.js";
import { isGarbageFirmName } from "../../../src/utils/firmName.js";
import { transformRecord as transformAmf } from "../scrapeAmf.js";
import { transformRecord as transformCbi } from "../scrapeCbi.js";
import { transformRecord as transformCnmv } from "../scrapeCnmv.js";
import { planRegulator, planUkEnforcement, type StoredRow, type UkStoredRow } from "../repairEntityNames.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** Every defective "firm" name catalogued in the scraper-health findings (section B), verbatim. */
const BAD_NAMES = [
  // BMA: action types
  "Winding Up", "Order of Prohibition", "Civil Penalties", "Civil Penalty",
  // SEC: descriptors
  "Two Individuals", "Former Executives", "Multiple Entities",
  // SFC: headline fragments
  "the Code of Conduct", "fines", "Pre-trial review set", "revokes Ernest Chan Tsz Kin’s licence",
  "Tung Tai Securities Company Limitedfor failure to comply with the Code of Conduct",
  "Hearing adjourned in criminal prosecution",
  "Movie producer Wong Pak Ming sentenced to jail and fined in SFC’s insider dealing prosecution",
  "its responsible officer", "dealings in Cloudbreak Pharma Inc. shares", "finfluencer",
  // TWFSC
  "Sanctions Capital Securities Corp. for Violations of Futures Management Laws and Regulations",
  "Administrative fine issued to the person responsible",
  "Financial Supervisory Commission (Press Release) Fine Imposition on the Responsible Person of NUUO Inc.",
  // CIRO
  "CIRO Hearing Panel accepts settlement agreement with Samantha Cauvier",
  "MFDA Hearing Panel makes findings of misconduct and imposes sanctions against Ken Derksen",
  "IIROC Sanctions Vancouver Investment Advisor Kamal Lidder",
  // AMF
  "Unknown", "two individuals", "It also",
  // FTDK
  "en person", "Vedkommende", "en fysisk person", "og en værdipapirhandler", "at politianmelde Topdanmark",
  // NGSEC
  "Ponzi: Famzhi Boss Jailed Five Years for Investment Scam",
  // CBI
  "Enforcement Action against BlueSnap Payment Services Ireland Limited",
  // DNB
  "crypto service provider", "Onderneming",
  // FCA enforcement
  "Decision Notice 2026 Alec Finch",
  // FRC
  "Accountant", "Actuary",
  // CBUAE
  "A bank operating in the UAE", "An exchange house operating in the UAE", "Five banks and two insurance companies operating in the UAE",
  // FSMA
  "la loi du 11 janvier 1993", "l'application d'une mesure et/ou d'une amende administrative à X", "monsieur A",
  // MFSA: undecoded entity
  "E&amp;S Consultancy Limited",
  // FSS: Korean headline
  "상장폐지 회피 등을 위한 불법행위 끝까지 추적하여 엄단하겠습니다",
  // CMVM: Portuguese headline
  "CMVM divulgou hoje três decisões de contraordenação",
];

describe("assessEntityName: rejects headline/descriptor 'names'", () => {
  it.each(BAD_NAMES.filter((name) => name !== "CMVM divulgou hoje três decisões de contraordenação"))("rejects %j", (name) => {
    expect(assessEntityName(name).ok).toBe(false);
  });

  it("covers each rule the brief names", () => {
    expect(assessEntityName("SFC fines Foo Limited").reasons).toContain("headline_verb");
    expect(assessEntityName("Court sentenced Bar Ltd").reasons).toContain("headline_verb");
    expect(assessEntityName("Hearing adjourned").reasons).toContain("headline_verb");
    expect(assessEntityName("revokes the licence of Foo").reasons).toContain("headline_verb");
    expect(assessEntityName("Panel accepts the settlement").reasons).toContain("headline_verb");
    expect(assessEntityName("Notice issued to Foo").reasons).toContain("headline_verb");
    expect(assessEntityName("the Code of Conduct").reasons).toContain("starts_with_the");
    expect(assessEntityName("some words in lower case").reasons).toContain("starts_lowercase");
    expect(assessEntityName("Acme Ltd for failure to comply with rules").reasons).toContain("failure_clause");
    expect(assessEntityName("Acme Ltd 12 March 2024").reasons).toContain("contains_date");
    expect(assessEntityName("Acme Ltd 2024-03-12").reasons).toContain("contains_date");
    // Length is a flag (CySEC joint actions are long and real), not a rejection.
    const long = `${"Alpha Holdings Limited, ".repeat(8)}Omega Limited`;
    expect(long.length).toBeGreaterThan(120);
    expect(assessEntityName(long)).toMatchObject({ ok: true, flags: ["long"] });
  });

  it("still rejects regulator-driven headlines that end in a legal form", () => {
    expect(assessEntityName("SFC fines Foo Limited").ok).toBe(false);
    expect(assessEntityName("CIRO Hearing Panel accepts settlement agreement with Foo Ltd").ok).toBe(false);
  });

  it("accepts the honest unnamed labels", () => {
    for (const label of ["Unnamed bank (CBUAE)", "Unnamed individual (FTDK)", "Unnamed party (SEC)", "Unnamed firm (DNB)"]) {
      expect(assessEntityName(label).ok).toBe(true);
      expect(isUnnamedPartyName(label)).toBe(true);
    }
    expect(isUnnamedPartyName("Unnamed Holdings Ltd")).toBe(false);
  });
});

describe("assessEntityName: no false positives on real names from the scraper dumps", () => {
  const legit = readFileSync(join(FIXTURE_DIR, "legit-entity-names.txt"), "utf8").split("\n").filter(Boolean);

  it("has a meaningful corpus", () => {
    expect(legit.length).toBeGreaterThan(2500);
  });

  it("accepts every legitimate name", () => {
    const rejected = legit.filter((name) => !assessEntityName(name).ok).map((name) => `${name} -> ${assessEntityName(name).reasons.join(",")}`);
    expect(rejected).toEqual([]);
  });

  it("keeps the tricky shapes that look like headlines but are names", () => {
    for (const name of [
      "bunq B.V.", "kompasbank a/s", "eToro (Europe) Ltd", "de Volksbank N.V.", "One American Bank", "A J Smith Federal Savings Bank",
      "Two Sigma", "Sanctions Compliance Partners Ltd", "Charged Capital Ltd", "Orders Direct Limited", "The Bank of East Asia, Limited", "the New York Branch of Metropolitan Bank & Trust Company",
      "cresco&finance a.s.", "www.getcommoditytips.com", "Vladimír Čípl, nar. 7.3.1967", "Sociedade Lisgráfica, S.A.",
    ]) {
      expect(assessEntityName(name).ok, name).toBe(true);
    }
  });

  it("is wired into the record-validation path", () => {
    const base = {
      contentHash: "h", regulator: "SFC", regulatorFullName: "x", countryCode: "HK", countryName: "Hong Kong",
      firmCategory: null, amount: null, currency: "HKD", amountEur: null, amountGbp: null, dateIssued: "2026-01-02",
      yearIssued: 2026, monthIssued: 1, breachType: "x", breachCategories: ["OTHER"], summary: "A summary long enough.",
      finalNoticeUrl: null, sourceUrl: "https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/doc?refNo=1",
      amountReviewReason: null, rawPayload: "null",
    };
    const headline = validateDiscoveryCandidate({ ...base, firmIndividual: "Hearing adjourned in criminal prosecution" }, 1);
    expect(headline.issues.map((issue) => issue.code)).toEqual(["headline_entity"]);
    // flag-and-exclude: a headline-only failure never counts towards the batch quarantine/hold decision
    const split = validatePreparedRecords([{ ...base, firmIndividual: "Hearing adjourned in criminal prosecution" }, { ...base, contentHash: "h2", firmIndividual: "Acme Ltd" }, { ...base, contentHash: "h3", firmIndividual: "Acme Ltd", dateIssued: "bad" }], 1);
    expect(split.excluded).toHaveLength(1);
    expect(split.invalid).toHaveLength(1);
    expect(split.valid).toHaveLength(1);
    const clean = validateDiscoveryCandidate({ ...base, firmIndividual: "Chee Tak Securities Limited" }, 1);
    expect(clean.issues).toEqual([]);
    const unnamed = validateDiscoveryCandidate({ ...base, firmIndividual: "Unnamed party (SFC)" }, 1);
    expect(unnamed.issues).toEqual([]);
  });
});

describe("shared normaliser", () => {
  it("decodes HTML entities in the display name but leaves the content hash exactly as it was", () => {
    const input = {
      regulator: "MFSA", regulatorFullName: "x", countryCode: "MT", countryName: "Malta", firmCategory: null,
      amount: null, currency: "EUR", dateIssued: "2026-01-02", breachType: "x", breachCategories: [], summary: "s",
      finalNoticeUrl: null, sourceUrl: "https://www.mfsa.mt/x", rawPayload: null,
    };
    const encoded = buildEuFineRecord({ ...input, firmIndividual: "E&amp;S Consultancy Limited" });
    expect(encoded.firmIndividual).toBe("E&S Consultancy Limited");
    expect(encoded.contentHash).toBe(buildEuFineContentHash({ ...input, firmIndividual: "E&amp;S Consultancy Limited" }));
    expect(decodeHtmlEntities("A &amp;amp; B &#38; C &eacute;")).toBe("A & B & C é");
  });
});

describe("identity discipline: a corrected name must not move the content hash", () => {
  const base = {
    regulator: "X", regulatorFullName: "x", countryCode: "XX", countryName: "x", firmCategory: null,
    amount: null, currency: "EUR", dateIssued: "2026-01-02", breachType: "x", breachCategories: [], summary: "s",
    finalNoticeUrl: "https://example.org/n", sourceUrl: "https://example.org/s", rawPayload: null,
  };

  it("identityFirm substitutes the hashed name only", () => {
    const stored = buildEuFineRecord({ ...base, firmIndividual: "Winding Up" });
    const corrected = buildEuFineRecord({ ...base, firmIndividual: "Yew Tree Investments Limited", identityFirm: "Winding Up" });
    expect(corrected.contentHash).toBe(stored.contentHash);
    expect(corrected.firmIndividual).toBe("Yew Tree Investments Limited");
    expect(buildEuFineRecord({ ...base, firmIndividual: "Yew Tree Investments Limited" }).contentHash).not.toBe(stored.contentHash);
  });

  it("BMA keeps the legacy hash (action type + no notice URL) and separates collapsed twins", () => {
    const html = `<table><tr><th>Date</th><th>Action</th><th>Licensee</th><th>Notice</th></tr>
      <tr><td>26 November 2025</td><td>Winding Up</td><td>Diversified Fund Platform Ltd.</td><td><a href="/viewPDF/a.pdf">Link</a></td></tr>
      <tr><td>26 November 2025</td><td>Winding Up</td><td>Rapture Global Investment Fund Ltd.</td><td><a href="/viewPDF/b.pdf">Link</a></td></tr></table>`;
    const rows = parseBmaActionsHtml(html);
    expect(rows.map((row) => row.entity)).toEqual(["Diversified Fund Platform Ltd.", "Rapture Global Investment Fund Ltd."]);
    const records = buildBmaRecords(rows);
    const legacyHash = buildEuFineContentHash({
      regulator: "BMA", regulatorFullName: "x", countryCode: "BM", countryName: "Bermuda", firmCategory: null,
      firmIndividual: "Winding Up", amount: null, currency: "BMD", dateIssued: "2025-11-26", breachType: "x", breachCategories: [],
      summary: "x", finalNoticeUrl: null, sourceUrl: "https://www.bma.bm/enforcement-action", rawPayload: null,
    });
    expect(records[0].contentHash).toBe(legacyHash);
    expect(records[0].finalNoticeUrl).toContain("a.pdf");
    // the second party used to overwrite the first on the same hash; it now has its own identity
    expect(records[1].contentHash).not.toBe(legacyHash);
    expect(new Set(records.map((record) => record.contentHash)).size).toBe(2);
  });

  it("TWFSC, CIRO, SFC, FSS, NGSEC and CBUAE hash the legacy name", () => {
    const twfscRow = { title: "Fine Imposed on the Responsible Person of Falcon Power Co., Ltd.", dateIssued: "2024-01-02", detailUrl: "https://www.sfb.gov.tw/en/x", dataserno: "1" };
    const twfsc = buildTwfscRecord(twfscRow as never, null);
    expect(twfsc.firmIndividual).toBe("Falcon Power Co., Ltd.");
    expect(twfsc.contentHash).toBe(buildEuFineContentHash({
      regulator: "TWFSC", regulatorFullName: "x", countryCode: "TW", countryName: "x", firmCategory: null,
      firmIndividual: legacyExtractTwfscFirm(twfscRow.title), amount: null, currency: "TWD", dateIssued: twfscRow.dateIssued,
      breachType: "x", breachCategories: [], summary: "x", finalNoticeUrl: twfscRow.detailUrl, sourceUrl: twfscRow.detailUrl,
      dedupeKey: "1", rawPayload: null,
    }));

    const ciroRow = { title: "CIRO Hearing Panel accepts settlement agreement with Samantha Cauvier", dateIssued: "2026-02-03", detailUrl: "https://www.ciro.ca/n/1", rulebook: null, noticeType: null };
    const ciro = buildCiroListingRecord(ciroRow);
    expect(ciro.firmIndividual).toBe("Samantha Cauvier");
    expect(ciro.contentHash).toBe(buildEuFineContentHash({
      regulator: "CIRO", regulatorFullName: "x", countryCode: "CA", countryName: "x", firmCategory: null,
      firmIndividual: legacyExtractCiroFirm(ciroRow.title), amount: null, currency: "CAD", dateIssued: ciroRow.dateIssued,
      breachType: "x", breachCategories: [], summary: "x", finalNoticeUrl: ciroRow.detailUrl, sourceUrl: ciroRow.detailUrl, rawPayload: null,
    }));

    const release = { refNo: "26PR1", title: "SFC revokes Mui Chok Wah’s licence and bans him for two years", dateIssued: "2026-03-04", body: "The SFC revoked a licence.", sourceUrl: "https://apps.sfc.hk/x" };
    const sfc = buildSfcRecord(release);
    expect(sfc.firmIndividual).toBe("Mui Chok Wah");
    expect(sfc.contentHash).toBe(buildEuFineContentHash({
      regulator: "SFC", regulatorFullName: "x", countryCode: "HK", countryName: "x", firmCategory: null,
      firmIndividual: legacyExtractSfcFirm(release.title), amount: null, currency: "HKD", dateIssued: release.dateIssued,
      breachType: "x", breachCategories: [], summary: "x",
      finalNoticeUrl: "https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/doc?refNo=26PR1",
      sourceUrl: release.sourceUrl, dedupeKey: "26PR1", rawPayload: null,
    }));

    const fssRow = { title: "FSS Holds Basel Committee Meeting", nttId: "42", dateIssued: "2026-01-02", detailUrl: "https://www.fss.or.kr/x", categories: ["Supervision-Examination"] };
    const fss = buildFssRecord(fssRow as never);
    expect(fss.firmIndividual).toBe("Unnamed party (FSS)");
    expect(fss.firmCategory).toBe(UNNAMED_PARTY_CATEGORY);
    expect(fss.contentHash).toBe(buildEuFineContentHash({
      regulator: "FSS", regulatorFullName: "x", countryCode: "KR", countryName: "x", firmCategory: null,
      firmIndividual: fssRow.title, amount: null, currency: "KRW", dateIssued: fssRow.dateIssued, breachType: "x", breachCategories: [],
      summary: "x", finalNoticeUrl: fssRow.detailUrl, sourceUrl: "https://www.fss.or.kr/eng/bbs/B0000211/list.do?menuNo=300147&selectCate2=1007&pageIndex=1",
      dedupeKey: "FSS::42", rawPayload: null,
    }));

    const cbuae = loadCbuaeArchiveRecords();
    expect(cbuae.length).toBeGreaterThan(20);
    expect(cbuae.filter((record) => isUnnamedPartyName(record.firmIndividual)).every((record) => record.firmCategory === UNNAMED_PARTY_CATEGORY)).toBe(true);
    expect(cbuae.some((record) => record.firmIndividual === "Unnamed bank (CBUAE)")).toBe(true);
    expect(cbuae.every((record) => assessEntityName(record.firmIndividual).ok)).toBe(true);
  });

  it("NGSEC keeps hashing and de-duping on the un-cleaned operator name", () => {
    const entry = { title: "Blacklisting Of Four (4) Italian E-Commerce Companies", detailUrl: "https://sec.gov.ng/x/", summary: "s", dateIssued: "2026-01-02" };
    const detail = { title: entry.title, dateIssued: "2026-01-02", summary: "s", body: "b", affectedEntities: [] };
    const record = buildNgsecRecord(entry as never, detail as never, "Tetris Group Limited (https://clydetrade.world);");
    expect(record.firmIndividual).toBe("Tetris Group Limited");
    expect(record.contentHash).toBe(buildEuFineContentHash({
      regulator: "NGSEC", regulatorFullName: "x", countryCode: "NG", countryName: "x", firmCategory: null,
      firmIndividual: "Tetris Group Limited (https://clydetrade.world);", amount: null, currency: "NGN", dateIssued: "2026-01-02",
      breachType: "x", breachCategories: [], summary: "x", finalNoticeUrl: entry.detailUrl, sourceUrl: entry.detailUrl,
      dedupeKey: `${entry.detailUrl}::tetris group limited (https://clydetrade.world);`, rawPayload: null,
    }));
    expect(cleanNgsecDisplayName("NBIMarkets (nbimarkets.com), (https:")).toBe("NBIMarkets");
  });

  it("DNB identity is the notice URL, so display fixes cannot move it", () => {
    const link = "https://www.dnb.nl/en/general-news/enforcement-measures-2023/fine-for-crypto-service-provider-for-offering-crypto-services/";
    const a = transformDnbRecord({ firm: "crypto service provider", amount: null, currency: "EUR", date: "2023-10-02", breach: "AML", link, summary: "s" });
    const b = transformDnbRecord({ firm: "Unnamed firm (DNB)", amount: null, currency: "EUR", date: "2023-10-02", breach: "AML", link, summary: "s" });
    expect(a.contentHash).toBe(b.contentHash);
    expect(b.firmCategory).toBe(UNNAMED_PARTY_CATEGORY);
  });

  it("CBI and CNMV (direct-to-DB scripts) hash the legacy name; AMF never hashed the firm", () => {
    const cbi = { firm: "BlueSnap Payment Services Ireland Limited", identityFirm: "Enforcement Action against BlueSnap Payment Services Ireland Limited", amount: null, currency: "EUR", date: "2024-11-21", breach: "Enforcement action", link: "https://www.centralbank.ie/x.pdf", summary: "s" };
    const legacyCbi = transformCbi({ ...cbi, firm: cbi.identityFirm, identityFirm: undefined });
    expect(transformCbi(cbi).contentHash).toBe(legacyCbi.contentHash);
    expect(transformCbi(cbi).firmIndividual).toBe("BlueSnap Payment Services Ireland Limited");

    const cnmv = { firm: "Gesconsult, SA, SGIIC y Juan Lladó García-Lomas", identityFirm: "Gesconsult, SA, SGIIC y a don Juan Lladó García-Lomas", resolution: "r", sanctionType: "Serious infringement", amount: null, currency: "EUR", date: "2026-07-17", reference: null, detailUrl: "https://www.boe.es/x", listingUrl: "https://www.cnmv.es/y" };
    expect(transformCnmv(cnmv).contentHash).toBe(transformCnmv({ ...cnmv, firm: cnmv.identityFirm, identityFirm: undefined }).contentHash);

    const amf = { firm: "Unnamed party (AMF)", amount: null, currency: "EUR", date: "2026-01-02", breach: "x", link: "https://www.amf-france.org/x", summary: "s", theme: "t", listingUrl: "https://www.amf-france.org/l" };
    expect(transformAmf(amf).contentHash).toBe(transformAmf({ ...amf, firm: "Unknown" }).contentHash);
    expect(transformAmf(amf).firmCategory).toBe(UNNAMED_PARTY_CATEGORY);
  });

  it("separateIdentityCollisions only re-keys later duplicates", () => {
    const first = { contentHash: "h1", firmIndividual: "A", dateIssued: "2026-01-01" };
    const second = { contentHash: "h1", firmIndividual: "B", dateIssued: "2026-01-01" };
    const out = separateIdentityCollisions([first, second]);
    expect(out[0].contentHash).toBe("h1");
    expect(out[1].contentHash).not.toBe("h1");
  });

  it("UK enforcement: identityFirm keeps content_hash and source_identity_key", () => {
    const seed = {
      regulator: "FCA", regulatorFullName: "Financial Conduct Authority", sourceDomain: "financial_conduct" as const,
      firmIndividual: "Decision Notice 2026 Alec Finch", firmCategory: null, amount: 121200, currency: "GBP", dateIssued: "2026-07-23",
      breachType: "x", breachCategories: ["OTHER"], summary: "s", noticeUrl: "https://www.fca.org.uk/publication/decision-notices/decision-notice-2026-alec-finch.pdf",
      sourceUrl: "https://www.fca.org.uk/news", sourceWindowNote: "n",
    };
    const [before] = buildUKEnforcementRecords([seed]);
    const [repaired] = repairFcaSubjectNames([seed]);
    expect(repaired.firmIndividual).toBe("Alec Finch");
    const [after] = buildUKEnforcementRecords([repaired]);
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.sourceIdentityKey).toBe(before.sourceIdentityKey);
    expect(after.id).toBe(before.id);

    const fenech = { ...seed, firmIndividual: "Mr Fenech", noticeUrl: "https://www.fca.org.uk/publication/final-notices/richard-brian-fenech-2026.pdf" };
    const [fenechAfter] = repairFcaSubjectNames([fenech]);
    expect(fenechAfter.firmIndividual).toBe("Richard Brian Fenech");
    expect(buildUKEnforcementRecords([fenechAfter])[0].contentHash).toBe(buildUKEnforcementRecords([fenech])[0].contentHash);
    // an untouched record is returned as-is and hashes as before
    expect((repairFcaSubjectNames([{ ...seed, firmIndividual: "Frank Breuer" }])[0] as { identityFirm?: string }).identityFirm).toBeUndefined();
  });

  it("FRC 'Accountant'/'Actuary' rows become unnamed but keep their stored identity", () => {
    const html = `<table><tbody>
      <tr><td>Accountant</td><td>State Oil Limited (Prax Group)</td><td>Accountancy Scheme</td><td>Non-Audit</td><td>Imposed Sanctions: 11 September 2026</td><td>Past</td><td><a href="/x.pdf">Imposed sanctions</a></td></tr>
      <tr><td>KPMG</td><td>John Wood Group plc</td><td>Audit Enforcement Procedure</td><td>Audit</td><td>Imposed Sanctions: 10 September 2026</td><td>Past</td><td><a href="/y.pdf">Imposed sanctions</a></td></tr></tbody></table>`;
    const rows = parseFrcEnforcementCases(html);
    expect(isGenericFrcRespondent("Accountant")).toBe(true);
    expect(isGenericFrcRespondent("KPMG")).toBe(false);
    const accountant = rows.find((row) => row.identityFirm === "Accountant");
    expect(accountant).toMatchObject({ firmIndividual: "Unnamed individual (FRC)", firmCategory: UNNAMED_PARTY_CATEGORY });
    expect(rows.find((row) => row.firmIndividual === "KPMG")?.identityFirm).toBeUndefined();
    const built = buildUKEnforcementRecords([accountant!]);
    const legacy = buildUKEnforcementRecords([{ ...accountant!, firmIndividual: "Accountant", firmCategory: accountant!.identityFirmCategory ?? null, identityFirm: undefined, identityFirmCategory: undefined }]);
    expect(built[0].contentHash).toBe(legacy[0].contentHash);
    expect(built[0].sourceIdentityKey).toBe(legacy[0].sourceIdentityKey);
  });
});

describe("extractors", () => {
  it("SEC reads the named party and labels descriptors honestly", () => {
    expect(extractSecNamedParty("SEC Charges Registered Investment Adviser Zoe Financial for Failure to Disclose Conflict of Interest")).toBe("Zoe Financial");
    expect(extractSecNamedParty("SEC Charges Two Sigma for Failing to Address Known Vulnerabilities")).toBe("Two Sigma");
    expect(extractSecNamedParty("SEC Charges Paul McCabe and PMAC Consulting with Acting as Unregistered Brokers")).toBe("Paul McCabe and PMAC Consulting");
    expect(extractSecNamedParty("SEC Seeks Final Judgment Against Former Western Asset Co-CIO Ken Leech in Cherry Picking Case")).toBe("Ken Leech");
    expect(extractSecNamedParty("SEC Charges Two Individuals With Orchestrating Fraud Scheme That Targeted Veterans")).toBeNull();
    expect(extractSecNamedParty("SEC Charges Former Executives With Fraud in Connection With $1.9 Billion Collapse")).toBeNull();
    expect(extractSecPrimaryEntity("SEC Charges Three Texans with Defrauding Investors in $91 Million Ponzi Scheme")).toBe("Unnamed party (SEC)");
    expect(legacyExtractSecPrimaryEntity("SEC Charges Two Individuals With Orchestrating Fraud")).toBe("Two Individuals");
  });

  it("SFC: party extraction, honest labels and non-record detection", () => {
    expect(extractSfcFirm("SFC revokes the licence of Amber Hill Capital Limited and bans its senior management for life")).toBe("Amber Hill Capital Limited");
    expect(extractSfcFirm("SFAT affirms SFC decision to reprimand and fine I-Access Investors Limited $600,000 over breach of the Code of Conduct")).toBe("I-Access Investors Limited");
    expect(extractSfcFirm("SFC suspends dealings in Cloudbreak Pharma Inc. shares over suspected IPO rigging")).toBe("Cloudbreak Pharma Inc.");
    expect(extractSfcFirm("SFC reprimands and fines Chee Tak Securities Limited $2 million and sanctions its responsible officer")).toBe("Chee Tak Securities Limited");
    expect(extractSfcFirm("SFC suspends finfluencer for 16 months")).toBe("Unnamed party (SFC)");
    expect(extractSfcFirm("SFC bans former responsible officer of Guosen Securities (HK) Brokerage Company, Limited for 12 months")).toBe("Unnamed party (SFC)");
    expect(isSfcNonRecord("Hearing adjourned in criminal prosecution for noncompliance with SFC notices")).toBe(true);
    expect(isSfcNonRecord("SFC suspends finfluencer for 16 months")).toBe(false);
    expect(extractSfcFirm("SFC reprimands and fines Saxo Capital Markets HK Limited $4 million for regulatory breaches")).toBe("Saxo Capital Markets HK Limited");
  });

  it("TWFSC strips the lead-in and role words", () => {
    expect(extractTwfscFirm("Administrative Fine Imposed on the Responsible Person of ANAX Technology Corp. (Listed Company 3030)")).toBe("ANAX Technology Corp");
    expect(extractTwfscFirm("Financial Supervisory Commission (Press Release) Fine Imposition on the Responsible Person of NUUO Inc.")).toBe("NUUO Inc.");
    expect(extractTwfscFirm("Disciplinary Action on SinoPac Futures Co., Ltd. for Violating Futures Management Laws and Regulations")).toBe("SinoPac Futures Co., Ltd.");
    expect(extractTwfscFirm("Sanction on the Employee of IBF Securities Co., Ltd. for Violation of Securities Management Laws")).toBe("Employee of IBF Securities Co., Ltd.");
    expect(extractTwfscFirm("Sanctions Capital Securities Corp. for Violations of Futures Management Laws and Regulations")).not.toContain("Violations");
    expect(extractTwfscFirm("The FSC Imposed Warnings, Fines and Other Necessary Administrative Sanctions on 10 Securities Firms")).toBe("Unnamed party (TWFSC)");
  });

  it("CIRO reads the party out of Hearing Panel headlines", () => {
    expect(extractCiroFirm("CIRO Hearing Panel accepts settlement agreement with Samantha Cauvier")).toBe("Samantha Cauvier");
    expect(extractCiroFirm("MFDA Hearing Panel makes findings of misconduct and imposes sanctions against Ken Derksen")).toBe("Ken Derksen");
    expect(extractCiroFirm("IIROC Fines Former Winnipeg Investment Advisor Joseph Marcel Denis (Denis) Rochon")).toBe("Joseph Marcel Denis (Denis) Rochon");
    expect(extractCiroFirm("CIRO Sanctions National Bank Financial Inc.")).toBe("National Bank Financial Inc");
  });

  it("FTDK: generic persons are unnamed, truncated names are completed", () => {
    expect(refineFtdkParty("en person", "Dom for markedsmanipulation")).toEqual({ name: null, kind: "individual" });
    expect(refineFtdkParty("Vedkommende", "Dom for oplysningsbaseret markedsmanipulation")).toEqual({ name: null, kind: "individual" });
    expect(refineFtdkParty("Den ene virksomhed", "Dom for markedsmanipulation")).toEqual({ name: null, kind: "firm" });
    expect(refineFtdkParty("Alm", "Alm. Brand Forsikring A/S (Alm. Brand) har accepteret bødeforelægget fra National enhed")).toEqual({ name: "Alm. Brand Forsikring A/S", kind: "named" });
    expect(refineFtdkParty("at politianmelde Topdanmark", "Topdanmark Forsikring A/S har accepteret bødeforelægget")).toEqual({ name: "Topdanmark Forsikring A/S", kind: "named" });
    expect(refineFtdkParty("Parken Sport & Entertainment A/S m", "Dom - Østre Landsret – Parken Sport & Entertainment A/S")).toEqual({ name: "Parken Sport & Entertainment A/S", kind: "named" });
    expect(refineFtdkParty("Velliv", "Velliv, Pension og Livsforsikring A/S (Velliv) har accepteret bødeforelægget")).toEqual({ name: "Velliv", kind: "named" });
    expect(extractFtdkFirm("Dom for markedsmanipulation", "")).toBeNull();
    expect(legacyExtractFtdkFirm("Dom for markedsmanipulation", "")).toBeNull();
  });

  it("FSMA anonymised parties become unnamed; real parties are untouched", () => {
    expect(finalizeFsmaName("M. X")).toMatchObject({ named: false });
    expect(finalizeFsmaName("X, Y et Z")).toMatchObject({ named: false });
    expect(finalizeFsmaName("la loi du 11 janvier 1993")).toMatchObject({ named: false });
    expect(finalizeFsmaName("Banque Degroof Petercam - Version anglaise")).toEqual({ name: "Banque Degroof Petercam", named: true });
    expect(finalizeFsmaName("TB Advice SRL et de X")).toEqual({ name: "TB Advice SRL", named: true });
    expect(finalizeFsmaName("Rabobank")).toEqual({ name: "Rabobank", named: true });
  });

  it("DNB folds spelling variants and drops role words", () => {
    expect(finalizeDnbName("CCV", "").name).toBe("CCV Group B.V.");
    expect(finalizeDnbName("Volksbank N.V.", "").name).toBe("de Volksbank N.V.");
    expect(finalizeDnbName("crypto service provider", "")).toEqual({ name: "Unnamed firm (DNB)", named: false });
    expect(finalizeDnbName("Triodos Bank N.V. in 2019", "").name).toBe("Triodos Bank N.V.");
  });

  it("CNMV, CBI and AMF display clean-up", () => {
    expect(finalizeCnmvName("Gesconsult, SA, SGIIC y a don Juan Lladó García-Lomas").name).toBe("Gesconsult, SA, SGIIC y Juan Lladó García-Lomas");
    expect(finalizeCnmvName("Comisión Nacional del Mercado de Valores, por la que se publican las sanciones").named).toBe(false);
    expect(finalizeCbiName("Enforcement Action against Waystone Fund Management").name).toBe("Waystone Fund Management");
    expect(finalizeCbiName("the Governor and Company of the Bank of Ireland 2 December 2021").name).toBe("The Governor and Company of the Bank of Ireland");
    expect(finalizeCbiName("a person concerned").named).toBe(false);
    expect(finalizeAmfName("Kerdiz Finance et Conseil, and fines ofeuros each").name).toBe("Kerdiz Finance et Conseil");
    expect(finalizeAmfName("Caceis Bank - €3").name).toBe("Caceis Bank");
    expect(finalizeAmfName("Unknown").named).toBe(false);
    expect(finalizeAmfName("It also").named).toBe(false);
  });

  it("SEBI reads the respondent, not the subject matter", () => {
    expect(extractSebiFirm("Order in the matter of front running by Alka Jain")).toBe("Alka Jain");
    expect(extractSebiFirm("Order in respect of Vijay Mallya in the matter of routing of funds")).toBe("Vijay Mallya");
    expect(extractSebiFirm("Final order in the matter of front running of the trades of Axis Mutual Fund")).toBe("Unnamed party (SEBI)");
    expect(legacyExtractSebiFirm("Order in the matter of front running by Alka Jain")).toBe("front running by Alka Jain");
  });

  it("unnamedParty builds the label and category", () => {
    expect(unnamedParty("CBUAE", "bank")).toEqual({ name: "Unnamed bank (CBUAE)", category: UNNAMED_PARTY_CATEGORY });
  });

  it("rankings and tickers ignore unnamed labels", () => {
    expect(isGarbageFirmName("Unnamed bank (CBUAE)")).toBe(true);
    expect(isGarbageFirmName("Lloyds Bank plc")).toBe(false);
  });
});

describe("repairEntityNames plan", () => {
  const row = (regulator: string, firm: string, title: string | null, category: string | null = null): StoredRow => ({
    id: `${regulator}-${firm}`, content_hash: `hash-${regulator}-${firm}`, regulator, firm_individual: firm, firm_category: category, breach_type: title, d: "2026-01-01",
  });

  it("renames headline rows in place via the same extractors the scrapers use, never touching the hash", async () => {
    const sfc = await planRegulator("SFC", [
      row("SFC", "revokes Mui Chok Wah’s licence", "SFC revokes Mui Chok Wah’s licence and bans him for two years"),
      row("SFC", "Saxo Capital Markets HK Limited", "SFC reprimands and fines Saxo Capital Markets HK Limited $4 million"),
      row("SFC", "Hearing adjourned in criminal prosecution", "Hearing adjourned in criminal prosecution for noncompliance with SFC notices"),
    ], new Map());
    expect(sfc.renames.map((entry) => [entry.row.firm_individual, entry.proposal.name])).toEqual([
      ["revokes Mui Chok Wah’s licence", "Mui Chok Wah"],
    ]);
    // court news with no party and no sanction is a non-record: listed for retirement, never renamed
    expect(sfc.nonRecords.map((entry) => entry.firm_individual)).toEqual(["Hearing adjourned in criminal prosecution"]);

    const ciro = await planRegulator("CIRO", [row("CIRO", "CIRO Hearing Panel accepts settlement agreement with Samantha Cauvier", "CIRO Hearing Panel accepts settlement agreement with Samantha Cauvier")], new Map());
    expect(ciro.renames[0].proposal.name).toBe("Samantha Cauvier");
  });

  it("uses the fresh record for a party only the live page names (BMA), by matching content_hash", async () => {
    const stored = row("BMA", "Winding Up", "Winding Up");
    const fresh = new Map([[stored.content_hash, { contentHash: stored.content_hash, firmIndividual: "Yew Tree Investments Limited", firmCategory: "Financial Entity" } as never]]);
    const plan = await planRegulator("BMA", [stored], fresh);
    expect(plan.renames).toHaveLength(1);
    expect(plan.renames[0]).toMatchObject({ via: "fresh", proposal: { name: "Yew Tree Investments Limited", unnamed: false } });
  });

  it("labels anonymised parties as unnamed and sets the category, and is idempotent", async () => {
    const first = await planRegulator("CBUAE", [row("CBUAE", "A bank operating in the UAE", "Regulatory failures by bank", "Firm or Institution")], new Map());
    expect(first.renames[0].proposal).toEqual({ name: "Unnamed bank (CBUAE)", unnamed: true });
    const second = await planRegulator("CBUAE", [row("CBUAE", "Unnamed bank (CBUAE)", "Regulatory failures by bank", UNNAMED_PARTY_CATEGORY)], new Map());
    expect(second.renames).toEqual([]);
    const fss = await planRegulator("FSS", [row("FSS", "FSS Holds Basel Committee Meeting", "Supervision-Examination", "Supervision-Examination")], new Map());
    expect(fss.renames[0].proposal.unnamed).toBe(true);
  });

  it("decodes HTML entities for any regulator", async () => {
    const plan = await planRegulator("MFSA", [row("MFSA", "E&amp;S Consultancy Limited", "x")], new Map());
    expect(plan.renames[0].proposal.name).toBe("E&S Consultancy Limited");
    expect(plan.htmlEntityDecodes).toBe(1);
  });

  it("leaves unresolvable headline rows untouched and lists them", async () => {
    const plan = await planRegulator("CMVM", [row("CMVM", "CMVM divulgou hoje três decisões de contraordenação", "x")], new Map());
    expect(plan.renames).toEqual([]);
    expect(plan.nonRecords).toHaveLength(1);
  });
});

describe("FCA press-release rows: Fenech / Dunne", () => {
  const notice = (name: string, slug: string, amount: number | null, date: string, press = false) => ({
    regulator: "FCA", regulatorFullName: "Financial Conduct Authority", sourceDomain: "financial_conduct" as const,
    firmIndividual: name, firmCategory: null, amount, currency: "GBP", dateIssued: date, breachType: "x", breachCategories: ["OTHER"],
    summary: "s", noticeUrl: `https://www.fca.org.uk/publication/final-notices/${slug}.pdf`,
    sourceUrl: press ? "https://www.fca.org.uk/news/press-releases/x" : "https://www.fca.org.uk/news/search-results",
    sourceWindowNote: press ? "Official FCA press release enforcement feed." : "Official FCA final notices listing.",
  });

  it("a press release covering two people emits one row per person, each with only their own amount", () => {
    const html = `<html><body><h1>FCA fines and bans two individuals</h1><main>
      <p>Richard Fenech was fined £16,046 and Heather Dunne £41,230 for misconduct.</p>
      <a href="/publication/final-notices/richard-brian-fenech-2026.pdf">Richard Brian Fenech</a>
      <a href="/publication/final-notices/heather-imogen-dunne-2026.pdf">Heather Imogen Dunne</a></main></body></html>`;
    expect(countDistinctNoticeLinks(cheerioLoad(html))).toBe(2);
    const rows = parseFcaPressReleaseDetails(html, { title: "FCA fines two individuals", type: "Press releases", dateIssued: "2026-08-04", description: "FCA enforcement press release: fined", url: "https://www.fca.org.uk/news/press-releases/x" });
    // One run-on sentence: Dunne's clause has no fine wording, so she gets no amount rather than Fenech's.
    expect(rows.map((row) => [row.firmIndividual, row.amount])).toEqual([["Richard Brian Fenech", 16046], ["Heather Imogen Dunne", null]]);
    const separate = parseFcaPressReleaseDetails(html.replace("and Heather Dunne £41,230 for misconduct.", "for misconduct. Heather Dunne was fined £41,230."), { title: "FCA fines two individuals", type: "Press releases", dateIssued: "2026-08-04", description: "FCA enforcement press release: fined", url: "https://www.fca.org.uk/news/press-releases/x" });
    expect(separate.map((row) => [row.firmIndividual, row.amount])).toEqual([["Richard Brian Fenech", 16046], ["Heather Imogen Dunne", 41230]]);
    expect(rows[0].noticeUrl).toContain("richard-brian-fenech");
  });

  it("drops the press row when a final-notice row for the same person shares the notice URL", () => {
    const press = notice("Mr Fenech", "richard-brian-fenech-2026", 41230, "2026-08-04", true);
    const finalNotice = notice("Richard Brian Fenech", "richard-brian-fenech-2026", null, "2026-09-18");
    const dunne = notice("Heather Imogen Dunne", "heather-imogen-dunne-2026", null, "2026-09-18");
    expect(fcaSubjectsCompatible("Mr Fenech", "Richard Brian Fenech")).toBe(true);
    expect(fcaSubjectsCompatible("Heather Imogen Dunne", "Richard Brian Fenech")).toBe(false);
    const merged = mergeFcaEnforcementActions([press], [finalNotice, dunne]);
    expect(merged.map((record) => [record.firmIndividual, record.amount])).toEqual([["Richard Brian Fenech", null], ["Heather Imogen Dunne", null]]);
    // an exact-name press row (correct amount) is still preferred, as before
    const exact = notice("Richard Brian Fenech", "richard-brian-fenech-2026", 16046, "2026-08-04", true);
    expect(mergeFcaEnforcementActions([exact], [finalNotice]).map((record) => record.amount)).toEqual([16046]);
  });

  it("repair dry-run: the stored Fenech press row is listed for retirement; Decision Notice prefix is renamed", async () => {
    const row = (id: string, name: string, slug: string, amount: number | null, d: string, press: boolean): UkStoredRow => ({
      id, source_identity_key: `FCA::${name}::${slug}`, regulator: "FCA", firm_individual: name, firm_category: null,
      notice_url: `https://www.fca.org.uk/publication/final-notices/${slug}.pdf`, amount_original: amount, d,
      source_window_note: press ? "Official FCA press release enforcement feed." : "Official FCA final notices listing.",
    });
    const plan = await planUkEnforcement("UK-FCA", [
      row("a", "Mr Fenech", "richard-brian-fenech-2026", 41230, "2026-08-04", true),
      row("b", "Richard Brian Fenech", "richard-brian-fenech-2026", null, "2026-09-18", false),
      row("c", "Heather Imogen Dunne", "heather-imogen-dunne-2026", null, "2026-09-18", false),
      { ...row("d", "Decision Notice 2026 Alec Finch", "decision-notice-2026-alec-finch", 121200, "2026-07-23", true), notice_url: "https://www.fca.org.uk/publication/decision-notices/decision-notice-2026-alec-finch.pdf" },
    ]);
    expect(plan.retire.map((entry) => [entry.row.firm_individual, entry.row.amount_original, entry.duplicateOf.firm_individual])).toEqual([["Mr Fenech", 41230, "Richard Brian Fenech"]]);
    expect(plan.renames.map((entry) => [entry.row.firm_individual, entry.name])).toEqual([["Decision Notice 2026 Alec Finch", "Alec Finch"]]);
    const frc = await planUkEnforcement("UK-FRC", [
      { ...row("e", "Accountant", "x", null, "2026-09-11", false), regulator: "FRC" },
      { ...row("f", "KPMG", "y", null, "2026-09-11", false), regulator: "FRC" },
    ]);
    expect(frc.renames.map((entry) => entry.name)).toEqual(["Unnamed individual (FRC)"]);
  });
});

describe("criminal outcomes are enforcement records, not non-records", () => {
  const SFC_BODIES = {
    chinaAllAccess: ["SFC secures conviction in false trading prosecution involving China All Access shares", "The Shatin Magistrates’ Courts has convicted Ms Wong Yuk Lan, Administration Controller of China All Access (Holdings) Limited (China All Access), for false trading in the company’s shares, following a prosecution brought by the Securities and Futures Commission (SFC) (Notes 1 to 3). Wong was remanded to custody for sentencing on 17 December 2025."],
    shortSelling: ["SFC commence prosecution in securities fraud case involving illegal short selling", "The Securities and Futures Commission (SFC) today commenced criminal proceedings at the Eastern Magistrates’ Courts against Mr Chan Hoi Shing and Mr Li Po Ching for employing a fraudulent scheme involving illegal short selling. No plea was taken."],
    brothers: ["SFC commences false trading prosecution against brothers-in-law", "The Securities and Futures Commission (SFC) today commenced criminal proceedings at the Eastern Magistrates’ Court against Mr Lin Tai Fung and his brother-in-law, Mr Or Chun Nin, for alleged conspiracy to commit false trading (Notes 1 and 2). No plea was taken."],
    retail: ["SFC commences false trading prosecution against retail investor", "The Securities and Futures Commission (SFC) today commenced criminal proceedings at the Eastern Magistrates’ Court against Mr Ke Wen Hua for alleged false trading in the shares of Carry Wealth Holdings Limited (Notes 1 & 2). The Court adjourned the case."],
    sisters: ["Retail investors convicted and fined for illegal short selling", "The Eastern Magistrates’ Court today convicted Ms Chan Siu Tai and her sister Ms Janice Chan after they pleaded guilty to illegal short selling in prosecutions brought by the Securities and Futures Commission (SFC). The sisters were fined a sum of $114,000 and ordered to pay the SFC’s investigation costs."],
    adjourned: ["Hearing adjourned in criminal prosecution for noncompliance with SFC notices in market manipulation investigations", "The Eastern Magistrates’ Court today adjourned the hearing to 17 September 2026 on the criminal prosecution brought by the Securities and Futures Commission (SFC) against Mr Oliver Chow Pak Wah. Chow pleaded not guilty."],
  };

  it("SFC: names the defendants, one row each, typed as criminal conviction / prosecution", () => {
    expect(resolveSfcParties(...(SFC_BODIES.chinaAllAccess as [string, string]))).toEqual({ names: ["Wong Yuk Lan"], criminal: "conviction" });
    expect(resolveSfcParties(...(SFC_BODIES.shortSelling as [string, string])).names).toEqual(["Chan Hoi Shing", "Li Po Ching"]);
    expect(resolveSfcParties(...(SFC_BODIES.brothers as [string, string])).names).toEqual(["Lin Tai Fung", "Or Chun Nin"]);
    expect(resolveSfcParties(...(SFC_BODIES.retail as [string, string]))).toEqual({ names: ["Ke Wen Hua"], criminal: "prosecution" });
    for (const [title, body] of [SFC_BODIES.chinaAllAccess, SFC_BODIES.shortSelling, SFC_BODIES.brothers, SFC_BODIES.retail, SFC_BODIES.sisters]) {
      expect(isSfcNonRecord(title, body)).toBe(false);
    }

    const release = (key: keyof typeof SFC_BODIES) => ({ refNo: `25PR-${key}`, title: SFC_BODIES[key][0], dateIssued: "2025-11-06", body: SFC_BODIES[key][1], sourceUrl: "https://apps.sfc.hk/x" });
    const brothers = buildSfcRecords(release("brothers"));
    expect(brothers.map((record) => record.firmIndividual)).toEqual(["Lin Tai Fung", "Or Chun Nin"]);
    expect(brothers.every((record) => record.amount === null && record.breachType === "Criminal prosecution commenced" && record.breachCategories.includes("CRIMINAL_ACTION"))).toBe(true);
    expect(new Set(brothers.map((record) => record.contentHash)).size).toBe(2);
    // the first row is the one already stored: it keeps the legacy hash
    expect(brothers[0].contentHash).toBe(buildSfcRecord(release("brothers")).contentHash);

    const conviction = buildSfcRecords(release("chinaAllAccess"));
    expect(conviction).toHaveLength(1);
    expect(conviction[0]).toMatchObject({ firmIndividual: "Wong Yuk Lan", breachType: "Criminal conviction", amount: null });

    // a sum imposed on two people stays on one combined row; never double counted, never invented
    const sisters = buildSfcRecords(release("sisters"));
    expect(sisters).toHaveLength(1);
    expect(sisters[0].firmIndividual).toBe("Chan Siu Tai and Janice Chan");
    expect(sisters[0].amount).toBe(114000);
  });

  it("SFC: a procedural item with no decision is a non-record", () => {
    expect(isSfcNonRecord(...(SFC_BODIES.adjourned as [string, string]))).toBe(true);
    expect(resolveSfcParties(...(SFC_BODIES.adjourned as [string, string])).names).toEqual([]);
  });

  const FAMZHI_BODY = "In a major boost to the enforcement activities of the Securities and Exchange Commission, the Managing Director of Famzhi Interbiz Ltd, Mariam Suleiman has been sentenced to five years’ imprisonment without the option of a fine for defrauding investors of over N2 billion. Justice Inyang Ekwo of Federal High Court, Abuja, found Suleiman and Famzhi Interbiz Ltd guilty on counts one and two.";
  const TRIAL_BODY = "Justice Zainab Abubakar of the Federal High Court, Court 4, Abuja has set March 16, 2023 for the commencement of trial of Vektr Capital Global Group along with two staff of the company.";

  it("NGSEC: a sentence is published against each defendant with no amount; a trial date is not", () => {
    expect(extractNgsecDefendants("Ponzi: Famzhi Boss Jailed Five Years for Investment Scam", FAMZHI_BODY)).toEqual(["Mariam Suleiman", "Famzhi Interbiz Ltd"]);
    expect(extractNgsecDefendants("Ponzi: Court Sets March 16 for Trial of Vektr Capital & 2 Others", TRIAL_BODY)).toEqual([]);
    expect(isNgsecCourtOutcome("Ponzi: Court Sets March 16 for Trial")).toBe(false);
    const entry = { title: "Ponzi: Famzhi Boss Jailed Five Years for Investment Scam", detailUrl: "https://www.sec.gov.ng/enforcements/keep-track-of-enforcement-updates/ponzi-famzhi/", summary: "s", dateIssued: "2024-06-19" };
    const detail = { title: entry.title, dateIssued: "2024-06-19", summary: FAMZHI_BODY, body: FAMZHI_BODY, affectedEntities: [] };
    const rows = buildNgsecCriminalRecords(entry as never, detail as never);
    expect(rows.map((row) => [row.firmIndividual, row.amount, row.breachType])).toEqual([["Mariam Suleiman", null, "Criminal conviction"], ["Famzhi Interbiz Ltd", null, "Criminal conviction"]]);
    expect(new Set(rows.map((row) => row.contentHash)).size).toBe(2);
    // the first defendant keeps the hash of the row stored under the headline
    expect(rows[0].contentHash).toBe(buildEuFineContentHash({
      regulator: "NGSEC", regulatorFullName: "x", countryCode: "NG", countryName: "x", firmCategory: null,
      firmIndividual: "Ponzi: Famzhi Boss Jailed Five Years for Investment Scam", amount: legacyNgsecAmount(`${entry.title} ${entry.summary} ${detail.title} ${detail.summary} ${detail.body}`), currency: "NGN", dateIssued: "2024-06-19",
      breachType: "x", breachCategories: [], summary: "x", finalNoticeUrl: entry.detailUrl, sourceUrl: entry.detailUrl,
      dedupeKey: `${entry.detailUrl}::ponzi: famzhi boss jailed five years for investment scam`, rawPayload: null,
    }));
  });

  it("repair: criminal rows are renamed (not retired); only procedural items are retired", async () => {
    const row = (regulator: string, firm: string, title: string, summary: string): StoredRow => ({ id: firm, content_hash: `h-${firm}`, regulator, firm_individual: firm, firm_category: null, breach_type: title, summary, d: "2025-01-01" });
    const sfc = await planRegulator("SFC", [
      row("SFC", "secures conviction in false trading prosecution involving China All Access shares", ...(SFC_BODIES.chinaAllAccess as [string, string])),
      row("SFC", "commence prosecution in securities fraud case involving illegal short selling", ...(SFC_BODIES.shortSelling as [string, string])),
      row("SFC", "commences false trading prosecution against brothers-in-law", ...(SFC_BODIES.brothers as [string, string])),
      row("SFC", "commences false trading prosecution against retail investor", ...(SFC_BODIES.retail as [string, string])),
      row("SFC", "Hearing adjourned in criminal prosecution", ...(SFC_BODIES.adjourned as [string, string])),
    ], new Map());
    expect(sfc.nonRecords.map((entry) => entry.firm_individual)).toEqual(["Hearing adjourned in criminal prosecution"]);
    expect(sfc.renames.map((entry) => [entry.proposal.name, entry.proposal.breachType, entry.proposal.alsoDefendants ?? []])).toEqual([
      ["Wong Yuk Lan", "Criminal conviction", []],
      ["Chan Hoi Shing", "Criminal prosecution commenced", ["Li Po Ching"]],
      ["Lin Tai Fung", "Criminal prosecution commenced", ["Or Chun Nin"]],
      ["Ke Wen Hua", "Criminal prosecution commenced", []],
    ]);
    const ngsec = await planRegulator("NGSEC", [
      row("NGSEC", "Ponzi: Famzhi Boss Jailed Five Years for Investment Scam", "Ponzi: Famzhi Boss Jailed Five Years for Investment Scam", FAMZHI_BODY),
      row("NGSEC", "Ponzi: Court Sets March 16 for Trial of Vektr Capital & 2 Ot", "Ponzi: Court Sets March 16 for Trial of Vektr Capital & 2 Ot", TRIAL_BODY),
    ], new Map());
    expect(ngsec.nonRecords.map((entry) => entry.firm_individual)).toEqual(["Ponzi: Court Sets March 16 for Trial of Vektr Capital & 2 Ot"]);
    expect(ngsec.renames.map((entry) => [entry.proposal.name, entry.proposal.alsoDefendants])).toEqual([["Mariam Suleiman", ["Famzhi Interbiz Ltd"]]]);
  });
});

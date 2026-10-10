import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPaFicActRecord,
  buildPaPenaltyOrderRecord,
  buildPaRecords,
  discoverPaSanctionsPdfUrl,
  findPdfOnlyRows,
  parsePaFicActSanctionsHtml,
  parsePaOutcome,
  parsePaPenaltyOrdersHtml,
  parsePaSanctionsPdfText,
  resolvePaDecisionDate,
} from "../scrapeSarbPa.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const sanctionsHtml = read("sarb-pa-sanctions-sample.html");
const functionsHtml = read("sarb-pa-functions-sample.html");
const pdfText = read("sarb-pa-sanctions-pdf.txt");

describe("PA outcome parsing and ZAR scale", () => {
  it("parses million-scale penalties and suspended portions", () => {
    expect(parsePaOutcome("A financial penalty of R10 million, a reprimand and a directive to take remedial action"))
      .toMatchObject({ amount: 10_000_000, suspendedAmount: null, reprimands: 1, directive: true });
    expect(parsePaOutcome("A financial penalty of R5.250 million")).toMatchObject({ amount: 5_250_000 });
    expect(parsePaOutcome("A financial penalty of R 56.25 million, seven cautions not to repeat the conduct which led to the non-compliance and a reprimand. The financial penalty of R10.5 million was, however suspended for a period of 36 months from 30 July 2024, subject to Capitec Bank Limited adhering to certain conditions imposed by the PA."))
      .toMatchObject({ amount: 56_250_000, suspendedAmount: 10_500_000, cautions: 7, reprimands: 1 });
    expect(parsePaOutcome("A financial penalty of R 10.730 million, three cautions and three reprimands. The financial penalty of R5 million was, however suspended for a period of 24 months"))
      .toMatchObject({ amount: 10_730_000, suspendedAmount: 5_000_000, cautions: 3, reprimands: 3 });
  });

  it("treats a fully suspended penalty as imposed and wholly suspended", () => {
    expect(parsePaOutcome("A financial penalty totalling R6 million, which is fully and conditionally suspended for a period of 12 months as from 5 March 2025, and a caution not to repeat the conduct which led to the non-compliance."))
      .toMatchObject({ amount: 6_000_000, suspendedAmount: 6_000_000, cautions: 1 });
  });

  it("keeps caution-only sanctions as non-monetary (amount null, never zero)", () => {
    const outcome = parsePaOutcome("Administrative sanctions consist of a caution not to repeat the conduct which led to the non-compliance and reprimand.");
    expect(outcome.amount).toBeNull();
    expect(outcome).toMatchObject({ cautions: 1, reprimands: 1 });
  });

  it("derives the order total when the source headline is only the suspended part", () => {
    // Land Bank Insurance: R3 000 000 suspended + remaining R2 000 000 payable = R5 000 000.
    expect(parsePaOutcome("Penalty of R3 000 000 (three million rand) of the administrative penalty will be suspended for a period of three years from the date the penalty is imposed, subject to LBIC not committing a similar offence during this period. 3. The remaining balance of R2 000 000 (two million rand), inclusive of costs, must be paid within 14 working days from the date of this order."))
      .toMatchObject({ amount: 5_000_000, suspendedAmount: 3_000_000 });
  });

  it("repairs the source typo 'R5' (million dropped) using its own suspended and payable parts", () => {
    expect(parsePaOutcome("Penalty of R5 of which R3 million rand of the administrative penalty will be suspended for a period of three years and the remaining balance of R2 million rand is payable within 14 working days"))
      .toMatchObject({ amount: 5_000_000, suspendedAmount: 3_000_000 });
  });

  it("reads word-only amounts and number-in-words suspended parts", () => {
    expect(parsePaOutcome("Penalty of seven hundred and twenty-six thousand rand is suspended for a period of three years, subject to Access Bank SA not committing a similar offence"))
      .toMatchObject({ amount: 726_000, suspendedAmount: 726_000 });
    expect(parsePaOutcome("Penalty of Five million rands; Three million of the penalty will be suspended for a period of three years"))
      .toMatchObject({ amount: 5_000_000, suspendedAmount: 3_000_000 });
    expect(parsePaOutcome("Penalty of one million, four hundred and twenty-six thousand, five hundred and twenty-four rands payable within 14 working days"))
      .toMatchObject({ amount: 1_426_524, suspendedAmount: null });
  });

  it("handles 'of which' splits and R-prefixed comma amounts", () => {
    expect(parsePaOutcome("Penalty of R300,000 of which R150,000 is suspended for a period of 3 years from date of penalty order"))
      .toMatchObject({ amount: 300_000, suspendedAmount: 150_000 });
    expect(parsePaOutcome("The Prudential Authority imposed an administrative penalty of R9 689 390, R4 844 695 is payable within 14 working days from the date of this order. The remaining amount of R4 844 695 will be suspended for a period of three years"))
      .toMatchObject({ amount: 9_689_390, suspendedAmount: 4_844_695 });
  });
});

describe("PA decision dates", () => {
  it("uses the suspension start (sanction date) when plausible, else the media release date", () => {
    expect(resolvePaDecisionDate("R7.5 million ... suspended for a period of three (3) years from 25 September 2019, subject", "2019-12-20"))
      .toEqual({ date: "2019-09-25", basis: "sanction_date" });
    expect(resolvePaDecisionDate("A financial penalty of R10 million", "2014-04-16")).toEqual({ date: "2014-04-16", basis: "media_release_date" });
    // A date AFTER the release cannot be the decision date.
    expect(resolvePaDecisionDate("suspended for 3 years from 5 March 2027", "2025-06-20").basis).toBe("media_release_date");
  });
});

describe("PA HTML tables", () => {
  const rows = parsePaFicActSanctionsHtml(sanctionsHtml);

  it("parses bank and insurer FIC Act rows with sector, release date and notice link", () => {
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const absa = rows.find((row) => row.institution === "Absa Bank Limited" && row.releaseDate === "2025-04-25");
    expect(absa).toMatchObject({ sector: "Bank" });
    expect(absa?.mediaReleaseUrl).toContain("https://www.resbank.co.za/");
    expect(rows.find((row) => row.institution.startsWith("Discovery Life"))?.sector).toBe("Insurer");
  });

  it("repairs the source's unbalanced bracket in GroBank's name", () => {
    const grobank = rows.find((row) => row.institution.startsWith("GroBank"));
    expect(grobank?.institution.endsWith(")")).toBe(true);
  });

  it("builds FIC Act records with the right scale, dates and English summary", () => {
    const capitec = rows.find((row) => row.institution.startsWith("Capitec"))!;
    const record = buildPaFicActRecord(capitec);
    expect(record).toMatchObject({ regulator: "SARBPA", countryCode: "ZA", currency: "ZAR", amount: 56_250_000, dateIssued: "2024-07-30" });
    expect(record.amountGbp).toBeGreaterThan(2_000_000);
    expect(record.amountGbp).toBeLessThan(3_000_000);
    expect(record.summary).toContain("Financial Intelligence Centre Act");
    expect(record.finalNoticeUrl).toContain("capitec");
    const citi = buildPaFicActRecord(rows.find((row) => row.institution.startsWith("Citibank"))!);
    expect(citi.summary).toContain("wholly suspended");
  });

  it("parses section 167 penalty orders with order links and distinct same-day identities", () => {
    const orders = parsePaPenaltyOrdersHtml(functionsHtml);
    expect(orders.length).toBeGreaterThanOrEqual(10);
    const escap2022 = orders.find((order) => order.entity === "Escap SOC Limited" && order.orderDate === "2022-07-05")!;
    const escap2024 = orders.find((order) => order.entity === "Escap SOC Limited" && order.orderDate === "2024-09-11")!;
    expect(buildPaPenaltyOrderRecord(escap2022)).toMatchObject({ amount: 5_000_000, dateIssued: "2022-07-05" });
    expect(buildPaPenaltyOrderRecord(escap2024)).toMatchObject({ amount: 7_645_000 });
    expect(buildPaPenaltyOrderRecord(escap2022).contentHash).not.toBe(buildPaPenaltyOrderRecord(escap2024).contentHash);
    const record = buildPaPenaltyOrderRecord(escap2024);
    expect(record.finalNoticeUrl).toMatch(/Escap.*\.pdf$/);
    expect(record.summary).toContain("section 167");
  });

  it("keeps a stable identity when an amount is later corrected", () => {
    const row = rows[0];
    const original = buildPaFicActRecord(row);
    const corrected = buildPaFicActRecord({ ...row, sanctionText: row.sanctionText.replace(/R\d+ million/, "R11 million") });
    expect(corrected.contentHash).toBe(original.contentHash);
    expect(buildPaRecords(rows, []).length).toBe(rows.length);
  });
});

describe("PA sanctions PDF", () => {
  it("discovers the current PDF from the parent page without a hard-coded file name", () => {
    expect(discoverPaSanctionsPdfUrl(functionsHtml)).toBe(
      "https://www.resbank.co.za/content/dam/sarb/what-we-do/prudential-regulation/functions-of-the-prudential-authority/Administrative%20sanctions%20imposed%20on%20supervised%20institutions%20August.pdf",
    );
    const renamed = functionsHtml.replace("institutions%20August.pdf", "institutions%20March%202027.pdf");
    expect(discoverPaSanctionsPdfUrl(renamed)).toContain("March%202027.pdf");
    expect(discoverPaSanctionsPdfUrl("<a href='/other.pdf'>x</a>")).toBeNull();
  });

  const pdfRows = parsePaSanctionsPdfText(pdfText);

  it("parses every numbered row of the PDF, including wrapped bank names and the source's numbering gap", () => {
    expect(pdfRows).toHaveLength(19);
    expect(pdfRows.map((row) => row.no)).toEqual([...Array.from({ length: 17 }, (_, i) => i + 1), 19, 20]);
    expect(pdfRows[0]).toMatchObject({ institution: "Absa Bank Limited", releaseDate: "2014-04-16" });
    expect(pdfRows.find((row) => row.no === 4)?.institution).toBe("The Standard Bank of South Africa Limited");
    expect(pdfRows.find((row) => row.no === 12)?.institution).toBe("Société Générale Johannesburg Branch (Socgen)");
    expect(pdfRows.find((row) => row.no === 15)?.institution).toBe("China Construction Bank - Johannesburg Branch (CCB)");
  });

  it("parses PDF penalties at the right scale", () => {
    const amount = (no: number) => parsePaOutcome(pdfRows.find((row) => row.no === no)!.sanctionText).amount;
    expect(amount(1)).toBe(10_000_000);
    expect(amount(4)).toBe(60_000_000);
    expect(amount(7)).toBe(500_000);
    expect(amount(14)).toBe(2_500_000);
    expect(amount(17)).toBe(5_250_000);
    expect(amount(20)).toBe(400_000);
    expect(parsePaOutcome(pdfRows.find((row) => row.no === 15)!.sanctionText)).toMatchObject({ amount: 75_000_000, suspendedAmount: 20_000_000 });
  });

  it("reconciles the PDF against the HTML table and reports only rows missing from the table", () => {
    const html = parsePaFicActSanctionsHtml(sanctionsHtml);
    const missing = findPdfOnlyRows(pdfRows, html);
    // The sample HTML holds a subset of banks, so the others are legitimately reported.
    expect(missing.length).toBe(pdfRows.length - html.filter((row) => pdfRows.some((p) => p.releaseDate === row.releaseDate && p.institution.slice(0, 6) === row.institution.slice(0, 6))).length);
    expect(findPdfOnlyRows(pdfRows, [])).toHaveLength(19);
  });
});

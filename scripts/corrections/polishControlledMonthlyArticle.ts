#!/usr/bin/env npx tsx
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash, type EditorialDraftArtifact } from "../lib/editorialWorkflow.js";

const draftPath = join(process.cwd(), "scripts/data/drafts/fca-fines-july-2025.json");
const draft = JSON.parse(readFileSync(draftPath, "utf8")) as EditorialDraftArtifact & {
  qualityReport?: unknown;
};

draft.title = "FCA Fines July 2025: Nine Final Notices Reviewed";
draft.seoTitle = "FCA Fines July 2025: Nine Final Notices Reviewed | RegActions";
draft.excerpt = "Review nine FCA final notices from July 2025, covering governance, AML, reporting and controls, with only source-verified monetary amounts included.";
draft.keywords = [
  "FCA fines July 2025",
  "FCA final notices",
  "FCA enforcement",
  "individual accountability",
  "AML controls",
  "transaction reporting",
  "client money controls",
  "listing rules",
];
draft.content = `## July 2025 overview

RegActions identified nine FCA final notices dated in July 2025 in the source set used for this report. The notices concern five firms and four individuals. They cover individual integrity, regulatory cooperation, transaction reporting, money-laundering risk management, client money account controls, retail bank conduct and listing rules.

Only one monetary amount in the dataset meets the RegActions verification rule for use in this article. The FCA imposed a £10,000 financial penalty on Markos Theodosi Markou. The other eight notices describe financial penalties or related enforcement outcomes, but their amounts are not treated as verified here. Those values are therefore excluded from the monthly monetary total.

This distinction is important. It does not mean the other actions were non-monetary. It means this report does not repeat a figure unless the evidence record supports it as a verified penalty amount. The underlying FCA notice remains the authoritative source for each case.

The month is notable for the range of duties represented in a compact set of actions. Three individual cases concern integrity, openness with the regulator or responsibility for listing-rule compliance. Firm cases address transaction reporting, financial crime controls, client money account processes and broader governance obligations.

## All nine FCA actions

### Sigma Broking Limited, 29 July 2025

The FCA final notice refers to breaches of Principle 3 and the Markets in Financial Instruments Regulation in connection with transaction reporting. The source classifies the case in the trading firm sector and records that a financial penalty was imposed. Its amount is not verified for this report.

### Jean-Noel Alba, 25 July 2025

The final notice records breaches of APER 1 and APER 4, together with Individual Conduct Rules 1 and 3. The source describes failures relating to integrity and dealing openly with the FCA. It records a prohibition and a fine, but the monetary amount is not verified for use in this report.

The case provides direct evidence of personal accountability across both the earlier approved-person framework and the conduct rules. The relevant monthly signal is the combination of conduct findings, a prohibition and a financial sanction, not an unverified figure.

### James Edward Staley, 23 July 2025

The FCA issued its final notice after the Upper Tribunal decision dated 26 June 2025. The notice concerns Individual Conduct Rules 1 and 3 and Senior Manager Conduct Rule 4. The source records a financial penalty and a prohibition from holding senior management functions. The amount is not verified here.

This action adds a senior-management case to the month’s accountability record. The evidence supports the stated rule breaches and outcomes. It does not support broader claims in this article about enforcement strategy, future tribunal cases or likely sanctions for other managers.

### Barclays Bank plc, 14 July 2025

The final notice concerns a breach of Principle 2, the requirement to conduct business with due skill, care and diligence. The FCA record says the breach occurred between 9 January 2015 and 23 April 2021. It relates to failures to identify, assess, monitor and manage money-laundering risks associated with banking services for one corporate customer.

This is the month’s directly evidenced financial-crime control case. It connects the Principle 2 finding to customer-specific money-laundering risk management. Any financial penalty amount is excluded because the article’s source record does not verify it for monetary reporting.

### Barclays Bank UK plc, 14 July 2025

The FCA record says Barclays Bank UK plc breached Principle 3 and SYSC 6.1.1R. It attributes the breach to inadequate organisation, control and risk-management systems for opening client money accounts. The amount associated with the action is not verified in this report.

Although this notice and the Barclays Bank plc notice share a publication date, they address different control questions. One concerns money-laundering risk management for a corporate customer. The other concerns systems and controls for client money account opening. They are presented separately to preserve that distinction.

### Markos Theodosi Markou, 10 July 2025

The FCA issued a final notice after the Supreme Court rejected Mr Markou’s application to appeal the Court of Appeal judgment dated 17 December 2024. The notice records a breach of Statement of Principle 1, concerning integrity, in the mortgages sector. It imposes a £10,000 financial penalty and a prohibition.

This is the only case in the July source set with a monetary amount verified under the RegActions evidence rule. It therefore accounts for the full £10,000 verified monthly total reported here. No figure from another July record has been added to that total.

### Monzo Bank Limited, 8 July 2025

The final notice refers to breaches of Principle 3 and section 55L of the Financial Services and Markets Act. The source describes conduct in the retail banks sector and records that a financial penalty was imposed. The amount is not verified for this report.

### Craig Donaldson, 2 July 2025

The FCA final notice says Craig Donaldson was knowingly concerned in a contravention of Listing Rule 1.3.3R. The source records a financial penalty. Its amount is not verified under the evidence rule applied to this report.

The case is reported as an individual listing-rule action. No further characterisation of motive, loss or market effect is made because those points are not established by the supplied record.

### David Arden, 2 July 2025

The FCA final notice says David Arden was knowingly concerned in a contravention of Listing Rule 1.3.3R. It records that a financial penalty was imposed, but the amount is not verified for this report.

Mr Arden’s case and Mr Donaldson’s case are separate records. They share the same date and rule reference, so the report keeps both in view while avoiding an unsupported assumption that every factual finding or sanction detail was identical.

## What the evidence establishes

The nine notices form four clear evidence groups. Individual accountability appears in the Markou, Alba and Staley cases, with integrity, openness and senior-manager disclosure duties identified in the source material. Listing-rule responsibility appears in the Donaldson and Arden cases.

Firm-level systems and controls appear in three distinct forms. Sigma Broking Limited concerns transaction reporting. Barclays Bank plc concerns the management of money-laundering risks for a corporate banking customer. Barclays Bank UK plc concerns controls for opening client money accounts. Monzo Bank Limited adds a Principle 3 and section 55L action in the retail bank sector.

The monetary evidence is much narrower than the action count. Nine notices are in scope, but only one amount is verified for use in the monthly total. RegActions therefore reports £10,000 as the verified total and labels the remaining amounts as not verified. This avoids presenting a partial or uncertain sum as a complete measure of FCA penalties.

The source set supports description, classification and comparison of the recorded duties. It does not establish a trend from one month, the FCA’s reason for publication timing, or the likely direction of later enforcement. Those questions require a longer period and additional official evidence.

## Questions for compliance and risk teams

The cases can be used as a focused challenge list without extending beyond their facts. For individual accountability, firms can check how integrity, regulatory openness and senior-manager disclosure duties are documented, escalated and evidenced. The Alba and Staley notices show why these duties should be considered separately rather than reduced to a general conduct label.

For financial crime, the Barclays Bank plc notice supports a review of how customer-specific money-laundering risks are identified, assessed, monitored and managed over time. The evidence does not prescribe a particular control design, but it does identify the control activities at issue.

For operational controls, the Sigma Broking Limited and Barclays Bank UK plc notices point to different data and process risks. Transaction reporting requires accurate regulatory data flows. Client money account opening requires responsible organisation, control and risk management. A committee pack should keep these control families distinct.

For public-company and individual governance, the Donaldson and Arden notices support a check that responsibility for listing-rule compliance is clearly assigned and evidenced. The Markou case supports a separate review of approved-person integrity expectations and the implications of a prohibition outcome.

These are evidence-led questions, not findings about another firm’s controls. Each organisation must assess its own obligations, business model and control evidence.

## Key Takeaways

* Nine FCA final notices dated in July 2025 are included in the reviewed source set.
* Markos Theodosi Markou’s £10,000 penalty is the only monetary amount verified for this report.
* The Jean-Noel Alba and James Edward Staley notices combine individual conduct findings with prohibition outcomes.
* The two Barclays notices address different controls: money-laundering risk management and client money account opening.
* Sigma Broking Limited’s notice concerns Principle 3 and MiFIR transaction reporting obligations.
* Craig Donaldson and David Arden are separate listing-rule cases dated 2 July 2025.

## About the data

This report uses nine RegActions records linked to official FCA final notices dated from 2 July to 29 July 2025. It covers every action in that monthly source cohort. The chart groups those records by the breach themes stored in the evidence dataset.

RegActions includes a monetary figure only when the source record satisfies its verified-penalty rule. A notice may describe a fine while its amount remains excluded from this article’s total. That is an evidence-status decision, not a statement that the underlying action was non-monetary.

Readers should use the linked FCA notice as the authoritative case source. RegActions provides the structured monthly view, the evidence status and the cross-case comparison.`;

draft.readTime = `${Math.ceil(draft.content.split(/\s+/).filter(Boolean).length / 200)} min read`;
draft.status = "draft";
draft.editorialManifest.status = "drafted";
draft.editorialManifest.claims = [];
draft.editorialManifest.reviews = [];
draft.editorialManifest.headApproval = undefined;
draft.editorialManifest.repairHistory ||= [];
for (const image of draft.editorialManifest.images) {
  image.altText = `Deep navy RegActions cover displaying “${draft.title}” in white type`;
  image.approved = false;
}
draft.editorialManifest.contentHash = contentHash(draft);

writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  slug: draft.slug,
  words: draft.content.split(/\s+/).filter(Boolean).length,
  contentHash: draft.editorialManifest.contentHash,
}, null, 2));

/**
 * Regulator Profiles — static enforcement personality descriptions for 8 major regulators.
 *
 * Injected into generator system prompts so the AI understands how each regulator
 * approaches enforcement. This reduces hallucinated "uniform" descriptions and
 * produces more accurate regulator-specific analysis.
 */

import type { EnforcementRecord } from './articleData.js';

interface RegulatorProfile {
  name: string;
  fullName: string;
  jurisdiction: string;
  profile: string;
}

const PROFILES: Record<string, RegulatorProfile> = {
  FCA: {
    name: 'FCA',
    fullName: 'Financial Conduct Authority',
    jurisdiction: 'United Kingdom',
    profile: `The FCA uses a risk-based, outcomes-focused enforcement model. It rarely pursues criminal prosecutions — the vast majority of its enforcement activity results in Final Notices imposing financial penalties and/or prohibitions against individuals. The FCA's standard discount for early settlement is 30% at Stage 1 (before a Supervisory Notice is issued), declining to 20% at Stage 2 and 0% if the matter reaches a Regulatory Decisions Committee hearing. Typical penalty range: £50,000–£265 million for firms; £10,000–£8 million for individuals. Enforcement triggers most commonly include: inadequate AML controls, mis-selling or consumer duty failures, market abuse (insider dealing and market manipulation), governance and systems-and-controls failings, and breach of Principles for Businesses (especially Principles 2, 3, and 6). The FCA increasingly uses supervisory non-monetary tools (requirements, restrictions on permissions, asset freezes) before or instead of formal fines. Timeline from investigation opening to Final Notice: typically 2–5 years.`,
  },
  SEC: {
    name: 'SEC',
    fullName: 'Securities and Exchange Commission',
    jurisdiction: 'United States',
    profile: `The SEC operates a civil enforcement model that sits alongside the DOJ's criminal prosecutorial arm — the same conduct can result in parallel SEC civil penalties and DOJ criminal charges. The SEC uses both Administrative Proceedings (before an internal Administrative Law Judge) and federal court actions; larger and more contested cases typically go to federal court. Key penalty features: disgorgement of ill-gotten gains is mandatory; civil monetary penalties are additive. The SEC maintains a Whistleblower Program (awards 10–30% of sanctions exceeding $1 million) which generates a significant share of its enforcement leads. Typical triggers: insider trading (Section 10(b)/Rule 10b-5), disclosure failures (inaccurate 10-K/8-K filings), investment adviser failures (Advisers Act violations), accounting fraud, and — since 2021 — ESG disclosure misrepresentation. Recent enforcement focus areas include crypto assets (Howey test application), AI/algorithmic trading, and cybersecurity incident disclosure. The SEC imposes "neither admit nor deny" settlements in the majority of cases.`,
  },
  ESMA: {
    name: 'ESMA',
    fullName: 'European Securities and Markets Authority',
    jurisdiction: 'European Union',
    profile: `ESMA is primarily a standard-setter and supervisor of EU-level entities (credit rating agencies, trade repositories, certain CCPs) rather than a direct enforcer of national financial services firms — that role belongs to National Competent Authorities (NCAs) such as AMF, BaFin, AFM, and CONSOB. ESMA's direct enforcement powers cover supervisory breaches by entities it directly supervises. For the broader EU market, ESMA coordinates enforcement through convergence tools (Q&As, supervisory briefings, peer reviews) rather than direct fines. Key regulatory frameworks it enforces/coordinates: MiFID II/MiFIR (market conduct), MAR (market abuse), SFDR and ESRS (sustainable finance disclosures), EMIR (derivatives clearing), and now DORA (digital operational resilience, from January 2025). Penalty levels under ESMA's direct supervision authority are capped at defined EU legislative maxima (e.g., €20 million or 10% of annual turnover under EMIR). When citing "ESMA enforcement," distinguish between ESMA's direct supervisory actions and NCA actions implementing ESMA-authored rules.`,
  },
  BaFin: {
    name: 'BaFin',
    fullName: 'Bundesanstalt für Finanzdienstleistungsaufsicht',
    jurisdiction: 'Germany',
    profile: `BaFin (German Federal Financial Supervisory Authority) combines banking, securities, and insurance supervision — making it a "twin peaks plus" model within a single institution. BaFin's enforcement approach is characterised by Ordnungswidrigkeitsverfahren (administrative fine proceedings) for regulatory breaches and criminal referrals to public prosecutors for criminal offences (primarily insider trading and market manipulation). Fines under BaFin's administrative powers are typically modest by international standards — the MiFIR/MAR maximum is €15 million or 15% of annual turnover; in practice, individual case fines frequently fall in the €50,000–€5 million range. BaFin publishes enforcement actions via its official journal (Bundesanzeiger) but historically less transparency than FCA Final Notices. Key recent enforcement themes: AML/KYC failures at banks and crypto firms, market abuse surveillance, SFDR disclosure compliance. BaFin's style is more supervisory-dialogue-first compared to the FCA's adversarial model — formal enforcement action typically follows sustained supervisory engagement failure.`,
  },
  MAS: {
    name: 'MAS',
    fullName: 'Monetary Authority of Singapore',
    jurisdiction: 'Singapore',
    profile: `MAS serves as Singapore's central bank and integrated financial regulator. Its enforcement model combines civil penalties, prohibition orders against individuals, and criminal prosecution (particularly for market misconduct under the Securities and Futures Act). MAS is known for a "supervisory-first" philosophy — it prefers early engagement and remediation, reserving formal enforcement for serious breaches or firms that fail to remediate. Fines under the Banking Act and Securities and Futures Act can reach SGD 1 million per breach for firms; market misconduct can attract criminal penalties. MAS has expanded its enforcement activity significantly since 2016 (post-1MDB scandal) and now regularly pursues AML failings at banks and private banking institutions. Key triggers: AML/CFT control failures (especially correspondent banking and private banking), market misconduct, inadequate risk management at systemically important financial institutions, and cross-border data/operational risk. MAS increasingly coordinates enforcement with offshore counterparts (notably FCA, HKMA, and SEC) via MoUs.`,
  },
  SEBI: {
    name: 'SEBI',
    fullName: 'Securities and Exchange Board of India',
    jurisdiction: 'India',
    profile: `SEBI (Securities and Exchange Board of India) is India's capital markets regulator with broad powers covering securities issuance, exchanges, brokers, mutual funds, and investment advisers. SEBI's enforcement toolkit includes disgorgement, monetary penalties, debarment from capital markets, and criminal referrals to SFIO (Serious Fraud Investigation Office) or CBI for serious offences. SEBI issues three types of formal actions: Show Cause Notices (SCN), Adjudication Orders (monetary penalties), and Disgorgement Orders. Penalties can reach ₹25 crore (approximately £2.3 million) per breach under SEBI Act Section 15; disgorgement is additional and can be substantially larger for insider trading cases. Key enforcement themes: insider trading (particularly involving company insiders, promoters, and connected persons), front-running by fund managers and brokers, circular trading / price manipulation, and fraudulent fundraising schemes. SEBI is distinct from other global regulators in its heavy use of interim ex parte orders to freeze assets during investigation — often before any formal charge is framed.`,
  },
  ASIC: {
    name: 'ASIC',
    fullName: 'Australian Securities and Investments Commission',
    jurisdiction: 'Australia',
    profile: `ASIC (Australian Securities and Investments Commission) is Australia's conduct regulator for financial services and markets. Following the 2018–2019 Royal Commission into Misconduct in the Banking, Superannuation and Financial Services Industry, ASIC adopted an explicit "why not litigate?" policy stance — it now pursues civil and criminal court action far more aggressively than its pre-Royal Commission posture. Key enforcement mechanisms: civil penalty proceedings (maximum penalties under Corporations Act were increased 10-fold post-Royal Commission to AUD 525 million per breach for companies), criminal prosecution via CDPP, license cancellation, and enforceable undertakings. Key enforcement themes: responsible lending failures, insurance claims handling misconduct, fee-for-no-service (charging ongoing advice fees without delivering advice), conflicted remuneration, and superannuation trustee failures. ASIC's civil penalty regime now includes "record fine" outcomes in the AUD 100 million+ range. A distinctive ASIC feature: it maintains a public "Enforcement Outcomes Report" updated quarterly, making it easier to track enforcement trajectory than many peer regulators.`,
  },
  AMF: {
    name: 'AMF',
    fullName: 'Autorité des marchés financiers',
    jurisdiction: 'France',
    profile: `The AMF (Autorité des marchés financiers) is France's financial markets regulator, responsible for securities regulation, collective investment schemes, financial advisers, and market infrastructure. Its enforcement model routes through the Commission des sanctions (Sanctions Committee), which is independent of the AMF's investigation function — a structure designed to ensure procedural separation. Financial penalties under MAR can reach €100 million or 15% of annual turnover; the AMF also issues professional bans and public reprimands. AMF enforcement actions are published in full (decisions de la commission des sanctions). Key enforcement themes: insider trading and market manipulation (particularly around M&A transactions), investment adviser licensing breaches, marketing of complex financial products to retail clients, and — increasingly — crypto asset service provider (CASP) compliance under MiCA's French implementation. The AMF coordinates closely with FCA and BaFin via bilateral MoUs and ESMA enforcement convergence work. Average timeline from formal investigation opening to sanctions decision: 18–36 months.`,
  },
};

/**
 * Return profiles for regulators that appear in the source records.
 * Capped at 4 profiles to avoid bloating the system prompt.
 */
export function getRelevantProfiles(records: Array<{ regulator: string }>): string {
  const seen = new Set<string>();
  for (const r of records) {
    const key = r.regulator.toUpperCase().trim();
    for (const profileKey of Object.keys(PROFILES)) {
      const pkUpper = profileKey.toUpperCase();
      if (key === pkUpper || key.includes(pkUpper) || pkUpper.includes(key)) {
        seen.add(profileKey);
      }
    }
    if (seen.size >= 4) break;
  }

  if (seen.size === 0) return '';

  const sections = [...seen].map(key => {
    const p = PROFILES[key]!;
    return `**${p.name} (${p.fullName}, ${p.jurisdiction}):** ${p.profile}`;
  });

  return `\n\n=== REGULATOR ENFORCEMENT PROFILES ===\nUse these profiles to accurately describe each regulator's enforcement approach — do not invent characteristics not described here:\n\n${sections.join('\n\n')}`;
}

export { PROFILES };

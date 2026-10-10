import { extractAmountFromText } from "./amountText.js";

const EURO = { currency: "EUR", symbols: ["€"], keywords: ["sanction pécuniaire", "amende", "sanction", "pénalité"] };

/** Sentences describing what someone proposed or asked for, not what was imposed. */
const PROPOSAL_RE = /(?<![\p{L}])(?:propos(?:é|ée|e|er|ition)|requis|requiert|requérant|demand(?:é|ée|e)|rapporteur|représentant du collège|conclu(?:t|ent|ait)? à)(?![\p{L}])/iu;

function euro(snippet: string) {
  return extractAmountFromText(snippet, EURO).amount;
}

/**
 * The amount IMPOSED by the ACPR Commission des sanctions.
 *
 * Decisions quote the sanction several times: the heading ("Blâme et sanction
 * pécuniaire de 1,3 million d'euros"), the reasoning ("justifient le prononcé
 * d'un blâme et d'une sanction pécuniaire de ..."), the operative article
 * ("DÉCIDE : Article 1er - Il est prononcé ... une sanction pécuniaire de ...")
 * and, earlier, the rapporteur's PROPOSAL ("Mme X a proposé à la Commission de
 * prononcer ... une sanction pécuniaire de 1,5 million d'euros"). Only the first
 * three count. With none of those clauses present, the generic parser runs on
 * the text with every proposal sentence removed.
 */
export function extractAcprSanctionAmount(text: string): number | null {
  const normalized = text.replace(/\s+/g, " ");
  const amount = "((?:\\d[\\d\\s.,]*\\d|\\d)\\s*(?:million|millions|milliard|milliards|mille)?\\s*(?:d['’]\\s?euros?|euros?|€))";

  const operative = new RegExp(`(?:il est prononcé|est prononcée|inflige)[^.]{0,200}?sanction pécuniaire\\s+(?:de|d['’]un montant de)\\s+${amount}`, "i");
  const reasoning = new RegExp(`(?:justifient?|justifie)\\s+le\\s+prononcé[^.]{0,200}?sanction pécuniaire\\s+(?:de|d['’]un montant de)\\s+${amount}`, "i");
  const heading = new RegExp(`(?:blâme|avertissement|interdiction[^.]{0,60}?)?\\s*(?:et\\s+)?sanction pécuniaire\\s+de\\s+${amount}[^.]{0,80}?(?:Publication|Audience)`, "i");

  for (const pattern of [operative, reasoning, heading]) {
    const match = normalized.match(pattern);
    if (match) {
      const value = euro(match[1]);
      if (value !== null) return value;
    }
  }

  const imposedOnly = normalized
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !PROPOSAL_RE.test(sentence))
    .join(" ");
  return extractAmountFromText(imposedOnly, EURO).amount;
}

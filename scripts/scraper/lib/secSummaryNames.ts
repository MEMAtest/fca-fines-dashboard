/**
 * SEC respondent names taken from the release summary (second-chance extractor).
 *
 * The headline often only describes the party ("Two Entities Charged in $130 Million Fraud
 * Scheme"), while the first sentences of the release name them ("charged two entities,
 * BG Wealth Sharing Ltd and DSJ Exchange Pty Ltd, for orchestrating ..."). A wrong name on an
 * enforcement record is worse than "Unnamed party", so a name is accepted only when:
 *   - it appears verbatim in the text, in an explicit respondent position (see CONTEXTS);
 *   - it is a legal-entity name (ends in a legal suffix) or a person name (2-4 capitalised
 *     tokens, optional middle initial / Jr. / III);
 *   - it is followed by a delimiter inside the text (a name cut off by the 500 character summary
 *     limit is never taken);
 *   - it is not an SEC / court / agency / statute phrase, and passes the same descriptor tests
 *     the headline extractor uses (confidentSecName + assessEntityName).
 * Anything else stays unnamed.
 */
import { assessEntityName } from './entityName.js';
import { PLACES, confidentSecName } from './secNames.js';

const CAP_WORD = String.raw`(?:Mc|Mac|O['’]|De|Di|Van|Von|Le|La)?[A-Z][a-z]+(?:[-'’][A-Z]?[a-z]+)*`;
const PERSON_TOKEN = String.raw`(?:${CAP_WORD}|[A-Z]\.)`;
const SUFFIX = String.raw`(?:Inc\.?|LLC|L\.L\.C\.|Ltd\.?|Limited|Corp\.?|Corporation|LP|L\.P\.|LLP|PLC|Pty Ltd\.?|Co\.|Company|LC|Holdings|Group)`;
const ENTITY_WORD = String.raw`(?:${CAP_WORD}|[A-Z]{2,}|[A-Z][A-Za-z]*[A-Z][A-Za-z]*|\d+|&)`;
const ENTITY = String.raw`(?:${ENTITY_WORD}(?: ${ENTITY_WORD}){0,5},? ${SUFFIX}(?:\s?\(\w+\))?)`;
const PERSON = String.raw`(?:${PERSON_TOKEN}(?: ${PERSON_TOKEN}){1,4}(?:,? (?:Jr\.|Sr\.|II|III|IV))?)`;
const ONE = String.raw`(?:${ENTITY}|${PERSON})`;
/** "A", "A and B", "A, B and C", "A and its principal B" */
const LIST = String.raw`${ONE}(?:(?:,| and|, and) (?:(?:its |his |her |their )?(?:(?:principal|founder|owner|president|chief executive officer|CEO|co-founder|cofounder|chairman|manager|sole officer|majority owner),? )?)${ONE}){0,5}`;

/** Past-tense verbs that make the preceding name the actor of alleged misconduct (never a victim). */
const ACTOR_VERBS =
  'misappropriated|misappropriate|solicited|traded|schemed|obtained|defrauded|operated|raised|sold|violated|misrepresented|engaged|failed|diverted|stole|orchestrated|ran|made|used|falsely|fraudulently|conducted|offered|touted|manipulated|concealed|promoted|funneled|siphoned|lied|created|issued|sent|paid|received|acted|controlled|owned|directed|devised|carried|participated|knowingly|recklessly|negligently|improperly|unlawfully|illegally|secretly|repeatedly|breached|executed|purchased|bought|submitted|filed|billed|charged|marketed|took|spent|transferred|caused|aided|abetted|helped|provided|accepted|attempted|persuaded|convinced|induced|invested|withdrew|inflated|overstated|understated|misled|omitted|disclosed|published|issued';

const CONTEXTS: RegExp[] = [
  // "The SEC alleges that X misappropriated ..." (complaint / order allegations)
  new RegExp(String.raw`\b(?:SEC|Commission)(?:’s|'s)? (?:complaint |order )?(?:alleges|alleged|found|finds|charges|charged|contends)(?: in (?:its|the) (?:complaint|order))?,? that (?:from [^,]{3,60}, |between [^,]{3,60}, |in [A-Z][a-z]+ \d{4}, |beginning [^,]{3,60}, |starting [^,]{3,60}, )?(${LIST}) (?:${ACTOR_VERBS})\b`, 'g'),
  // "has/have agreed to settle|pay ..." and "announced that X has agreed ..."
  new RegExp(String.raw`\b(?:announced that|announced today that|today that) (${LIST}) (?:has|have) (?:agreed|consented|settled|been ordered)\b`, 'g'),
  // "X agreed to pay|settle|be barred ..." at the start of a sentence
  new RegExp(String.raw`(?:^|\. )(${LIST}) (?:has |have )?(?:agreed to (?:pay|settle|a|be|cease|resolve)|consented to)\b`, 'g'),
  // "charged X with|for|in ..." (a name directly after the charging verb)
  new RegExp(String.raw`\b(?:charged|charging|charges against|charged against|sued|sues|suing|settled charges with|settled with) (${LIST})(?:,? (?:and|an?|the|its|his|her|their|both|each|of|with|for|in|over)\b|,|\.|(?= [a-z]))`, 'g'),
  // "complaint|action|order|judgment against X"
  new RegExp(String.raw`\b(?:complaint|action|lawsuit|case|proceedings?|order|judgment|penalty|suit) (?:against|names|naming) (?:defendants? |respondents? )?(${LIST})(?:,? (?:and|an?|the|its|his|her|their|both|each|of|with|for|in|over|who|that)\b|,|\.|(?= [a-z]))`, 'g'),
  // "The SEC’s complaint filed in <court>, names X and his firm, Y"
  new RegExp(String.raw`\bcomplaint(?:[^.;]|U\.S\.){0,140}?, names (${LIST})(?:,? (?:and|an?|the|its|his|her|their|both|each|of|with|for|in|over|who|that)\b|,|\.|(?= [a-z]))`, 'g'),
  // "charged two entities, X and Y, for ..." (appositive after a descriptor noun)
  new RegExp(String.raw`\b(?:charged|charges|charging|sued|names|naming|against|obtained [a-z ,-]{3,80} against)\b[^.;]{0,120}?\b(?:entities|companies|individuals|firms|executives|men|women|brothers|siblings|defendants|advisers|advisors|brokers|operators|promoters|founders|residents|persons|officers|directors|traders|affiliates|owners|managers|lawyers|attorneys|accountants|adviser|advisor|company|firm|entity|man|woman|executive|individual|founder|owner|promoter|trader|broker|director|officer|lawyer|attorney),\s+(${LIST}),\s+(?:for|with|of|in|who|both|each|and its|and his)\b`, 'g'),
  // "operated|orchestrated|perpetrated by X"
  new RegExp(String.raw`\b(?:scheme|fraud|offering|swindle|operation|manipulation) (?:operated|run|orchestrated|perpetrated|conducted|committed) by (${LIST})(?:,? (?:who|and|which|that|through|a|an|the)\b|,|\.)`, 'g'),
];

/** Words that make a candidate an agency, court, statute, victim group or generic phrase. */
const REJECT_TOKENS = new Set(
  ('sec commission court courts district department justice attorney attorneys office bureau investigation judge judges staff division enforcement ' +
    'act rule rules section regulation ponzi scheme fraud americans ' +
    'january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday ' +
    'finra nasdaq nyse cftc doj fbi irs ftc fdic occ cfpb treasury congress senate').split(' '),
);
/** Phrases that are agencies, statutes or generic market terms even though each word alone may be fine. */
const REJECT_PHRASES = /\b(?:securities and exchange|securities exchange|exchange commission|exchange act|securities act|wall street|main street|new york times|united states|u\.s\.|investment advisers act|investment company act|justice department)\b/i;

const norm = (value: string) => value.toLowerCase().replace(/[.,’']/g, '');

function acceptOne(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').replace(/\s?\([A-Za-z.&]{2,12}\)$/, '').replace(/^[,\s]+|[,\s]+$/g, '').replace(/,(?= (?:Inc|LLC|Ltd|Corp|LP|LLP|PLC|Co|LC)\b)/, '');
  if (name.length < 5 || name.length > 90) return null;
  const tokens = name.split(' ');
  if (tokens.some((token) => /-(?:based|born|area)$/i.test(token))) return null;
  if (/^(?:el|los|san|santa|las|fort|mount|saint|st\.?|new|north|south|east|west)$/i.test(tokens[0])) return null;
  if (REJECT_PHRASES.test(name) || tokens.some((token) => REJECT_TOKENS.has(norm(token)))) return null;
  if (tokens.some((token) => PLACES.has(norm(token)))) return null;
  if (!assessEntityName(name).ok) return null;
  return confidentSecName(name) === name ? name : null;
}

/**
 * Text right after the captured list that shows the capture is not a whole respondent name:
 * a location ("El Segundo, California-based Red Rock"), a name particle ("Romero Cabral da Costa Neto"),
 * a cut-off accented letter, or a group noun the charge really targets ("ConvergEx Group subsidiaries").
 */
function badTail(rest: string): boolean {
  return (
    /^[\p{L}]/u.test(rest) ||
    /^,? (?:[A-Z][\w.]*(?: [A-Z][\w.]*)?)-(?:based|born)\b/.test(rest) ||
    /^ (?:da|de|del|della|der|den|di|dos|das|do|van|von|bin|ibn|al|el|la|le|ben|ter|ten|y|e)\b/.test(rest) ||
    /^ (?:subsidiar|affiliat|executive|employee|officer|director|client|customer|investor|partner|principal|funds?\b|entities|companies|parent)/i.test(rest)
  );
}

/** Split "A and its principal B" / "A, B and C" back into candidates. */
function splitList(list: string): string[] {
  const parts = list
    .split(/(?:,? and (?:(?:its|his|her|their) )?(?:(?:principal|founder|owner|president|chief executive officer|CEO|co-founder|cofounder|chairman|manager|sole officer|majority owner),? )?|, (?:(?:its|his|her|their) )?(?:(?:principal|founder|owner|president|chief executive officer|CEO|co-founder|cofounder|chairman|manager|sole officer|majority owner),? )?)/)
    .map((part) => part.trim())
    .filter(Boolean);
  // "Jones Capital, Inc." must not be split on its comma: re-glue suffix-only fragments.
  const glued: string[] = [];
  for (const part of parts) {
    if (glued.length && new RegExp(`^(?:${SUFFIX}|Jr\\.|Sr\\.|II|III|IV)$`).test(part)) glued[glued.length - 1] += `, ${part}`;
    else glued.push(part);
  }
  return glued;
}

export function extractSecNamesFromSummary(summary: string | null | undefined): { names: string[]; sentence: string } | null {
  const text = (summary ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  // The stored summary is cut at 500 characters; never take a name that touches the cut.
  for (const context of CONTEXTS) {
    context.lastIndex = 0;
    for (const match of text.matchAll(context)) {
      const list = match[1];
      const end = (match.index ?? 0) + match[0].length;
      if (end >= text.length - 1) continue;
      // A trailing descriptor ("and his New York-based firm") ends the list; it is not a respondent name.
      const listEnd = (match.index ?? 0) + match[0].indexOf(list) + list.length;
      if (badTail(text.slice(listEnd))) continue;
      let parts = splitList(list);
      const descriptor = parts.findIndex((part) => /-(?:based|born|area)\b/i.test(part));
      if (descriptor > 0) parts = parts.slice(0, descriptor);
      const accepted = parts.map(acceptOne);
      // One unverifiable member makes the whole respondent list unreliable.
      if (accepted.some((part) => part === null)) continue;
      const names = [...new Set(accepted as string[])];
      if (names.length === 0 || names.length > 5) continue;
      const sentenceStart = text.lastIndexOf('. ', match.index ?? 0) + 1;
      const sentenceEnd = text.indexOf('. ', end);
      const sentence = text.slice(sentenceStart, sentenceEnd === -1 ? text.length : sentenceEnd + 1).trim();
      return { names, sentence };
    }
  }
  return null;
}

/** "A", "A and B", "A, B and C" */
export function joinSecNames(names: string[]): string {
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function secSummaryParty(summary: string | null | undefined): string | null {
  const found = extractSecNamesFromSummary(summary);
  return found ? joinSecNames(found.names) : null;
}

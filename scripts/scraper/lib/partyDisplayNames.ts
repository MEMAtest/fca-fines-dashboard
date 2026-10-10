/**
 * Display-name clean-up for the scrapers that write straight to eu_fines (CBI,
 * CNMV, AMF). Each takes the name the legacy extractor produced (which keeps
 * feeding the content hash) and returns the name to show, or an honest unnamed
 * label. Kept dependency-free so it can be unit-tested without a database.
 */
import { assessEntityName, cleanEntityName, unnamedParty } from './entityName.js';

export interface DisplayName {
  name: string;
  named: boolean;
}

const CBI_DATE_SUFFIX = /\s+\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2}$/i;

/**
 * Display clean-up: strips a leftover "Enforcement Action against" / "Settlement
 * Agreement with" prefix, a trailing publication date, capitalises "the Governor
 * and Company of the Bank of Ireland" and labels "a person concerned" honestly.
 */
export function finalizeCbiName(raw: string): { name: string; named: boolean } {
  let name = cleanEntityName(raw)
    .replace(/^(?:Public statement relating to\s+)?(?:Enforcement Action(?: between Central Bank of Ireland and| against)?|Settlement (?:Agreement|Notice)(?: with| between [^,]+? and)?)\s+/i, '')
    .replace(CBI_DATE_SUFFIX, '');
  if (/^(?:a|the)\s+(?:person|individual)(?:\s+concerned)?$/i.test(name)) {
    return { name: unnamedParty('CBI', 'individual').name, named: false };
  }
  name = name.replace(/^the\s/, 'The ');
  if (!assessEntityName(name).ok) return { name: unnamedParty('CBI', 'party').name, named: false };
  return { name, named: true };
}


const CNMV_HONORIFIC = /\b(?:don|doña|dña\.?|dª|d\.)\s+/gi;

/**
 * CNMV register entries read "don X, don Y y a doña Z" and sometimes the whole
 * BOE heading ("Comisión Nacional del Mercado de Valores, por la que se publican
 * las sanciones ... impuestas a ..."). Honorifics and the "y a" joiner go; a bare
 * heading with no party is unnamed.
 */
export function finalizeCnmvName(raw: string): DisplayName {
  let name = cleanEntityName(raw);
  const afterImpuestas = name.match(/\bimpuestas?\s+(?:a|al)\s+(.+)$/i);
  if (/^Comisi[oó]n Nacional del Mercado de Valores\b/i.test(name)) {
    if (!afterImpuestas?.[1]) return { name: unnamedParty('CNMV', 'party').name, named: false };
    name = afterImpuestas[1];
  }
  name = name
    .replace(CNMV_HONORIFIC, '')
    .replace(/\s+y\s+a\s+/g, ' y ')
    .replace(/^y\s+/i, '')
    .replace(/,\s*y\s+/g, ' y ');
  name = cleanEntityName(name);
  if (!assessEntityName(name).ok) return { name: unnamedParty('CNMV', 'party').name, named: false };
  return { name, named: true };
}

/**
 * AMF enforcement-committee releases: the body-text patterns sometimes capture a
 * sentence fragment ("It also"), a count ("two individuals"), the fine clause
 * ("Kerdiz Finance et Conseil, and fines ofeuros each"), a euro figure
 * ("Caceis Bank - €3") or a name cut at "A/S" ("Saxo Bank A"). AMF identity does not
 * include the firm (date + URL only), so this is display-only.
 */
export function finalizeAmfName(raw: string | null | undefined): DisplayName {
  let name = cleanEntityName(raw ?? '')
    // glued fragments from the source text ("Frédéric Marty,on Adriana", "ofon Olivier")
    .replace(/,on\s+/g, ', ')
    .replace(/\bofon\s+/g, '')
    .replace(/,?\s+and\s+(?:fines?|penalt(?:y|ies))\b.*$/i, '')
    .replace(/\s*[-–—]\s*[€$£]?\s*\d[\d.,]*\s*(?:million|m)?\s*$/i, '')
    .replace(/\s+(?:of|totalling|a total of)\s+[€$£]?\s*\d.*$/i, '')
    .replace(/(?<=\b[A-Z][a-z]+\s(?:Bank|Group|Capital|Finance|Holding))\s+[A-Z]$/, '')
    // "asset management company Eres Gestion", "British company H2O AM LLP and two of its executives"
    .replace(/^(?:(?:the|an?)\s+)?(?:[A-Za-z-]+\s+){0,3}(?:company|firm|adviser|advisor|provider|manager)\s+(?=[A-Z0-9])/, '')
    .replace(/\s+and\s+(?:its|his|her|their|two|three|four|five|six)\b.*$/i, '');
  // The source truncates long lists with an ellipsis: keep the complete leading party when
  // the cut sits in an "and ..." tail, otherwise the name itself is truncated and unusable.
  if (/…$|\.\.\.$/.test(name)) {
    const head = name.replace(/,?\s*\b(?:and|et)\b.*(?:…|\.\.\.)$/i, '').replace(/[,\s]+$/, '');
    name = head !== name && !/…|\.\.\./.test(head) ? head : '';
  }
  name = cleanEntityName(name);
  const placeholder = /^[A-Z](?:\s*,|\s+and\b|\s+et\b|$)/.test(name) || /^(?:In|If|On|At|As|By|For|With|When|Because)\s+[a-z]/.test(name);
  if (!name || placeholder || /^unknown$/i.test(name) || !assessEntityName(name).ok || /^(?:it|they|he|she|this|these)\b/i.test(name)) {
    return { name: unnamedParty('AMF', 'party').name, named: false };
  }
  return { name, named: true };
}

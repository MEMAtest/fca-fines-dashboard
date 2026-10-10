/**
 * Dictionary test for "is this token a proper noun?" used by the SEC name gate.
 *
 * A capitalised word that is also an ordinary English word ("Animal", "Feed", "Mortgage",
 * "Custody") does not by itself make a phrase a party name. The word list is committed under
 * data/ (lower-case words of 3-12 letters from the BSD web2 list, gzipped) so it does not
 * depend on the runner's OS. Scripts only; never imported by the frontend bundle.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (name: string) => readFileSync(join(DATA_DIR, name));

const COMMON = new Set(gunzipSync(read('english-common-words.txt.gz')).toString('utf8').split('\n').filter(Boolean));
const FIRST_NAMES = new Set(read('first-names.txt').toString('utf8').split('\n').filter(Boolean));

/** Modern business / finance words missing from the 1934 word list. */
const SUPPLEMENT = new Set(
  ('automaker automakers biofuel biofuels fraudster fraudsters homebuilder homebuilders paralegal paralegals semiconductor semiconductors recordkeeping ' +
    'fintech startup startups cryptocurrency cryptocurrencies blockchain crypto bitcoin online website websites internet software hardware ' +
    'cherry-picking cherrypicking custodians violators brothers perpetrator perpetrators financier financiers ' +
    'biotech biopharmaceutical pharma cannabis marijuana ecommerce telecom telecommunications fintechs ' +
    'investments investing lending lenders borrower borrowers underwriting ratings spac spacs etf etfs reit reits ' +
    'twenty-six twenty-five thirty forty fifty sixty seventy eighty ninety ' +
    'ex-banker ex-broker disclosures failures violations penalties admits admit uncovers').split(/\s+/),
);

/** Brands that are ordinary words (or contain ordinary words) but are real parties in SEC data. Exact, lower-case. */
export const BRAND_TOKENS = new Set(
  ('genesis ripple brother apollo millennium herbalife granite cassava stanley decker express wisdom wells fargo state street united standard general electric motors ' +
    'technologies morgan chase kraft blizzard theranos pimco leech cooperman cognizant sigma').split(/\s+/),
);
/** Multi-word names made only of dictionary words. Matched as whole phrases, lower-case. */
export const BRAND_PHRASES = [
  'american express', 'general electric', 'general motors', 'state street', 'united technologies', 'standard bank', 'wells fargo', 'bank of america',
  'credit suisse', 'deutsche bank', 'morgan stanley', 'merrill lynch', 'goldman sachs', 'cassava sciences', 'luckin coffee', 'granite construction',
  'silicon valley bank', 'texas capital bank', 'stanley black', 'two sigma',
];

/** All-caps 2-5 letter tokens that are NOT names. */
export const ACRONYM_DENY = new Set(['sec', 'ceo', 'cfo', 'coo', 'cio', 'cto', 'cco', 'vp', 'svp', 'evp', 'cdo', 'ipo', 'ico', 'llc', 'llp', 'lp', 'ltd', 'inc', 'plc', 'us', 'uk', 'usa', 'usd', 'the', 'and', 'doj', 'cftc', 'finra', 'ria', 'etf', 'reit', 'spac']);

const SUFFIXES: Array<[string, string]> = [
  ['ies', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'], ['d', ''], ['ing', ''], ['ing', 'e'], ['ings', ''], ['er', ''], ['er', 'e'], ['ers', ''], ['ers', 'er'],
  ['ly', ''], ['ness', ''], ['ment', ''], ['ments', ''], ['or', ''], ['or', 'e'], ['ors', ''], ['ors', 'or'], ['ist', ''], ['ists', ''], ['al', ''], ['ity', ''], ['ive', ''], ['ion', ''], ['ions', ''], ['ation', 'e'], ['ations', 'e'],
];

function inList(word: string): boolean {
  return COMMON.has(word) || SUPPLEMENT.has(word);
}

/** True when the lower-case word (or a simple inflection of it) is an ordinary English word. */
export function isCommonWord(raw: string): boolean {
  const word = raw.toLowerCase().replace(/[^a-z-]/g, '');
  if (!word) return true;
  if (word.length < 3) return true; // "of", "ex", "to"
  if (word.includes('-')) return word.split('-').every((part) => part.length < 3 || isCommonWord(part));
  if (inList(word)) return true;
  for (const [suffix, replacement] of SUFFIXES) {
    if (word.length - suffix.length < 3 || !word.endsWith(suffix)) continue;
    const stem = word.slice(0, word.length - suffix.length);
    if (inList(stem + replacement)) return true;
    // doubled consonant: "trading" -> "trad"? "stopped" -> "stopp" -> "stop"
    if (stem.length > 3 && stem[stem.length - 1] === stem[stem.length - 2] && inList(stem.slice(0, -1))) return true;
  }
  return false;
}

export const isFirstName = (raw: string) => FIRST_NAMES.has(raw.toLowerCase());

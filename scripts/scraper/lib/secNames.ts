/**
 * SEC press-release headline -> party-name hygiene.
 *
 * SEC titles are written as "SEC <verb> <party descriptor>": "SEC Wins Jury Trial Against
 * Broker", "SEC Obtains Asset Freeze Against Long Island Investment Adviser". After the
 * headline verb is stripped what is left is often a DESCRIPTION of the party, not a name.
 *
 * Rather than a growing blocklist, a candidate is accepted only when it carries at least
 * one token outside the generic vocabulary below (role/industry nouns, number words, place
 * adjectives, SEC press verbs). Legal suffixes (Inc, LLC, Group, Bank, Securities ...) and
 * joiners do not count: "Management LLC" is still a description.
 */

const words = (text: string) => new Set(text.split(/\s+/).filter(Boolean));

/** Role, industry and structure nouns that describe a party without naming it. */
const GENERIC_NOUNS = words(
  'accountant accountants accounting account accounts administrator administrators advertising advisor advisors adviser advisers advisory affiliate affiliates ' +
  'area attorney attorneys audit auditor auditors broker brokers brokerage business businesses cable celebrity celebrities commentator commentators company companies ' +
  'conglomerate consultant consultants control corporate corporation developer developers development device digital display ' +
  'employee employees engineer engineers entity entities equipment equity estate executive executives fraud fraudulent finance financial firm firms ' +
  'friend friends fund funds government hedge healthcare insider insiders insurance investment investor investors issuer issuers it ' +
  'kickback kickbacks law lawyer lawyers manager managers manipulator manipulators manufacturer manufacturers marijuana marketer marketers marketing mayor media medical ' +
  'metropolitan microcap movie municipal muni neighbor neighbors offering official officials offshore online operator operators other others ' +
  'pest petroleum pharma pharmaceutical pharmacy producer producers professional professionals promoter promoters promotion property ' +
  'real receiver related relief research reporting rmbs scheme schemes securities selling self-reporting shell shipping specialist specialists startup stock ' +
  'supervisor supervisors telecommunications trader traders trading tv uk underwriter underwriters unit violations violation website wire ' +
  'man men woman women person persons people individual individuals bond bonds listing ico crypto penny town city county private short crack ' +
  // people / roles
  'actor actress analyst analysts attorney banker bankers businessman businessmen businesswoman felon felons football player players stockbroker stockbrokers ' +
  'trustee trustees agency agencies district school college university student teacher doctor physician dentist pharmacist pastor minister priest cpa ' +
  'seniors senior-citizens clients customers client customer members member friend colleague colleagues partner-in-crime ' +
  // industries / structures
  'biotech biotechnology biopharmaceutical cannabis energy consulting dialysis binary options platform platforms provider providers solar oil gas mining mine gold ' +
  'vehicle vehicles hydrogen infrastructure surgical implant implants construction software hardware cryptocurrency cryptocurrencies bitcoin token tokens coin ' +
  'clearing rating ratings credit-rating penny-stock sciences business-unit unit units division divisions subsidiary subsidiaries ' +
  // crime / fraud / money words
  'accused alleged allegedly purported ongoing poor performance improper withdrawal withdrawals sales metric defrauding defrauded defraud lied lying stealing stole ' +
  'forging forged liable penalty penalties ponzi touting touted billion million thousand trillion misleading misled concealing concealed paying paid pay ' +
  'technology plumber electrician contractor carpenter mechanic driver nurse realtor documents settlements settlement money cash proceeds trading-case case self-described incarcerated connected galleon concealment manipulation scam scams',
);

/** SEC press-release verbs / headline words that open a fragment. */
/** Place names / place adjectives: generic on their own, but a proper token before a bank or legal word ("Silicon Valley Bank", "Texas Capital Bank"). */
export const PLACES = words(
  'new york long island hong kong miami florida massachusetts texas california chinese american silicon valley bay francisco san ' +
  'alabama alaska arizona arkansas colorado connecticut delaware georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland michigan minnesota mississippi missouri montana nebraska nevada hampshire jersey mexico carolina dakota ohio oklahoma oregon pennsylvania rhode tennessee utah vermont virginia washington wisconsin wyoming ' +
  'foreign international overseas domestic national global united-states us',
);

const PRESS_ONLY = words(
  'wins win obtains obtain freezes freeze files file announces announce charges charge charged settles settle settled sues sue bars bar suspends suspend ' +
  'orders order seeks seek secures secure halts halt shuts shut stops stop against over of at to by for from with in on and or the a an its his her their ' +
  'behind that committed jury trial emergency asset assets freeze judgment action actions case cases ' +
  'six two three four five seven eight nine ten eleven twelve several multiple various certain ' +
  'former top senior chief head lead',
);
/** Generic alone, but part of real names next to another token ("American Express", "Federal Express"). */
const SOLO_GENERIC = words('federal express financial media related united files');
/** Verbs / function words that open a press-release fragment rather than a name. */
const VERB_STARTERS = words(
  'accused adds added announces announced barred bars charged charges connected found halts halted lied obtains obtained orders ordered paying paid pays ' +
  'uncovers admits admit charge settles settled wins won who whom which that after before while from for about with by into out over against alleged allegedly purported',
);
/** Function words that mark a headline sentence wherever they appear. */
/** Press verbs that mark a headline wherever they appear after the first token. */
const VERB_ANYWHERE = words('paying pays admits uncovers charge charges charged settles settled announces obtains halts adds accused defrauded');
const HEADLINE_FUNCTION = words('from for about who whom whose that which by out over against with into after while claimed alleged');
const PRESS_WORDS = new Set([...PRESS_ONLY, ...PLACES, ...VERB_STARTERS]);

/** People/role/structure nouns that make a name a description when they END it ("Atlanta Businessman", "Citigroup Business Unit"). */
const ROLE_LAST = words(
  'analyst analysts attorney attorneys banker bankers businessman businessmen businesswoman felon felons player players stockbroker stockbrokers trustee trustees ' +
  'agency agencies district friend friends colleague colleagues unit division provider providers platform platforms manufacturer manufacturers developer developers ' +
  'operator operators plumber electrician contractor realtor broker brokers',
);
/** 2-3 letter role acronyms, never a name. */
const ROLE_ACRONYMS = words('vp svp evp cdo clo cfo ceo coo cio cto cco md it hr pr gc ria bd etf ico ipo reit spac usd');
const ING_ED_EXCEPTIONS = words('boeing sterling pershing stirling harding spalding browning reed alfred mildred wilfred oxford united limited unlimited sacred wicked');

/** Institution / legal words that, ending a name, make a preceding place word part of a real name. */
const INSTITUTION_END = words(
  'bank trust capital securities inc llc llp lp ltd corp corporation group partners advisors advisers holdings plc co savings',
);

/** Words that, once they end a leading descriptor run, mark it as a prefix to strip ("Equity Firm Ares Management LLC"). */
const KIND_NOUNS = words('firm startup company co adviser advisor fund manager broker issuer provider bank actor actress platform manufacturer maker developer operator vehicle');

/** Role nouns that make a string a description of PEOPLE when they end it ("Goldman Sachs Trader"). */
const PERSON_ROLE_LAST = words(
  'employee employees trader traders official officials insider insiders commentator producer supervisor administrator specialist lawyer lawyers accountant ' +
  'engineer manipulator promoter professional professionals executive executives officer officers friends celebrities neighbor mayor consultant',
);
const ROLE_LEAD = words('head consultant chief senior former top');

const LEGAL_TOKENS = words(
  'inc inc. incorporated llc l.l.c. llp lp ltd ltd. limited plc corp corp. corporation co co. company group holdings holding bank securities partners partnership ' +
  'management gmbh ag sa s.a. nv n.v. bv b.v. pte pty kg se spa srl sarl oyj oy ab as asa & trust capital',
);

import { ACRONYM_DENY, BRAND_PHRASES, BRAND_TOKENS, isCommonWord, isFirstName } from './secDictionary.js';

const norm = (token: string) => token.replace(/\(s\)$/i, '').replace(/^[("“'’]+|[)"”,;:'’.…]+$/g, '').toLowerCase();

function isGenericToken(raw: string): boolean {
  const t = norm(raw);
  if (!t) return true;
  if (/-based$/.test(t) || /-related$/.test(t) || /-area$/.test(t) || /-described$/.test(t) || /^self-/.test(t) || /^[$€£]/.test(t) || /^\d[\d.,]*$/.test(t)) return true;
  if (ROLE_ACRONYMS.has(t)) return true;
  if (GENERIC_NOUNS.has(t) || PRESS_WORDS.has(t)) return true;
  // hyphenated compound made only of generic parts ("Marijuana-Related")
  if (t.includes('-') && t.split('-').every((part) => !part || GENERIC_NOUNS.has(part) || PRESS_WORDS.has(part))) return true;
  return false;
}
const isLegalToken = (raw: string) => LEGAL_TOKENS.has(norm(raw)) || LEGAL_TOKENS.has(norm(raw) + '.');

/** A token that actually names something: not generic, not a legal form, contains a letter. */
const isDistinctive = (raw: string) => /\p{L}/u.test(raw) && !isGenericToken(raw) && !isLegalToken(raw);

const PHRASE_DENYLIST = /^(?:wall street|self-reporting|united|related|files|media|financial|six)$/i;

/**
 * Returns the cleaned party name, or null when the candidate only describes a party
 * (or describes its employees). Idempotent on real names.
 */
export function refineSecName(candidate: string | null | undefined): string | null {
  let value = (candidate ?? '').replace(/[“”]/g, '"').replace(/\s*\|.*$/, '').replace(/\s+/g, ' ').replace(/[…]+$/g, '').trim();
  if (!value) return null;
  if (PHRASE_DENYLIST.test(value)) return null;
  let tokens = value.split(' ');
  // Brand words that are real names only with a partner token ("American Express", "Washington Federal").
  if (tokens.length === 1 && SOLO_GENERIC.has(norm(tokens[0]))) return null;

  // "Och-Ziff Hedge Fund" -> "Och-Ziff"
  const hedge = value.match(/^(.+?)\s+hedge fund(?:\s+(?:firm|adviser|advisor|manager))?$/i);
  if (hedge && hedge[1].split(' ').some(isDistinctive)) {
    value = hedge[1];
    tokens = value.split(' ');
  }

  // Role-led descriptions: "Head of ...", "Head Traders at Nomura", "Consultant to Chinese Private Equity".
  if (ROLE_LEAD.has(norm(tokens[0])) && (tokens.length === 1 || /^(?:of|at|to|for|with)$/i.test(tokens[1]) || PERSON_ROLE_LAST.has(norm(tokens[1])) || /^traders?$/i.test(tokens[1]))) return null;
  // Employees / traders of an employer are not the employer: "Wells Fargo Employees", "Goldman Sachs Trader".
  if (tokens.length > 1 && PERSON_ROLE_LAST.has(norm(tokens[tokens.length - 1]))) return null;
  // "Head Traders at Nomura": a role noun followed by a place preposition and an employer.
  if (tokens.some((token, index) => index < tokens.length - 1 && /^(?:at|of|to)$/i.test(token) && PERSON_ROLE_LAST.has(norm(tokens[index - 1] ?? '')))) return null;

  const institutionEnd = tokens.length > 1 && INSTITUTION_END.has(norm(tokens[tokens.length - 1]));
  // A place word before an institution word is a proper token: "Silicon Valley Bank", "Texas Capital Bank".
  const distinctiveAt = (token: string, index: number) =>
    isDistinctive(token) || (institutionEnd && index < tokens.length - 1 && PLACES.has(norm(token)) && /^\p{Lu}/u.test(token));
  const firstDistinct = tokens.findIndex(distinctiveAt);
  if (firstDistinct < 0) return null;
  // A descriptor prefix ending in a kind noun is dropped when a proper name follows.
  // "Crypto Platform Example LLC" keeps its words (a 2-word platform prefix can be part of a brand); "Crypto Trading Platform Beaxy" does not.
  if (firstDistinct > 0 && KIND_NOUNS.has(norm(tokens[firstDistinct - 1])) && !(norm(tokens[firstDistinct - 1]) === 'platform' && firstDistinct < 3)) {
    tokens = tokens.slice(firstDistinct);
  }
  const name = tokens.join(' ').replace(/[,\s]+$/, '');
  if (PHRASE_DENYLIST.test(name)) return null;
  return name;
}

/** True when a stored SEC firm value is a description (or would be renamed) rather than a party name. */
export function isSecJunkName(stored: string): boolean {
  const refined = refineSecName(stored);
  return refined === null || refined.replace(/\s+/g, ' ') !== stored.replace(/\s+/g, ' ').trim();
}

/** True when a segment is a place-led institution name ("Texas Capital Bank") that must not be stripped as a descriptor. */
export function isPlaceLedInstitution(segment: string): boolean {
  const tokens = segment.split(' ').filter(Boolean);
  return tokens.length > 1 && INSTITUTION_END.has(norm(tokens[tokens.length - 1])) && PLACES.has(norm(tokens[0])) && /^\p{Lu}/u.test(tokens[0]);
}

/** True when the first token (or any token) shows the string is a headline fragment rather than a name. */
function looksLikeHeadline(tokens: string[]): boolean {
  const first = norm(tokens[0] ?? '');
  if (VERB_STARTERS.has(first)) return true;
  if (/(?:ing|ed)$/.test(first) && first.length > 4 && !ING_ED_EXCEPTIONS.has(first)) return true;
  if (tokens.some((token, index) => index > 0 && (HEADLINE_FUNCTION.has(norm(token)) || VERB_ANYWHERE.has(norm(token))))) return true;
  if (tokens.some((token) => /[$|]/.test(token))) return true;
  return false;
}

/** At least one capitalised token that is not generic, not a legal form and not a (role or unknown short) acronym. */
/** Vocabulary-only test (no dictionary), used to judge STORED values conservatively. */
function hasProperToken(tokens: string[]): boolean {
  const institutionEnd = tokens.length > 1 && INSTITUTION_END.has(norm(tokens[tokens.length - 1]));
  return tokens.some((token, index) => {
    const bare = token.replace(/^[("'“]+/, '');
    if (!/^\p{Lu}/u.test(bare) && !(/^\d/.test(bare) && /\p{L}/u.test(bare))) return false; // "3M"
    if (institutionEnd && index < tokens.length - 1 && PLACES.has(norm(token))) return true;
    if (!isDistinctive(token)) return false;
    return true;
  });
}

/** Dictionary test: at least one token is genuinely proper (not an ordinary English word). */
function hasDictionaryProperToken(tokens: string[], raw: string): boolean {
  const lower = raw.toLowerCase();
  if (BRAND_PHRASES.some((phrase) => lower.includes(phrase))) return true;
  const institutionEnd = tokens.length > 1 && INSTITUTION_END.has(norm(tokens[tokens.length - 1]));
  const properAt = (token: string, index: number): boolean => {
    const bare = token.replace(/^[("'“]+|[)"”,;:'’.]+$/g, '');
    if (!bare || !/\p{L}|\d/u.test(bare)) return false;
    if (/&/.test(bare) && /\p{L}&\p{L}/u.test(bare)) return true; // AT&T
    if (/\d/.test(bare) && /\p{L}/u.test(bare)) return true; // 3M
    if (/^[A-Z]{2,5}$/.test(bare)) return !ACRONYM_DENY.has(bare.toLowerCase()) && !isLegalToken(bare) && !ROLE_ACRONYMS.has(bare.toLowerCase());
    if (!/^\p{Lu}/u.test(bare)) return false;
    if (institutionEnd && index < tokens.length - 1 && PLACES.has(norm(token))) return true;
    if (BRAND_TOKENS.has(bare.toLowerCase())) return !GENERIC_NOUNS.has(bare.toLowerCase());
    if (bare.includes('-')) return bare.split('-').some((part) => part && properAt(part, index));
    if (isLegalToken(bare) || isGenericToken(bare)) return false;
    return !isCommonWord(bare);
  };
  if (tokens.some(properAt)) return true;
  // Person: a first name followed by capitalised surname tokens that are not descriptive vocabulary ("Ken Leech").
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (isFirstName(norm(tokens[i])) && /^\p{Lu}/u.test(tokens[i]) && /^\p{Lu}/u.test(tokens[i + 1]) && !isGenericToken(tokens[i + 1]) && !isLegalToken(tokens[i + 1]) && !isGenericToken(tokens[i])) return true;
  }
  return false;
}

/**
 * Strict acceptance for a NEW name: passes refineSecName, is not a headline fragment, does not end
 * in a role noun, and carries at least one capitalised proper token. Returns the refined name or null.
 */
export function confidentSecName(candidate: string | null | undefined): string | null {
  const raw = (candidate ?? '').replace(/\s*\|.*$/, '').replace(/\s+/g, ' ').trim();
  if (!raw || /…|\.\.\./.test(raw) || looksLikeHeadline(raw.split(' '))) return null; // a truncated headline is not a name
  // An allow-listed all-dictionary name, optionally followed only by a legal suffix ("General Motors Co."); never an employee/role descriptor.
  const brand = BRAND_PHRASES.some((phrase) => raw.toLowerCase().replace(/[.,]/g, '').replace(/\s+(?:inc|llc|llp|ltd|corp|co|company|corporation|group|plc)$/, '') === phrase);
  // Every "and"-joined party must itself be a name ("Banker and Plumber" is not).
  const parts = raw.split(/\s+and\s+(?!Trust\b|Savings\b|Loan\b)/i);
  if (parts.length > 1) return parts.every((part) => confidentSecName(part) !== null) ? refineSecName(raw) : null;
  const refined = refineSecName(raw) ?? (brand ? raw : null);
  if (!refined) return null;
  const tokens = refined.split(' ');
  if (looksLikeHeadline(tokens)) return null;
  if (tokens.length > 1 && ROLE_LAST.has(norm(tokens[tokens.length - 1]))) return null;
  if (!hasDictionaryProperToken(tokens, refined)) return null;
  return refined;
}

/**
 * True when a STORED value is, by the strict rule, a descriptor or headline rather than a party
 * name (so "Unnamed party (SEC)" is honest). Short acronyms (except role acronyms like VP, CDO) and unfamiliar brands are NOT junk.
 */
export function isSecDescriptorOrHeadline(stored: string): boolean {
  const raw = stored.replace(/\s+/g, ' ').trim();
  if (!raw) return true;
  const tokens = raw.split(' ');
  if (looksLikeHeadline(tokens)) return true;
  const refined = refineSecName(raw);
  if (!refined) return true;
  const rt = refined.split(' ');
  if (rt.length > 1 && ROLE_LAST.has(norm(rt[rt.length - 1]))) return true;
  if (hasProperToken(rt)) return false;
  return !rt.some((token) => (/^\p{Lu}/u.test(token) || (/^\d/.test(token) && /\p{L}/u.test(token))) && isDistinctive(token));
}


// ---------------------------------------------------------------------------------------------
// Stored-name polishing: descriptor prefixes, headline tails and appositives around a real name.
// Conservative by construction: a change is returned only when the result is itself a confident
// name; otherwise the stored value is left alone ("unchanged is better than wrong").
// ---------------------------------------------------------------------------------------------

/** Words that may appear in a descriptor run in front of a proper name ("Dutch Medical Supplier Philips"). */
const PREFIX_WORDS = words(
  'dutch swiss swedish british french italian spanish german japanese korean chinese indian russian canadian american brazilian australian israeli norwegian danish irish ' +
  'utility tech fintech supplier services service alternative petrochemical transportation renewable electric broker-dealer broker-dealers companies advisory',
);
/** The noun that ends such a run. */
const PREFIX_END = words(
  'firm firms company companies co adviser advisor advisers advisors fund manager broker broker-dealer broker-dealers provider supplier startup platform maker developer operator issuer',
);
/** Vocabulary that describes without naming, beyond the shared generic nouns. */
const EXTRA_GENERIC = words(
  'robo robo-adviser robo-advisers robo-advisor dealer dealers broker-dealer broker-dealers venture capital congressman congressmen statistician principal principals ' +
  'renewable utility electric fintech tech supplier suppliers services service alternative dutch swiss',
);
/** Nouns for people / roles: a name that ENDS with one, or a token that IS one, is not a company name. */
const PERSONISH = words(
  'man woman men women resident residents citizen citizens person persons individual individuals couple siblings sibling father mother son daughter husband wife ' +
  'brother brothers sister cousins executive executives official officials officer officers director directors member members employee employees owner owners co-owner co-owners ' +
  'founder founders co-founder co-founders partner chairman president ceo cfo coo cio cto cco principal principals representative representatives statistician congressman congressmen ' +
  'lawyer lawyers attorney attorneys accountant accountants analyst analysts trader traders promoter promoters staffer creator creators perpetrator perpetrators orchestrator tipper operator operators',
);
/** Titles that, directly before a personal name, mean the party is the person ("Hex Founder Richard Heart"). */
const TITLE_BEFORE_NAME = /^(?:(?:co-)?(?:ceo|cfo|coo|cio|cto|cco|chairman|chairwoman|president|founder|owner))$/i;
/** Verb / headline tails glued onto the end of a name. Cut only when what remains is a confident name. */
const VERB_TAIL = /\s+(?:(?:Agrees?|Agreed)\s+to|Lacked|Following|Barred\b|Behind|Conducted|Engaged|Involved|Defrauding|Resulting|Targeting|Using|Returning|Attempting|Ensnaring|Include|Aim\b|Sold|as Source|a Second Time)\b[\s\S]*$/;
/** Pure headline noise, cut unconditionally. */
const NOISE_TAIL = /\s+(?:in\s+Connection\b[\s\S]*|a\s+Second\s+Time)$/i;
/** ", Former CEO", ", Founder", ", Underwriter, and Others" role tails. */
const ROLE_TAIL = /,\s+(?:(?:its|his|their)\s+)?(?:(?:Former|Current)\s+)?(?:CEOs?|CFOs?|COOs?|CIOs?|Chairman|Founders?|Co-Founders?|Presidents?|Owners?|Principals?|Officers?|Directors?|Executives?|Board Members?|Others?|Underwriters?|Sponsors?)\b[\s\S]*$/;
/** "... and its Executive Team", "... and Owner", "... and Two Others": co-parties described rather than named. */
const AND_TAIL = /\s+and\s+(?:(?:its|his|her|their)\s+[\s\S]*|(?:(?:the|several|two|three|four|five|six|seven|eight|nine|ten|\d+|former|affiliated|other|additional)\s+)*(?:owners?|founders?|principals?|others?|ceos?|cfos?|officials?|individuals?|executives?|partners?|officers?|directors?|employees?|representatives?|entities|affiliates?|ceo and cfo))$/i;
/** Kind words that end the name proper inside a long first clause ("Arete Wealth Broker-Dealer and Advisory Firms, ..."). */
const CLAUSE_CUT = new Set(['broker-dealer', 'broker-dealers', 'advisory', 'adviser', 'advisers', 'advisor', 'advisors', 'firm', 'firms']);

const stripTrailing = (v: string) => v.replace(/[,;:\s]+$/g, '').replace(/…+$/g, '').trim();
const firstLetter = (v: string) => /^[\p{L}\d]/u.test(v);
const andParts = (v: string) => v.split(/\s+and\s+(?!Trust\b|Savings\b|Loan\b)/i);
const capWord = (t: string) => /^\p{Lu}[\p{L}'’.&-]*$/u.test(t) || /^[A-Z0-9&.-]+$/.test(t);
const hyphenParts = (t: string) => norm(t).split('-');
const personish = (t: string) => PERSONISH.has(norm(t)) || hyphenParts(t).some((p) => PERSONISH.has(p));
const vocabToken = (t: string) =>
  isGenericToken(t) || EXTRA_GENERIC.has(norm(t)) || PREFIX_WORDS.has(norm(t)) || PLACES.has(norm(t)) || isLegalToken(t) || personish(t) || /^(?:and|of|the|its|his|her|their|a|an)$/i.test(norm(t));

/** Common rejections for any polished candidate: headlines, locations/roles used as descriptors, role endings. */
function structurallyBad(tokens: string[]): boolean {
  if (tokens.some((t) => /-(?:based|area)$/i.test(norm(t)) || /[:]/.test(t))) return true;
  if (/^SEC\b/.test(tokens[0]) || personish(tokens[0])) return true;
  if (looksLikeHeadline(tokens)) return true;
  const last = norm(tokens[tokens.length - 1]);
  if (tokens.length > 1 && (ROLE_LAST.has(last) || PERSONISH.has(last))) return true;
  return false;
}

/** One "and"-joined party passes when it is a name by the dictionary (or ends in a legal form) and is not role/place vocabulary only. */
function partIsName(part: string, allowLegalForm: boolean): boolean {
  if (!part || !firstLetter(part)) return false;
  const tokens = part.split(' ');
  if (structurallyBad(tokens)) return false;
  if (tokens.every(vocabToken)) return false;
  if (PRESS_WORDS.has(norm(tokens[0])) && !isPlaceLedInstitution(part)) return false;
  if (hasDictionaryProperToken(tokens, part)) return true;
  return allowLegalForm && tokens.length > 1 && isLegalToken(tokens[tokens.length - 1]) && tokens.slice(0, -1).every((t) => /^[\p{Lu}\d]/u.test(t.replace(/^["“(]+/, '')) && !vocabToken(t));
}

/** A person after a title: "CEO Do Kwon" is acceptable as a co-party. */
const titledPerson = (part: string) => {
  const tokens = part.split(' ');
  return tokens.length >= 3 && TITLE_BEFORE_NAME.test(tokens[0]) && tokens.slice(1).every((t) => capWord(t) && !vocabToken(t));
};

function acceptablePolished(candidate: string, allowLegalForm: boolean): boolean {
  return andParts(candidate).every((part) => partIsName(part, allowLegalForm) || titledPerson(part));
}

/** Structural acceptance for the name that follows a descriptor run: capitalised, no role/place/press vocabulary. */
function structuralName(rest: string): boolean {
  if (!firstLetter(rest) || /[,"“:]/.test(rest)) return false;
  return andParts(rest).every((part) => {
    const tokens = part.split(' ');
    if (!tokens.every((t) => capWord(t) || /^(?:of|&)$/i.test(t))) return false;
    if (structurallyBad(tokens)) return false;
    const head = tokens[0];
    return !PRESS_WORDS.has(norm(head)) && !SEC_NUMERAL_START.test(head) && !vocabToken(head) && !isGenericToken(head);
  });
}
const SEC_NUMERAL_START = /^(?:\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i;

/** A leading comma segment that is a description rather than a name ("Two Credit Rating Agencies", "“Smart” Window Manufacturer"). */
function isDescriptiveSegment(segment: string): boolean {
  const tokens = segment.split(' ');
  const last = norm(tokens[tokens.length - 1]);
  return isSecDescriptorOrHeadline(segment) || ROLE_LAST.has(last) || /^(?:agencies|firms|companies|entities)$/.test(last);
}

/**
 * Returns a cleaner version of a stored SEC party name, or null when the stored value should stay
 * as it is (already clean, or no confident improvement exists).
 */
export function polishSecName(stored: string | null | undefined): string | null {
  const original = (stored ?? '').replace(/\s+/g, ' ').trim();
  if (!original || /^unnamed party/i.test(original)) return null;
  // A stored value that opens with a headline verb is a fragment, not a name with a prefix: leave it to the derive path.
  const lead = norm(original.split(' ')[0]);
  if (VERB_STARTERS.has(lead) || (/(?:ing|ed)$/.test(lead) && lead.length > 4 && !ING_ED_EXCEPTIONS.has(lead))) return null;
  let value = stripTrailing(original);
  let polluted = false; // a headline tail or descriptor prefix was removed, so trailing co-party descriptions can go too

  // 1. Headline tails.
  const noise = stripTrailing(value.replace(NOISE_TAIL, ''));
  const noiseOnly = noise && noise !== value ? noise : null;
  if (noiseOnly) { value = noise; polluted = true; }
  const verbCut = stripTrailing(value.replace(VERB_TAIL, ''));
  if (verbCut !== value) {
    const trimmed = stripTrailing(verbCut.replace(AND_TAIL, ''));
    if (acceptablePolished(verbCut, true)) { value = verbCut; polluted = true; }
    else if (trimmed && trimmed !== verbCut && acceptablePolished(trimmed, true)) { value = trimmed; polluted = true; }
  }
  const roleCut = stripTrailing(value.replace(ROLE_TAIL, ''));
  if (roleCut !== value && acceptablePolished(roleCut, true)) { value = roleCut; polluted = true; }

  // 2. A descriptive first segment followed by the real name, or a long first clause.
  const segments = value.split(/,\s+/).map(stripTrailing).filter(Boolean);
  const clauseTokens = (segments[0] ?? '').split(' ');
  const clauseCut = clauseTokens.findIndex((token, index) => index >= 1 && CLAUSE_CUT.has(norm(token)));
  if (segments.length > 1 && clauseCut >= 1 && /^(?:their|its|his|and|several|former)\b/i.test(segments[1])) {
    // "Arete Wealth Broker-Dealer and Advisory Firms, Their Chief Compliance Officer, ..." -> "Arete Wealth".
    const head = clauseTokens.slice(0, clauseCut).join(' ');
    if (structuralName(head)) { value = head; polluted = true; }
  } else if (segments.length === 2 && isDescriptiveSegment(segments[0]) && acceptablePolished(segments[1], true)) {
    value = segments[1];
    polluted = true;
  }

  // 3. Descriptor prefix before a name: "Dutch Medical Supplier Philips" -> "Philips".
  {
    const tokens = value.split(' ');
    let run = 0;
    while (run < tokens.length && (isGenericToken(tokens[run]) || PLACES.has(norm(tokens[run])) || PREFIX_WORDS.has(norm(tokens[run])) || PREFIX_END.has(norm(tokens[run])) || EXTRA_GENERIC.has(norm(tokens[run])))) run += 1;
    let end = -1;
    for (let i = 0; i < run; i += 1) if (PREFIX_END.has(norm(tokens[i]))) end = i;
    // A run about a person or an employee ("Former CEO of Tech Startup SKAEL") describes a person, not the company after it.
    const aboutPerson = tokens.slice(0, run).some((t) => personish(t) || /^(?:former|ex)$/i.test(t) || /^(?:of|at|to|for)$/i.test(t));
    if (end >= 0 && end < tokens.length - 1 && !aboutPerson) {
      const rest = tokens.slice(end + 1).join(' ');
      const trimmed = stripTrailing(rest.replace(AND_TAIL, ''));
      if (trimmed && structuralName(trimmed)) { value = trimmed; polluted = true; }
    }
  }

  // 4. Title directly before a personal name: "Former Alfi CEO Paul Pereira" -> "Paul Pereira".
  if (value === stripTrailing(original) || polluted === false) {
    const tokens = value.split(' ');
    const titleAt = tokens.findIndex((token, index) => index > 0 && TITLE_BEFORE_NAME.test(token));
    if (titleAt > 0) {
      const before = tokens.slice(0, titleAt);
      const person = tokens.slice(titleAt + 1);
      const personOk =
        person.length >= 2 && person.length <= 4 && person.every((t) => /^\p{Lu}[\p{L}'’-]*\.?$/u.test(t)) &&
        !person.some((t) => vocabToken(t)) && (isFirstName(norm(person[0])) || person.every((t) => !isCommonWord(t)));
      const beforeOk = before.every((t) => /^\p{Lu}/u.test(t) || /^[A-Z]{2,}$/.test(t)) && !before.some((t) => /^(?:and|its|his|their|of)$/i.test(t) || /,$/.test(t));
      if (personOk && beforeOk) value = person.join(' ');
    }
  }

  if (polluted) {
    const trimmed = stripTrailing(value.replace(AND_TAIL, ''));
    if (trimmed && trimmed !== value && acceptablePolished(trimmed, true)) value = trimmed;
  }

  value = stripTrailing(value);
  if (value === original) return null;
  if (value === noiseOnly) return value; // "in Connection" is pure headline noise, safe to drop from any value
  // The result must itself be a name (structural for prefix strips, dictionary otherwise).
  if (!(acceptablePolished(value, true) || structuralName(value) || andParts(value).every((p) => structuralName(p) || titledPerson(p)))) return null;
  return value;
}

/**
 * Party name read from a press-release summary ("The SEC today charged X ..." / "complaint against X"), or null.
 * Used only for stored names that merely describe the party.
 */
export function secNameFromSummary(summary: string | null | undefined): string | null {
  const text = (summary ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const match = text.match(/\b(?:charged|charges against|charging|complaint against|settled (?:charges )?with|against)\s+((?:[A-Z][\w&.'’-]*)(?:\s+(?:[A-Z][\w&.'’-]*|&)){0,5}?)(?=\s*(?:,|\(|\bwith\b|\bfor\b|\bin\b|\bof\b|\bover\b|\balleging\b|\band\s+(?:its|his|her)\b|\.|$))/);
  if (!match) return null;
  const candidate = match[1].replace(/[,.\s]+$/, '');
  return confidentSecName(candidate) === candidate && !isSecDescriptorOnly(candidate) ? candidate : null;
}

/** True when a stored name only describes its party (every "and"-joined part is role/industry/place vocabulary or a person role). */
export function isSecDescriptorOnly(stored: string): boolean {
  const raw = stored.replace(/\s+/g, ' ').trim();
  if (!raw || /^unnamed party/i.test(raw)) return false;
  return andParts(raw.replace(/,\s+/g, ' and ')).every((part) => {
    const tokens = part.split(' ');
    if (tokens.length > 1 && (personish(tokens[tokens.length - 1]) || ROLE_LAST.has(norm(tokens[tokens.length - 1])))) return true;
    return tokens.every((t, i) => vocabToken(t) || (i === 0 && tokens.length > 1 && SEC_NUMERAL_START.test(t)) || /^\d+$/.test(t));
  });
}

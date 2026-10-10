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
  'charge settles settled wins won who whom which that after before while from for about with by into out over against alleged allegedly purported',
);
/** Function words that mark a headline sentence wherever they appear. */
/** Press verbs that mark a headline wherever they appear after the first token. */
const VERB_ANYWHERE = words('charge charges charged settles settled announces obtains halts adds accused defrauded');
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
function hasProperToken(tokens: string[]): boolean {
  const institutionEnd = tokens.length > 1 && INSTITUTION_END.has(norm(tokens[tokens.length - 1]));
  return tokens.some((token, index) => {
    const bare = token.replace(/^[("'“]+/, '');
    if (!/^\p{Lu}/u.test(bare)) return false;
    if (institutionEnd && index < tokens.length - 1 && PLACES.has(norm(token))) return true;
    if (!isDistinctive(token)) return false;
    return true;
  });
}

/**
 * Strict acceptance for a NEW name: passes refineSecName, is not a headline fragment, does not end
 * in a role noun, and carries at least one capitalised proper token. Returns the refined name or null.
 */
export function confidentSecName(candidate: string | null | undefined): string | null {
  const raw = (candidate ?? '').replace(/\s*\|.*$/, '').replace(/\s+/g, ' ').trim();
  if (!raw || looksLikeHeadline(raw.split(' '))) return null;
  // Every "and"-joined party must itself be a name ("Banker and Plumber" is not).
  const parts = raw.split(/\s+and\s+(?!Trust\b|Savings\b|Loan\b)/i);
  if (parts.length > 1) return parts.every((part) => confidentSecName(part) !== null) ? refineSecName(raw) : null;
  const refined = refineSecName(raw);
  if (!refined) return null;
  const tokens = refined.split(' ');
  if (looksLikeHeadline(tokens)) return null;
  if (tokens.length > 1 && ROLE_LAST.has(norm(tokens[tokens.length - 1]))) return null;
  if (!hasProperToken(tokens)) return null;
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
  return !rt.some((token) => /^\p{Lu}/u.test(token) && isDistinctive(token));
}

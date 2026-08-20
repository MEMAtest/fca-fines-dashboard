import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import { resolveCountry } from "../../src/data/countries.js";
import { pageCountries } from "../../src/data/countryView.js";
import { computeCountryRiskV3 } from "../../src/data/countryRiskV3.js";
import { REGULATOR_COVERAGE } from "../../src/data/regulatorCoverage.js";

type Role =
  | "central_banking"
  | "prudential_supervision"
  | "securities"
  | "insurance"
  | "pensions"
  | "financial_intelligence";

type DirectorySource =
  | "BIS"
  | "IOSCO"
  | "IAIS"
  | "IOPS"
  | "EGMONT"
  | "OFFICIAL_NATIONAL"
  | "FATF_ASSESSMENT";

interface AuthorityEvidence {
  iso2: string;
  country: string;
  authority: string;
  website: string | null;
  roles: Role[];
  sources: DirectorySource[];
  sourceUrls: string[];
  notes: string[];
}

interface RawAuthority {
  countryLabel: string;
  authority: string;
  website: string | null;
  role: Role;
  source: DirectorySource;
  sourceUrl: string;
  iso2?: string;
  note?: string;
}

interface LiveObservation {
  regulator: string;
  ok: boolean;
  count: number | null;
  latestDate: string | null;
  latestIngestionAt: string | null;
  latestSourceCheckAt: string | null;
  disclosedAmountCount: number | null;
  amountDisclosureRate: number | null;
  activeYears: number | null;
  actionsPerActiveYear: number | null;
  activeMonthsLast24: number | null;
  activitySignal: "frequent" | "active" | "periodic" | "low-frequency" | "no-recent-signal" | "insufficient-data";
  error?: string;
}

const OUTPUT_DIR = path.resolve("docs/research/regulatory-signal");
const GENERATED_AT = new Date().toISOString();

const SOURCE_URLS = {
  BIS: "https://www.bis.org/api/institutions.json",
  IOSCO: "https://www.iosco.org/v2/about/?subsection=membership&memid=1",
  IAIS: "https://www.iais.org/wp-json/members/list",
  IOPS: "https://www.iopsweb.org/en/membership/iops-members-and-observers.html",
  EGMONT: "https://egmontgroup.org/members-by-region/",
} as const;

const COUNTRY_OVERRIDES: Record<string, string> = {
  "africa - cima": "",
  "abu dhabi": "AE",
  "alberta": "CA",
  "alberta canada": "CA",
  "australia apra": "AU",
  "australia asic": "AU",
  "bahamas the": "BS",
  "bahrain kingdom of": "BH",
  "bailiwick of guernsey": "GG",
  "belgium fsma": "BE",
  "belgium nbb": "BE",
  "bosnia and herzegovina bih ia": "BA",
  "bosnia and herzegovina isa of fb and h": "BA",
  "bosnia and herzegovina rs isa": "BA",
  "bosnia and herzegovina federation of": "BA",
  "brazil susep": "BR",
  "british columbia": "CA",
  "british columbia canada": "CA",
  "canada ontario": "CA",
  "canada quebec": "CA",
  "cayman islands bwi": "KY",
  "china hong kong": "HK",
  "china macao": "MO",
  "chinese taipei": "TW",
  "china peoples republic of": "CN",
  "congo democratic republic of the": "CD",
  "cote divoire ivory coast": "CI",
  "croatia republic of": "HR",
  "curacao": "CW",
  "curacao and sint maarten": "CW",
  "difc dubai": "AE",
  "france caledonie": "NC",
  "gambia the": "GM",
  "gift city": "IN",
  "holy see vatican city": "VA",
  "hong kong china": "HK",
  "india ifsca": "IN",
  "india irdai": "IN",
  "kazakhstan afsa": "KZ",
  "kazakhstan ardfm": "KZ",
  "kazakhstan republic of": "KZ",
  "kosovo": "XK",
  "kingdom of eswatini": "SZ",
  "korea": "KR",
  "korea republic of": "KR",
  "lao pdr": "LA",
  "latvia republic of": "LV",
  "malaysia labuan": "MY",
  "maldives republic of": "MV",
  "mauritius republic of": "MU",
  "moldova republic of": "MD",
  "monaco principality of": "MC",
  "macau": "MO",
  "macao china": "MO",
  "netherlands afm": "NL",
  "netherlands dnb": "NL",
  "new zealand fma": "NZ",
  "new zealand rbnz": "NZ",
  "north macedonia republic of": "MK",
  "oman sultanate of": "OM",
  "ontario canada": "CA",
  "ontario": "CA",
  "palestine": "PS",
  "papua new guinea bank png": "PG",
  "papua new guinea oic": "PG",
  "qatar qcb": "QA",
  "qatar qfcra": "QA",
  "quebec": "CA",
  "quebec canada": "CA",
  "republic of north macedonia": "MK",
  "republic of srpska part of bosnia and herzegovina": "BA",
  "russia suspended": "RU",
  "russian federation": "RU",
  "samoa cbs": "WS",
  "samoa sifa": "WS",
  "saint vincent and the grenadines": "VC",
  "serbia republic of": "RS",
  "south africa fsca": "ZA",
  "south africa pa": "ZA",
  "south korea": "KR",
  "srpska republic of": "BA",
  "sultanate of oman": "OM",
  "taiwan": "TW",
  "the bahamas": "BS",
  "the gambia": "GM",
  "the netherlands": "NL",
  "timor leste east timor": "TL",
  "trinidad and tobago": "TT",
  "turks and caicos": "TC",
  "turks and caicos bwi": "TC",
  "turkiye": "TR",
  "united arab emirates adgm frsa": "AE",
  "united arab emirates cbuae": "AE",
  "united arab emirates dfsa": "AE",
  "united kingdom fca": "GB",
  "united kingdom pra": "GB",
  "usa fio": "US",
  "usa frb": "US",
  "usa naic": "US",
  "united states of america": "US",
  "virgin islands british": "VG",
};

function normalise(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveIso2(label: string, explicit?: string): string | null {
  const override = COUNTRY_OVERRIDES[normalise(label)];
  if (override !== undefined) return override || null;
  if (explicit && /^[A-Z]{2}$/.test(explicit) && explicit !== "ZZ" && resolveCountry(explicit)) return explicit;
  const direct = resolveCountry(label)?.iso2;
  if (direct) return direct;
  const withoutQualifier = label.replace(/\s+-\s+.+$/, "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const qualifiedOverride = COUNTRY_OVERRIDES[normalise(withoutQualifier)];
  if (qualifiedOverride !== undefined) return qualifiedOverride || null;
  return resolveCountry(withoutQualifier)?.iso2 ?? null;
}

/**
 * Gap-closing evidence for jurisdictions absent from the global directories.
 * Each row was checked against a national authority site or, where no credible
 * public authority site exists, an official FATF/FSRB assessment. These rows
 * establish mandate evidence only; they do not imply enforcement publication.
 */
const MANUAL_OFFICIAL_AUTHORITIES: RawAuthority[] = [
  {
    countryLabel: "Comoros",
    iso2: "KM",
    authority: "Banque Centrale des Comores",
    website: "https://banque-comores.km/",
    role: "central_banking",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://banque-comores.km/page/show/les-missions",
    note: "Official mandate page also evidences prudential supervision; represented in the paired row.",
  },
  {
    countryLabel: "Comoros",
    iso2: "KM",
    authority: "Banque Centrale des Comores",
    website: "https://banque-comores.km/",
    role: "prudential_supervision",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://banque-comores.km/page/show/les-missions",
  },
  {
    countryLabel: "Djibouti",
    iso2: "DJ",
    authority: "Banque Centrale de Djibouti",
    website: "https://banque-centrale.dj/",
    role: "central_banking",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://banque-centrale.dj/",
  },
  {
    countryLabel: "Djibouti",
    iso2: "DJ",
    authority: "Banque Centrale de Djibouti",
    website: "https://banque-centrale.dj/",
    role: "prudential_supervision",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://banque-centrale.dj/",
  },
  {
    countryLabel: "Eritrea",
    iso2: "ER",
    authority: "Bank of Eritrea",
    website: null,
    role: "prudential_supervision",
    source: "FATF_ASSESSMENT",
    sourceUrl: "https://www.fatf-gafi.org/content/dam/fatf-gafi/fsrb-mer/Eritrea-MER-2025.pdf.coredownload.inline.pdf",
    note: "Official 2025 ESAAMLG assessment identifies the Bank of Eritrea as supervisor; no credible public authority site was found.",
  },
  {
    countryLabel: "Mauritania",
    iso2: "MR",
    authority: "Banque Centrale de Mauritanie",
    website: "https://www.bcm.mr/portail",
    role: "central_banking",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://www.bcm.mr/portail",
  },
  {
    countryLabel: "Mauritania",
    iso2: "MR",
    authority: "Banque Centrale de Mauritanie",
    website: "https://www.bcm.mr/portail",
    role: "prudential_supervision",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://www.bcm.mr/portail",
  },
  {
    countryLabel: "Mauritania",
    iso2: "MR",
    authority: "Autorité de Régulation du Marché Financier",
    website: "https://www.armf.mr/",
    role: "securities",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://www.armf.mr/",
    note: "New authority created by the December 2024 financial-market law; official site remains challenge-protected/under development.",
  },
  {
    countryLabel: "São Tomé and Príncipe",
    iso2: "ST",
    authority: "Banco Central de São Tomé e Príncipe",
    website: "https://bcstp.st/",
    role: "central_banking",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://bcstp.st/",
  },
  {
    countryLabel: "São Tomé and Príncipe",
    iso2: "ST",
    authority: "Banco Central de São Tomé e Príncipe",
    website: "https://bcstp.st/",
    role: "prudential_supervision",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://bcstp.st/",
  },
  {
    countryLabel: "Somalia",
    iso2: "SO",
    authority: "Central Bank of Somalia",
    website: "https://centralbank.gov.so/",
    role: "central_banking",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://centralbank.gov.so/",
  },
  {
    countryLabel: "Somalia",
    iso2: "SO",
    authority: "Central Bank of Somalia",
    website: "https://centralbank.gov.so/",
    role: "prudential_supervision",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://centralbank.gov.so/",
  },
  {
    countryLabel: "South Sudan",
    iso2: "SS",
    authority: "Bank of South Sudan",
    website: "https://boss.gov.ss/",
    role: "central_banking",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://boss.gov.ss/who-we-are/",
  },
  {
    countryLabel: "South Sudan",
    iso2: "SS",
    authority: "Bank of South Sudan",
    website: "https://boss.gov.ss/",
    role: "prudential_supervision",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://boss.gov.ss/supervision-regulation/",
  },
  {
    countryLabel: "Palau",
    iso2: "PW",
    authority: "Financial Institutions Commission",
    website: "https://ropfic.org/",
    role: "prudential_supervision",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://ropfic.org/",
    note: "Palau uses the US dollar and has no domestic central bank; this is a structural absence, not missing evidence.",
  },
  {
    countryLabel: "Palau",
    iso2: "PW",
    authority: "Financial Intelligence Unit",
    website: "https://palaufiu.org/",
    role: "financial_intelligence",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://palaufiu.org/",
  },
  {
    countryLabel: "American Samoa",
    iso2: "AS",
    authority: "Office of the Insurance Commissioner",
    website: "https://www.americansamoa.gov/insurance",
    role: "insurance",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://www.americansamoa.gov/insurance",
    note: "Territorial authority; wider US federal context is recorded separately through the parent jurisdiction.",
  },
  {
    countryLabel: "Guam",
    iso2: "GU",
    authority: "Banking and Insurance Board",
    website: "https://www.guamtax.com/bib/",
    role: "prudential_supervision",
    source: "OFFICIAL_NATIONAL",
    sourceUrl: "https://www.guamtax.com/bib/",
    note: "Territorial authority within the Department of Revenue and Taxation; wider US federal context remains relevant.",
  },
];

function cleanWebsite(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function host(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "RegActions regulatory-signal research/1.0" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

async function loadBis(): Promise<RawAuthority[]> {
  const payload = await fetchJson<Record<string, {
    name: string;
    href: string;
    institution_type: number | null;
    country: { full_name: string; iso2: string };
  }>>(SOURCE_URLS.BIS);
  const rows = Object.values(payload);
  const out: RawAuthority[] = [];
  for (const row of rows) {
    const type = row.institution_type ?? 99;
    if (type >= 2 && type <= 8) {
      out.push({
        countryLabel: row.country.full_name,
        iso2: row.country.iso2,
        authority: row.name,
        website: cleanWebsite(row.href),
        role: "central_banking",
        source: "BIS",
        sourceUrl: "https://www.bis.org/cbanks.htm",
      });
    }
    if (type >= 6 && type <= 10) {
      out.push({
        countryLabel: row.country.full_name,
        iso2: row.country.iso2,
        authority: row.name,
        website: cleanWebsite(row.href),
        role: "prudential_supervision",
        source: "BIS",
        sourceUrl: "https://www.bis.org/regauth.htm",
      });
    }
  }
  return out;
}

async function loadIosco(): Promise<RawAuthority[]> {
  const out: RawAuthority[] = [];
  for (let page = 1; page <= 12; page += 1) {
    const sourceUrl = `${SOURCE_URLS.IOSCO}&page=${page}`;
    const html = await fetchText(sourceUrl);
    const $ = load(html);
    const items = $("li.list-group-item").toArray();
    let pageCount = 0;
    for (const item of items) {
      const countryLabel = $(item).find("h2").first().text().trim();
      const authority = $(item).find("h3").first().text().trim();
      if (!countryLabel || !authority) continue;
      const website = $(item)
        .find('a[target="_blank"]')
        .toArray()
        .map((entry) => cleanWebsite($(entry).attr("href")))
        .find(Boolean) ?? null;
      out.push({ countryLabel, authority, website, role: "securities", source: "IOSCO", sourceUrl });
      pageCount += 1;
    }
    if (pageCount === 0) break;
  }
  return out;
}

async function loadIais(): Promise<RawAuthority[]> {
  const rows = await fetchJson<Array<{
    name: string;
    organisation_type: string;
    jurisdiction: string;
    website: string;
  }>>(SOURCE_URLS.IAIS);
  return rows
    .filter((row) => row.organisation_type.toLowerCase() === "member")
    .map((row) => ({
      countryLabel: row.jurisdiction,
      authority: row.name,
      website: cleanWebsite(row.website),
      role: "insurance" as const,
      source: "IAIS" as const,
      sourceUrl: "https://www.iais.org/about-the-iais/iais-members/",
    }));
}

/**
 * Current governing-member rows transcribed from the official IOPS directory.
 * Direct fetches and headless Chromium both receive a managed challenge, so the
 * official page remains the evidence URL and this snapshot is deliberately
 * marked as challenge-protected rather than silently treated as absent.
 */
const IOPS_MEMBERS = [
  "Albania|Albanian Financial Supervisory Authority|https://amf.gov.al",
  "Angola|Angolan Agency for Insurance Regulation and Supervision|https://www.arseg.ao",
  "Armenia|Central Bank of Armenia|https://www.cba.am",
  "Australia|Australian Prudential Regulation Authority|https://www.apra.gov.au",
  "Austria|Austria Financial Market Authority|https://www.fma.gv.at",
  "The Bahamas|Insurance Commission of the Bahamas|https://www.icb.gov.bs",
  "Bailiwick of Guernsey|Financial Services Commission|https://www.gfsc.gg",
  "Belgium|Financial Services and Markets Authority|https://www.fsma.be",
  "Botswana|Non-Bank Financial Institutions Regulatory Authority|https://www.nbfira.org.bw",
  "Brazil|Brazilian Pension Funds Authority|https://www.gov.br/previc",
  "Bulgaria|Financial Supervision Commission|https://www.fsc.bg",
  "Cambodia|Ministry of Labour and Vocational Training|https://www.mlvt.gov.kh",
  "Canada|Canadian Association of Pension Supervisory Authorities|https://www.capsa-acor.org",
  "Chile|Superintendence of Pensions|https://www.spensiones.cl",
  "China|National Financial Regulatory Administration|https://www.nfra.gov.cn",
  "Colombia|Financial Superintendence of Colombia|https://www.superfinanciera.gov.co",
  "Costa Rica|Pensions Superintendence of Costa Rica|https://www.supen.fi.cr",
  "Croatia|Croatian Financial Services Supervisory Agency|https://www.hanfa.hr",
  "Czechia|Czech National Bank|https://www.cnb.cz",
  "Dominican Republic|Pensions Superintendency|https://www.sipen.gob.do",
  "Egypt|Financial Regulatory Authority|https://fra.gov.eg",
  "El Salvador|Superintendency of Financial System|https://ssf.gob.sv",
  "Eswatini|Financial Services Regulatory Authority|https://www.fsra.co.sz",
  "France|Prudential Supervisory and Resolution Authority|https://acpr.banque-france.fr",
  "Georgia|Insurance State Supervision Service of Georgia|https://www.insurance.gov.ge",
  "Georgia|National Bank of Georgia|https://nbg.gov.ge",
  "Germany|Federal Financial Supervisory Authority|https://www.bafin.de",
  "Ghana|National Pensions Regulatory Authority|https://npra.gov.gh",
  "GIFT City|International Financial Services Centres Authority|https://www.ifsca.gov.in",
  "Honduras|National Commission of Banking and Insurance|https://www.cnbs.gob.hn",
  "Hong Kong|Mandatory Provident Fund Schemes Authority|https://www.mpfa.org.hk",
  "Hungary|Central Bank of Hungary|https://www.mnb.hu",
  "India|Pension Fund Regulatory and Development Authority|https://www.pfrda.org.in",
  "Indonesia|Financial Services Authority|https://www.ojk.go.id",
  "Ireland|The Pensions Authority|https://pensionsauthority.ie",
  "Israel|Capital Market Insurance and Savings Authority|https://www.gov.il",
  "Italy|Pension Funds Supervision Commission|https://www.covip.it",
  "Jamaica|Financial Services Commission|https://www.fscjamaica.org",
  "Kazakhstan|Agency for Regulation and Development of the Financial Market|https://www.gov.kz",
  "Kenya|Retirement Benefits Authority|https://www.rba.go.ke",
  "Korea|Financial Supervisory Service|https://www.fss.or.kr",
  "Kosovo|Central Bank of the Republic of Kosovo|https://bqk-kos.org",
  "Latvia|Central Bank of Latvia|https://www.bank.lv",
  "Lesotho|Central Bank of Lesotho|https://centralbank.org.ls",
  "Liechtenstein|Financial Market Authority|https://www.fma-li.li",
  "Lithuania|Bank of Lithuania|https://www.lb.lt",
  "Luxembourg|Financial Sector Supervisory Commission|https://www.cssf.lu",
  "Macao|Monetary Authority of Macao|https://www.amcm.gov.mo",
  "Malawi|Reserve Bank of Malawi|https://www.rbm.mw",
  "Maldives|Capital Market Development Authority|https://cmda.gov.mv",
  "Malta|Malta Financial Services Authority|https://www.mfsa.mt",
  "Mauritius|Financial Services Commission|https://www.fscmauritius.org",
  "Mexico|National Commission of the Retirement Savings System|https://www.gob.mx/consar",
  "Morocco|Supervisory Authority of Insurance and Social Welfare|https://www.acaps.ma",
  "Mozambique|Mozambique Supervisory Institute of Insurance|https://www.issm.gov.mz",
  "Namibia|Namibia Financial Institutions Supervisory Authority|https://www.namfisa.com.na",
  "Netherlands|Central Bank of the Netherlands|https://www.dnb.nl",
  "Nigeria|National Pension Commission|https://www.pencom.gov.ng",
  "North Macedonia|Agency for Supervision of Fully Funded Pension Insurance|https://mapas.mk",
  "Pakistan|Securities and Exchange Commission of Pakistan|https://www.secp.gov.pk",
  "Papua New Guinea|Bank of Papua New Guinea|https://www.bankpng.gov.pg",
  "Peru|Superintendence of Banking Insurance and Pension Funds Administrators|https://www.sbs.gob.pe",
  "Poland|Polish Financial Supervision Authority|https://www.knf.gov.pl",
  "Portugal|Insurance and Pension Funds Supervisory Authority|https://www.asf.com.pt",
  "Romania|Financial Supervisory Authority|https://www.asfromania.ro",
  "Rwanda|National Bank of Rwanda|https://www.bnr.rw",
  "Serbia|National Bank of Serbia|https://nbs.rs",
  "Seychelles|Financial Services Authority|https://fsaseychelles.sc",
  "Singapore|Central Provident Fund Board|https://www.cpf.gov.sg",
  "Slovakia|National Bank of Slovakia|https://www.nbs.sk",
  "South Africa|Financial Sector Conduct Authority|https://www.fsca.co.za",
  "Spain|Directorate General for Insurance and Pension Funds|https://dgsfp.mineco.gob.es",
  "Suriname|Central Bank of Suriname|https://www.cbvs.sr",
  "Switzerland|Swiss Occupational Pension Supervisory Commission|https://www.oak-bv.admin.ch",
  "Thailand|Securities and Exchange Commission|https://www.sec.or.th",
  "Trinidad and Tobago|Central Bank of Trinidad and Tobago|https://www.central-bank.org.tt",
  "Türkiye|Turkish Insurance and Private Pension Regulation and Supervision Authority|https://www.seddk.gov.tr",
  "Uganda|Uganda Retirement Benefits Regulatory Authority|https://urbra.go.ug",
  "Ukraine|National Securities and Stock Market Commission|https://www.nssmc.gov.ua",
  "United Kingdom|The Pensions Regulator|https://www.thepensionsregulator.gov.uk",
  "United States|Department of Labor|https://www.dol.gov",
  "Zambia|Pension and Insurance Authority|https://www.pia.org.zm",
  "Zimbabwe|Insurance and Pensions Commission|https://ipec.co.zw",
] as const;

function loadIops(): RawAuthority[] {
  return IOPS_MEMBERS.map((line) => {
    const [countryLabel, authority, website] = line.split("|");
    return {
      countryLabel,
      authority,
      website: cleanWebsite(website),
      role: "pensions" as const,
      source: "IOPS" as const,
      sourceUrl: SOURCE_URLS.IOPS,
      note: "Official directory is challenge-protected; current governing-member entry captured through indexed official page evidence.",
    };
  });
}

async function loadEgmont(): Promise<RawAuthority[]> {
  const html = await fetchText(SOURCE_URLS.EGMONT);
  const marker = "var members_data = ";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Egmont members_data marker missing");
  const valueStart = start + marker.length;
  let end = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = valueStart; index < html.length; index += 1) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error("Egmont members_data terminator missing");
  const data = JSON.parse(html.slice(valueStart, end)) as Record<string, {
    members?: Array<{ name: string; link_label: string; website_link: string }>;
  }>;
  return Object.values(data).flatMap((region) => (region.members ?? []).map((member) => ({
    countryLabel: member.name.trim(),
    authority: member.link_label.trim(),
    website: cleanWebsite(member.website_link),
    role: "financial_intelligence" as const,
    source: "EGMONT" as const,
    sourceUrl: SOURCE_URLS.EGMONT,
  })));
}

function mergeAuthorities(rows: RawAuthority[]): { authorities: AuthorityEvidence[]; unresolved: RawAuthority[] } {
  const unresolved: RawAuthority[] = [];
  const merged = new Map<string, AuthorityEvidence>();
  for (const row of rows) {
    const iso2 = resolveIso2(row.countryLabel, row.iso2);
    if (!iso2) {
      unresolved.push(row);
      continue;
    }
    const country = resolveCountry(iso2);
    if (!country) {
      unresolved.push(row);
      continue;
    }
    const websiteHost = host(row.website);
    const key = `${iso2}|${websiteHost ?? normalise(row.authority)}`;
    const existing = merged.get(key) ?? {
      iso2,
      country: country.name,
      authority: row.authority,
      website: row.website,
      roles: [],
      sources: [],
      sourceUrls: [],
      notes: [],
    };
    if (!existing.roles.includes(row.role)) existing.roles.push(row.role);
    if (!existing.sources.includes(row.source)) existing.sources.push(row.source);
    if (!existing.sourceUrls.includes(row.sourceUrl)) existing.sourceUrls.push(row.sourceUrl);
    if (row.note && !existing.notes.includes(row.note)) existing.notes.push(row.note);
    if (!existing.website && row.website) existing.website = row.website;
    merged.set(key, existing);
  }
  return {
    authorities: [...merged.values()].sort((a, b) => a.country.localeCompare(b.country) || a.authority.localeCompare(b.authority)),
    unresolved,
  };
}

const REGIONAL_MEMBERS: Record<string, string[]> = {
  "africa cima": ["BJ", "BF", "CM", "CF", "CG", "CI", "GQ", "GA", "GW", "ML", "NE", "SN", "TD", "TG"],
  "central africa": ["CM", "CF", "TD", "CG", "GQ", "GA"],
  "curacao and sint maarten": ["CW", "SX"],
  "organization of eastern caribbean states oecs": ["AI", "AG", "DM", "GD", "MS", "KN", "LC", "VC"],
  "west african monetary union": ["BJ", "BF", "CI", "GW", "ML", "NE", "SN", "TG"],
};

function expandRegionalAuthorities(rows: RawAuthority[]): RawAuthority[] {
  return rows.flatMap((row) => {
    const members = REGIONAL_MEMBERS[normalise(row.countryLabel)];
    if (!members) return [row];
    return members.map((iso2) => ({
      ...row,
      iso2,
      countryLabel: resolveCountry(iso2)?.name ?? iso2,
      note: [row.note, `Regional authority listed for ${normalise(row.countryLabel)}; applied to this member jurisdiction.`]
        .filter(Boolean)
        .join(" "),
    }));
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function activitySignal(activeMonthsLast24: number | null): LiveObservation["activitySignal"] {
  if (activeMonthsLast24 === null) return "insufficient-data";
  if (activeMonthsLast24 >= 18) return "frequent";
  if (activeMonthsLast24 >= 9) return "active";
  if (activeMonthsLast24 >= 3) return "periodic";
  if (activeMonthsLast24 >= 1) return "low-frequency";
  return "no-recent-signal";
}

async function fetchLiveObservation(regulator: string): Promise<LiveObservation> {
  try {
    const payload = await fetchJson<{
      metrics?: {
        count?: number;
        latestDate?: string | null;
        latestIngestionAt?: string | null;
        latestSourceCheckAt?: string | null;
        disclosedAmountCount?: number;
      };
      yearly?: Array<{ year: number; count: number }>;
      monthly?: Array<{ year: number; month: number; count: number }>;
    }>(`https://regactions.com/api/unified/overview?regulator=${encodeURIComponent(regulator)}`);
    const count = Number(payload.metrics?.count ?? 0);
    const disclosed = Number(payload.metrics?.disclosedAmountCount ?? 0);
    const activeYears = (payload.yearly ?? []).filter((entry) => entry.count > 0).length;
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 23, 1);
    cutoff.setUTCHours(0, 0, 0, 0);
    const activeMonthsLast24 = (payload.monthly ?? []).filter((entry) => {
      const month = new Date(Date.UTC(entry.year, entry.month - 1, 1));
      return entry.count > 0 && month >= cutoff;
    }).length;
    return {
      regulator,
      ok: true,
      count,
      latestDate: payload.metrics?.latestDate ?? null,
      latestIngestionAt: payload.metrics?.latestIngestionAt ?? null,
      latestSourceCheckAt: payload.metrics?.latestSourceCheckAt ?? null,
      disclosedAmountCount: disclosed,
      amountDisclosureRate: count ? round1((disclosed / count) * 100) : null,
      activeYears,
      actionsPerActiveYear: activeYears ? round1(count / activeYears) : null,
      activeMonthsLast24,
      activitySignal: activitySignal(activeMonthsLast24),
    };
  } catch (error) {
    return {
      regulator,
      ok: false,
      count: null,
      latestDate: null,
      latestIngestionAt: null,
      latestSourceCheckAt: null,
      disclosedAmountCount: null,
      amountDisclosureRate: null,
      activeYears: null,
      actionsPerActiveYear: null,
      activeMonthsLast24: null,
      activitySignal: "insufficient-data",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapLimit<T, R>(values: T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(";") : value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
}

async function main() {
  const [bis, iosco, iais, egmont] = await Promise.all([
    loadBis(),
    loadIosco(),
    loadIais(),
    loadEgmont(),
  ]);
  const raw = expandRegionalAuthorities([
    ...bis,
    ...iosco,
    ...iais,
    ...loadIops(),
    ...egmont,
    ...MANUAL_OFFICIAL_AUTHORITIES,
  ]);
  const { authorities, unresolved } = mergeAuthorities(raw);

  const registry = Object.values(REGULATOR_COVERAGE);
  const live = registry.filter((entry) => entry.stage === "live");
  const liveObservations = await mapLimit(live.map((entry) => entry.code), 6, fetchLiveObservation);
  const observationByCode = new Map(liveObservations.map((entry) => [entry.regulator, entry]));

  const countryRows = pageCountries().map((country) => {
    const official = authorities.filter((entry) => entry.iso2 === country.iso2);
    const parentOfficial = country.parent ? authorities.filter((entry) => entry.iso2 === country.parent) : [];
    const configured = registry.filter((entry) => entry.countryCode === country.iso2);
    const liveRegs = configured.filter((entry) => entry.stage === "live");
    const observations = liveRegs.map((entry) => observationByCode.get(entry.code)).filter(Boolean) as LiveObservation[];
    const roles = [...new Set(official.flatMap((entry) => entry.roles))].sort();
    const risk = computeCountryRiskV3(country.iso2);
    const observedCount = observations.reduce((sum, entry) => sum + (entry.count ?? 0), 0);
    const latestDates = observations.map((entry) => entry.latestDate).filter((value): value is string => Boolean(value)).sort();
    const isExternallyObservableOnly = country.iso2 === "KP";
    const evidenceState = official.length > 0
      ? "local-authority-evidence"
      : parentOfficial.length > 0
        ? "parent-context-only"
        : isExternallyObservableOnly
          ? "external-risk-evidence-only"
          : "unresolved";
    return {
      iso2: country.iso2,
      iso3: country.iso3,
      country: country.name,
      region: country.region,
      subregion: country.subregion,
      un_member: country.unMember,
      parent_jurisdiction: country.parent ?? "",
      country_risk_v3_score: risk.score,
      country_risk_v3_status: risk.status,
      official_directory_authorities: official.length,
      official_directory_roles: roles,
      parent_directory_authorities: official.length === 0 ? parentOfficial.length : 0,
      parent_directory_roles: official.length === 0 ? [...new Set(parentOfficial.flatMap((entry) => entry.roles))].sort() : [],
      authority_evidence_state: evidenceState,
      authority_evidence_note: isExternallyObservableOnly
        ? "No credible public domestic regulator source located; FATF currently calls for countermeasures and this must not be represented as a zero-regulator or zero-risk state."
        : "",
      external_authority_evidence_url: isExternallyObservableOnly
        ? "https://www.fatf-gafi.org/en/countries/detail/DPRK.html"
        : "",
      central_banking_authorities: official.filter((entry) => entry.roles.includes("central_banking")).length,
      prudential_authorities: official.filter((entry) => entry.roles.includes("prudential_supervision")).length,
      securities_authorities: official.filter((entry) => entry.roles.includes("securities")).length,
      insurance_authorities: official.filter((entry) => entry.roles.includes("insurance")).length,
      pension_authorities: official.filter((entry) => entry.roles.includes("pensions")).length,
      financial_intelligence_units: official.filter((entry) => entry.roles.includes("financial_intelligence")).length,
      ecosystem_research_depth: roles.length >= 5
        ? "broad"
        : roles.length >= 3
          ? "moderate"
          : roles.length >= 1
            ? "limited"
            : parentOfficial.length > 0
              ? "parent-context-only"
              : isExternallyObservableOnly
                ? "externally-observable-unpublished"
                : "unresolved",
      configured_regulators: configured.length,
      live_regulators: liveRegs.length,
      live_regulator_codes: liveRegs.map((entry) => entry.code),
      pipeline_regulator_codes: configured.filter((entry) => entry.stage === "pipeline").map((entry) => entry.code),
      internal_regulator_codes: configured.filter((entry) => entry.stage === "internal").map((entry) => entry.code),
      registry_static_records: liveRegs.reduce((sum, entry) => sum + entry.count, 0),
      live_observed_records: observedCount,
      latest_observed_action: latestDates.length ? latestDates[latestDates.length - 1] : null,
      live_automated_feeds: liveRegs.filter((entry) => entry.automationLevel === "automated").length,
      live_low_frequency_feeds: liveRegs.filter((entry) => entry.automationLevel === "low_frequency").length,
      live_sparse_sources: liveRegs.filter((entry) => entry.automationLevel === "sparse_source").length,
      live_curated_archives: liveRegs.filter((entry) => entry.automationLevel === "curated_archive").length,
      live_lower_confidence_feeds: liveRegs.filter((entry) => entry.operationalConfidence === "lower").length,
      research_priority: liveRegs.length > 0
        ? "calibrate-existing"
        : official.length > 0
          ? "coverage-candidate"
          : isExternallyObservableOnly
            ? "preserve-unobservable-state"
            : "authority-research-required",
    };
  });

  const authorityRows = authorities.map((entry) => ({
    iso2: entry.iso2,
    country: entry.country,
    authority: entry.authority,
    website: entry.website,
    roles: entry.roles,
    directory_sources: entry.sources,
    evidence_urls: entry.sourceUrls,
    notes: entry.notes,
  }));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(OUTPUT_DIR, "country-regulatory-ecosystem-baseline.csv"), toCsv(countryRows)),
    writeFile(path.join(OUTPUT_DIR, "country-regulatory-ecosystem-baseline.json"), `${JSON.stringify({ generatedAt: GENERATED_AT, rows: countryRows }, null, 2)}\n`),
    writeFile(path.join(OUTPUT_DIR, "official-authority-directory.csv"), toCsv(authorityRows)),
    writeFile(path.join(OUTPUT_DIR, "official-authority-directory.json"), `${JSON.stringify({ generatedAt: GENERATED_AT, sources: SOURCE_URLS, rows: authorityRows }, null, 2)}\n`),
    writeFile(path.join(OUTPUT_DIR, "live-regulator-observations.json"), `${JSON.stringify({ generatedAt: GENERATED_AT, rows: liveObservations }, null, 2)}\n`),
    writeFile(path.join(OUTPUT_DIR, "unresolved-directory-entries.json"), `${JSON.stringify({ generatedAt: GENERATED_AT, rows: unresolved }, null, 2)}\n`),
  ]);

  const roleCoverage = (role: Role) => new Set(authorities.filter((entry) => entry.roles.includes(role)).map((entry) => entry.iso2)).size;
  const summary = {
    generatedAt: GENERATED_AT,
    countryUniverse: countryRows.length,
    officialAuthorityRows: authorities.length,
    countriesWithAnyOfficialAuthority: countryRows.filter((entry) => Number(entry.official_directory_authorities) > 0).length,
    countriesWithBroadRoleEvidence: countryRows.filter((entry) => entry.ecosystem_research_depth === "broad").length,
    countriesWithNoResolvedAuthority: countryRows.filter((entry) => entry.ecosystem_research_depth === "unresolved").length,
    roleCoverage: {
      centralBanking: roleCoverage("central_banking"),
      prudentialSupervision: roleCoverage("prudential_supervision"),
      securities: roleCoverage("securities"),
      insurance: roleCoverage("insurance"),
      pensions: roleCoverage("pensions"),
      financialIntelligence: roleCoverage("financial_intelligence"),
    },
    regActionsRegistry: {
      configured: registry.length,
      live: live.length,
      internal: registry.filter((entry) => entry.stage === "internal").length,
      pipeline: registry.filter((entry) => entry.stage === "pipeline").length,
      liveCountries: new Set(live.filter((entry) => entry.countryCode !== "EU").map((entry) => entry.countryCode)).size,
      liveEuLevelAuthorities: live.filter((entry) => entry.countryCode === "EU").length,
    },
    liveObservationFailures: liveObservations.filter((entry) => !entry.ok).length,
    unresolvedDirectoryEntries: unresolved.length,
  };
  await writeFile(path.join(OUTPUT_DIR, "baseline-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

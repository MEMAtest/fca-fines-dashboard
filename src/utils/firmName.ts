/**
 * Shared firm-name sanity check.
 *
 * Extracted from `server/services/hubs.ts` so the CLIENT can use it too. It was
 * previously applied only to the prerendered hub tables, which is why the
 * homepage ticker happily displayed scraped junk as enforcement actions —
 * "duurzaam financieel welzijn in Nederland. &copy", "Former Executives",
 * "Boiler Room Operator and Three Entities".
 *
 * Pure: no database, no imports. Safe in both bundles.
 */

/**
 * Display-sanity heuristics for the "Largest enforcement actions" table.
 *
 * These filters apply ONLY to the top-N showcase table baked into regulator
 * hub pages. Rows excluded here remain in the database, the full fines list,
 * and search — only the static highlight table is affected.
 *
 * Rules (conservative — when in doubt, keep the row):
 *   1. Name is too short (<= 2 chars, e.g. "J.P" truncated to "J.P" is 3 chars
 *      but that trailing dot makes it truncated; we catch it separately).
 *   2. Name contains obvious verb-phrase tokens that indicate a headline sentence
 *      rather than a party name: "to Pay", " fines ", " fined ", " charged ",
 *      "overcharged", "finds ", "ruled", "to Return", "to Appeal", "Paying",
 *      "Agrees to", "Sanctions on", "Fines Against", "Fine Imposition on",
 *      "Imposed on", "Received a Warning", "admits to illegal/cartel",
 *      "increases fine", "commence prosecution", "Misconduct Tribunal", and
 *      document-title colon forms (": an open letter", ": guidance", etc.).
 *   3. Name is a well-known placeholder: "Unknown", "Undisclosed", "N/A", "N/a",
 *      and exact-match DNB/CMVM anonymisation tokens ("Onderneming",
 *      "Bank N.V.", "Netherlands B.V.", "dois arguidos").
 *      Deliberate keeps (conservative): "Personen" (Danish anonymisation),
 *      named companies whose legal form ends in "N.V." or "B.V." (e.g.
 *      "Volksbank N.V.", "Aegon Bank N.V.") are NOT excluded because they
 *      are real firm names, not bare generic tokens.
 *      Note: "dois arguidos" (Portuguese "two defendants") was previously listed
 *      as a deliberate keep, but the reviewer overturned that: it is a generic
 *      legal term, not a firm name. Excluding it means CMVM renders no fines
 *      table, which is the correct graceful empty state.
 *   4. Name matches a date-shaped action title like "Enforcement Action YYYY-MM-DD".
 *   5. Name starts with a regulator's own name (e.g. "CMA finds …", "CMVM divulgou …",
 *      "The FSC Imposed …") — these are press-release titles, not party names.
 *   6. Name is a press-release boilerplate snippet (e.g. starts with "interviews are").
 *   7. Name is an HTTP error code string (e.g. "403 ERROR").
 *   8. Name appears to be a truncated navigation menu fragment (starts with
 *      lowercase and contains multiple unrelated Dutch/administrative terms joined
 *      by spaces without logical connectives, caught by the >80-char heuristic
 *      combined with verb-phrase absence — but we surface it via the "starts
 *      with lowercase" check for the specific AFM truncation pattern).
 *   9. Name ends with a bare hanging connective word (e.g. "water tank firms over"),
 *      indicating a truncated sentence fragment.
 *  10. Name is paragraph-scale (>= 180 chars) — a scraped press-release
 *      paragraph, never a party name (observed from FMA-AT).
 *
 * False-exclusion risk: legitimate firm names that are long phrases (e.g.
 * "Citigroup Global Markets Limited, Citibank N.A. London Branch and Citibank
 * Europe Plc") are intentionally NOT excluded because they contain no verb
 * phrases and have no placeholder tokens. The heuristics are applied as an
 * OR of specific patterns, not a name-scale length cut-off (rule 10 only
 * fires at paragraph scale, roughly double the longest known real name).
 */
export function isGarbageFirmName(name: string): boolean {
  if (!name || name.trim().length === 0) return true;

  const n = name.trim();

  // Rule 7: HTTP error strings
  if (/^\d{3}\s+ERROR$/i.test(n)) return true;

  // Rule 3: known placeholder values — exact matches only to avoid killing real
  // firm names like "Volksbank N.V." or "Jmond Corporate Solutions B.V.".
  // "dois arguidos" (Portuguese "two defendants") is a CMVM generic legal term,
  // not a firm name; excluding it yields a graceful empty table for CMVM.
  if (/^(Unknown|Undisclosed|N\/A|N\/a|Onderneming|Bank N\.V\.|Netherlands B\.V\.|dois arguidos)$/i.test(n)) return true;

  // Rule 4: date-shaped enforcement action titles ("Enforcement Action YYYY-MM-DD")
  if (/^Enforcement Action \d{4}-\d{2}-\d{2}$/i.test(n)) return true;

  // Rule 6: press-release boilerplate snippets
  if (/^interviews are coordinated by/i.test(n)) return true;

  // Rule 2: headline verb phrases that indicate a sentence, not a party name.
  // These appear inside the string (not anchored) because headlines embed the
  // verb mid-sentence. We check for word-boundary variants to avoid false
  // positives on firm names like "Payday Lender Penalised".
  const verbPhrases = [
    /\bto Pay\b/i,
    /\bto Return\b/i,
    /\bto Appeal\b/i,
    / fines /i,
    / fined /i,
    / charged /i,
    /overcharged/i,
    /\bfinds \b/i,
    /\bruled\b/i,
    /\bOrders?\b.*\bJudgment\b/i, // "Court Orders $1 Billion Judgment …"
    /\bReaches? Settlement\b/i, // "Petrobras Reaches Settlement With SEC …"
    /\bSettles\b.{0,40}\b(FCPA|Charges?|Violations?)\b/i, // "X Settles FCPA Violations"
    /\bdivulgou\b/i, // Portuguese CMVM press-release titles ("divulgou hoje")
    /\bproferiu\b/i, // Portuguese CMVM decision titles ("proferiu decisão")
    /^Contraorden/i, // Portuguese quarter-report section titles (CMVM)
    /^Decisão do Conselho\b/i, // Portuguese formal decision titles
    /\bSanctions? on\b/i, // TWFSC action-phrase titles (singular + plural: "Sanction on", "Sanctions on")
    /\bDisposition Imposed on\b/i,
    /\bDisciplinary [Aa]ction\b/i, // TWFSC action-phrase titles
    /\bDisciplinary [Cc]ase\b/i,
    /\brevokes the licen/i, // SFC "revokes the licence of …"
    /\bdealings in the shares/i, // SFC sentence-as-name
    /\bImposed\b.*\bSanctions\b/i, // TWFSC bulk-action titles
    /\blessons learnt\b/i, // CMA case-study title
    // --- patterns added to close 16 filter escapes found in prod review ---
    /\bPaying\b/i, // SEC: "Teva Pharmaceutical Paying $519M …", "Oil Services Company Paying $140M …"
    /\bAgrees? to\b/i, // SEC: "Barclays Agrees to a $361M Settlement …" (missed by Reaches Settlement)
    /\bFines? Against\b/i, // TWFSC: "Fines Against the Person Responsible …"
    /\bFine Imposition on\b/i, // TWFSC: "Fine Imposition on Person Responsible …"
    /\bImposed on\b/i, // TWFSC: "NT$1,200,000 Fine and Warning Imposed on …"
    /\bReceived a Warning\b/i, // TWFSC: "Capital Investment Trust Corp. Received a Warning …"
    /\badmit(s|ted)?\s+(to\s+)?(an?\s+)?(illegal|cartel)/i, // CMA: "Two UK roofing lead firms admit to illegal cartel"
    /\bincreases fine\b/i, // CMA: "CAT increases fine after musical instrument firm …"
    /:\s*(an?\s+)?(open letter|guidance|consultation|case study)\b/i, // CMA: "Restricting resale prices: an open letter …"
    /^commence prosecution\b/i, // SFC: "commence prosecution in securities fraud case …" (starts lowercase)
    /\bMisconduct Tribunal\b/i, // SFC: "Market Misconduct Tribunal sanctions Magic Holdings …"
    // --- residue found by post-fix dist sweep of all baked hub tables ---
    /\bSanctioned\b/i, // TWFSC: "Concord Futures Corp. Sanctioned", "Masterlink Futures Corp.,Ltd and Its Associated Person Sanctioned"
    /\bDisciplinary Procedures?\b/i, // TWFSC: "Disciplinary Procedures Against Asia Pacific International Securities …"
    /\bto Settle\b/i, // SEC: "Bank of America Admits Disclosure Failures to Settle SEC Charges"
    /\bhereby announces\b/i, // FMA-AT: press-release paragraph scraped as the party name
    /\bdue to (a )?breach of\b/i, // FMA-AT: "Lang & Schwarz AG due to breach of the ban on market manipulation …"
  ];
  for (const re of verbPhrases) {
    if (re.test(n)) return true;
  }

  // Rule 5: name starts with a known regulator acronym followed by a verb
  // (catches "CMA finds …", "CMA decision …", "CMA to appeal …",
  //  "The FSC Imposed …", "CMVM divulgou …").
  if (/^(?:CMA|CMVM|FSC|FCA|SEC|DNB|AFM)\b[^A-Z]/i.test(n)) return true;
  // Note: no /i flag here — [A-Z]{2,4} must be uppercase-only to catch "The FSC",
  // "The FCA", "The SEC" etc., while keeping "The Bank of Nova Scotia" (mixed case).
  if (/^The [A-Z]{2,4} /.test(n)) return true;

  // Rule 11: sentence fragments that begin with a LOWERCASE article or
  // determiner. Scraped hub titles are title-cased, so a leading lowercase
  // "the"/"a"/"an" means the scraper started mid-sentence and captured a clause
  // rather than a party — e.g. the SFC row "the Code of Conduct", carved out of
  // "… for breaches of the Code of Conduct".
  //
  // Deliberately NOT /i: "The Bank of Nova Scotia" is a real party and must be
  // kept, and lowercase names that are not fragments (the CMA fixture
  // "pharma firm") do not start with an article so they are unaffected.
  if (/^(?:the|a|an|this|that|its|their|his|her)\s/.test(n)) return true;

  // Rule 12: bare references to a rulebook or instrument. These are the thing
  // that was BREACHED, never the party that breached it, so they are garbage
  // wherever the scraper picks them up. Exact-match only (optionally with a
  // leading article) so a real firm that merely contains one of these phrases
  // in a longer legal name is not swept up with it.
  if (
    /^(?:the\s+)?(?:Code of Conduct|Takeovers Code|Listing Rules|Securities and Futures Ordinance)$/i.test(
      n,
    )
  ) {
    return true;
  }

  // Rule 1 + truncation: very short names that look like truncated strings.
  // "J.P" (3 chars, ends with dot) is a BaFin scraper truncation artifact.
  // We match the specific pattern: 1-4 chars total, ends with "." and no
  // space — distinguishes it from legitimate abbreviations that end mid-word.
  if (/^[A-Z]\.[A-Z]\.?$/.test(n) && !n.includes(" ")) return true;

  // Rule 9: truncated sentence fragments ending in a bare hanging connective
  // word — indicates the scraper caught a partial sentence, not a party name.
  //
  // Design notes:
  //   • Space lookbehind ((?<= )) ensures we only match full standalone words,
  //     not abbreviation suffixes like "N.A" or "S.A" (the 'A' is preceded by '.').
  //   • Negative comma+space lookbehind ((?<!, )) preserves the OCC/FDIC naming
  //     convention "BANK NAME, THE" where the article is appended with a comma —
  //     those are legitimate legal entity names, not sentence fragments.
  //   • "a" and "an" are intentionally omitted: a single capital "A" at end of
  //     string is indistinguishable from an initial (e.g. "Air France-KLM and Mr A",
  //     "Saxo Bank A"). Those names must be kept.
  //   • "Pfizer and Flynn" (ends "Flynn") and "The Bank of Nova Scotia" (ends
  //     "Scotia") are safely kept — neither ends with a listed connective word.
  if (/(?<!, )(?<= )(over|and|the|of|to|for|with)$/i.test(n)) return true;

  // ── Rules added from the live homepage feed (2026-08-20) ──────────────
  // These reached the front page as if they were firms. Each is anchored to a
  // shape observed in real data, not a guess.

  // Rule 13: a raw HTML entity means scraper output, never a party name.
  //   "duurzaam financieel welzijn in Nederland. &copy"  (AFM)
  if (/&(copy|amp|nbsp|quot|apos|lt|gt|#\d+);?/i.test(n)) return true;

  // Rule 14: lowercase-initial prose. Real names are capitalised; a
  // lowercase start with several words is a sentence fragment. The 4-word
  // floor keeps the CMA descriptor "pharma firm", and the honorific exemption
  // keeps CNMV parties like "don Santiago Reyna Herrero, don Luis ...".
  if (
    /^[a-z]/.test(n)
    && !/^(don|do(ñ|n)a|dhr|mevr|mr|mrs|ms|sr|sra|hr|fr)\b/i.test(n)
    && n.split(/\s+/).length >= 4
  ) {
    return true;
  }

  // Rule 15: SEC headline fragments that describe unnamed parties.
  //   "Former Executives", "Boiler Room Operator and Three Entities",
  //   "Toms River Trio in Connection", "... Its CEO and Affiliated"
  if (/^(Former|Ex-)\s/i.test(n) && !/\b(ltd|limited|inc|llc|plc|corp|s\.a|n\.v|b\.v)\b/i.test(n)) return true;
  if (/\bin Connection\b\s*$/i.test(n)) return true;
  if (/\band (Three|Two|Several|Multiple) Entities\b/i.test(n)) return true;
  if (/\band Affiliated\s*$/i.test(n)) return true;

  // Rule 16: sentences that open with an event or a charge rather than a party.
  //   "Hearing adjourned in criminal prosecution"  (SFC)
  //   "Violation of Securities Regulations by ..."  (TWFSC)
  if (/^(Hearing|Violation of|Proceedings?|Notice of|Statement of)\s/i.test(n)) return true;

  // Rule 10: paragraph-scale blobs. Long legitimate multi-entity names exist
  // (e.g. the ~93-char "The Bank of New York Mellon London Branch & The Bank of
  // New York Mellon International Limited"), so this is NOT a name-scale
  // cut-off — but nothing at >= 180 chars is a party name; that is a scraped
  // press-release paragraph (observed from FMA-AT).
  if (n.length >= 180) return true;

  return false;
}

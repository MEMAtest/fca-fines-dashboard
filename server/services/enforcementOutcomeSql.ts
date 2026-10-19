/** SQL predicates kept aligned with classifyEnforcementOutcome for Fines filters. */
export function enforcementOutcomePredicate(outcome: string, alias = ""): string | null {
  const column = (name: string) => `${alias ? `${alias}.` : ""}${name}`;
  const categories = `CASE
    WHEN jsonb_typeof(${column("breach_categories")}) = 'array' THEN COALESCE((
      SELECT string_agg(category.value, ' ')
      FROM jsonb_array_elements_text(${column("breach_categories")}) AS category(value)
    ), '')
    WHEN jsonb_typeof(${column("breach_categories")}) = 'string' THEN ${column("breach_categories")} #>> '{}'
    ELSE ''
  END`;
  const joinedText = `regexp_replace(concat_ws(' ', ${column("breach_type")}, ${categories}, ${column("summary")}, ${column("notice_url")}, ${column("source_url")}), '[_-]+', ' ', 'g')`;
  // JavaScript's canonical /\b/ uses ASCII \w even beside Korean or accented
  // text. Normalize non-ASCII characters to separators before PostgreSQL's
  // equivalent \y tests, so those boundaries agree across runtimes.
  const text = `regexp_replace(${joinedText}, '[^[:ascii:]]+', ' ', 'g')`;
  const matches = (pattern: string) => `${text} ~* '\\y(?:${pattern})\\y'`;
  const informational = matches("guidance|consultation|discussion paper|policy statement|annual report|framework|speech|market study|thematic review");
  const trustedAmount = `(NOT COALESCE(${column("requires_amount_review")}, FALSE) AND (COALESCE(${column("amount_gbp")}, 0) > 0 OR COALESCE(${column("amount_eur")}, 0) > 0))`;
  const monetaryWording = matches("fine[ds]?|financial penalty|monetary penalty|monetary sanction|civil (money )?penalty|administrative penalty|penalty of|penalised|penalized");
  const finalWording = matches("final notice|final decision|final order|ordered to|has imposed|imposed a|was fined|were fined|revoked|cancelled|censured|reprimanded|convicted|sentenced|settled");
  const outcomeWording = [
    matches("prohibit(ed|ion)?|debar(red|ment)?|disqualif(ied|ication)|bann?ed|industry ban"),
    matches("\\y(licen[cs]e|registration|authori[sz]ation)\\y.{0,45}\\y(revok(ed|ation)|cancel(led|lation)|withdrawn|restrict(ed|ion)|surrender(ed)?)\\y|\\y(revok(ed|ation)|cancel(led|lation)|withdrawn|restrict(ed|ion))\\y.{0,45}\\y(licen[cs]e|registration|authori[sz]ation)\\y"),
    matches("public censure|censur(ed|e)|reprimand(ed)?"),
    matches("redress|restitution|compensation|remediation|disgorgement|repay(ment)?|refund(ed)?"),
    matches("convict(ed|ion)|sentenc(ed|ing)|prosecut(ed|ion)|court order|injunction|imprison(ed|ment)"),
    matches("suspend(ed|sion)"),
    matches("settle(d|ment)|undertaking|accepted findings and sanctions|letter of acceptance.{0,20}waiver.{0,20}consent|awc"),
    matches("non monetary order|supervisory sanction|enforcement action|administrative action|disciplinary action"),
  ].join(" OR ");
  const monetary = `(${trustedAmount} OR (${monetaryWording} AND NOT ${informational}))`;
  const final = `(${trustedAmount} OR (${monetaryWording} AND NOT ${informational}) OR (${outcomeWording}) OR ${finalWording})`;
  const alert = matches("investor alert|consumer alert|fraud alert|scam alert|warning list|illegal operator|unauthori[sz]ed (firm|entity|operator|provider)|blacklist(ed)?");
  const pending = matches("charg(ed|es)|proceedings? (commenced|filed|opened|pending)|complaint filed|hearing scheduled|investigation (opened|ongoing|underway)|show cause notice|notice of allegations");

  if (outcome === "Monetary") return monetary;
  if (outcome === "Non-monetary") return `(${final} AND NOT ${monetary})`;
  if (outcome === "Pending and alerts") return `((${alert} AND NOT ${final}) OR (${pending} AND NOT ${final} AND NOT ${alert}))`;
  return null;
}

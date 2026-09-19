/**
 * Versioned, deterministic public concepts used by enforcement search and
 * topic/breach hubs. Keep aliases deliberately explicit: a concept match must
 * be evidenced by enforcement text, never by an entity name alone.
 */
export const ENFORCEMENT_CONCEPT_VERSION = "2026-09-19.v1";

export const CYBER_OPERATIONAL_RESILIENCE = "CYBER_OPERATIONAL_RESILIENCE" as const;

export const CYBER_OPERATIONAL_RESILIENCE_ALIASES = [
  "data breach",
  "cyber incident",
  "ransomware",
  "cybersecurity disclosure",
  "ict risk",
  "information security",
  "technology risk",
  "operational resilience",
] as const;

export type EnforcementConcept = typeof CYBER_OPERATIONAL_RESILIENCE;

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveEnforcementConcept(query: string): EnforcementConcept | null {
  const haystack = ` ${normalise(query)} `;
  return CYBER_OPERATIONAL_RESILIENCE_ALIASES.some((alias) =>
    haystack.includes(` ${normalise(alias)} `),
  )
    ? CYBER_OPERATIONAL_RESILIENCE
    : null;
}

export function conceptEvidenceReasons(input: {
  title?: string | null;
  breachType?: string | null;
  breachCategories?: string[] | null;
  summary?: string | null;
}) {
  const fields = [
    ["title", input.title],
    ["breachType", input.breachType],
    ["breachCategory", input.breachCategories?.join(" ")],
    ["summary", input.summary],
  ] as const;
  const reasons = fields.flatMap(([field, value]) => {
    const haystack = normalise(value ?? "");
    return CYBER_OPERATIONAL_RESILIENCE_ALIASES.some((alias) =>
      haystack.includes(normalise(alias)),
    )
      ? [field]
      : [];
  });
  return Array.from(new Set(reasons));
}


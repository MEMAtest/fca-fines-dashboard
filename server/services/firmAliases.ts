export interface FirmAliasGroup {
  canonical: string;
  aliases: string[];
}

export const FIRM_ALIAS_GROUPS: FirmAliasGroup[] = [
  {
    canonical: "Wise",
    aliases: [
      "Wise",
      "Wise Payments",
      "Wise Payments Limited",
      "Wise Payments Ltd",
      "Wise US",
      "Wise US Inc",
      "Wise US Inc.",
      "Wise Nuqud",
      "Wise Nuqud Ltd",
      "Wise Nuqud Limited",
      "Wise plc",
      "Wise Assets UK",
      "Wise Assets UK Ltd",
      "Wise Assets UK Limited",
      "TransferWise",
      "Kristo Kaarmann",
      "Kristo Käärmann",
    ],
  },
];

export function normalizeAliasTerm(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsAliasTerm(normalizedInput: string, normalizedAlias: string) {
  if (!normalizedInput || !normalizedAlias) return false;
  if (normalizedInput === normalizedAlias) return true;

  const paddedInput = ` ${normalizedInput} `;
  const paddedAlias = ` ${normalizedAlias} `;
  return paddedInput.includes(paddedAlias);
}

export function expandFirmAliasTerms(input: string) {
  const normalizedInput = normalizeAliasTerm(input);
  const terms = new Set<string>();

  if (input.trim()) {
    terms.add(input.trim());
  }

  for (const group of FIRM_ALIAS_GROUPS) {
    const groupTerms = [group.canonical, ...group.aliases];
    const matched = groupTerms.some((alias) =>
      containsAliasTerm(normalizedInput, normalizeAliasTerm(alias)),
    );

    if (!matched) continue;

    terms.add(group.canonical);
    group.aliases.forEach((alias) => terms.add(alias));
  }

  return Array.from(terms);
}


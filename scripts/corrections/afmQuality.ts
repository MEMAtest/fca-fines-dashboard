/** Exact legacy AFM entity forms confirmed as page-furniture extraction. */
export const AFM_MALFORMED_ENTITY_PATTERN = String.raw`(?:<[^>]+>|^AFM fines BDO for exam fraud$|^duurzaam financieel welzijn in Nederland\. &copy$|^consumenten Digitalisering Duurzaamheid Marktmisbru$)`;

const malformedEntity = new RegExp(AFM_MALFORMED_ENTITY_PATTERN, "i");

export function isKnownMalformedAfmEntity(value: string | null | undefined) {
  return Boolean(value && malformedEntity.test(value.trim()));
}

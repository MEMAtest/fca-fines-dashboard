/** SQL grounding shared by every approved official-passage consumer. */
export function currentApprovedControlEvidenceIdentityPredicate(
  caseAlias: string,
  evidenceAlias: string,
): string {
  return `
    ${evidenceAlias}.public_case_id = ${caseAlias}.public_case_id
    AND ${evidenceAlias}.respondent = ${caseAlias}.firm_individual
    AND NULLIF(${evidenceAlias}.source_url, '') IS NOT NULL
    AND ${evidenceAlias}.source_url = COALESCE(
      NULLIF(${caseAlias}.notice_url, ''),
      NULLIF(${caseAlias}.source_url, '')
    )
    AND NULLIF(${evidenceAlias}.content_hash, '') IS NOT NULL
  `;
}

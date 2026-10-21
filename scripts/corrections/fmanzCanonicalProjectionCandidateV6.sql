-- Read-only V6 candidate generator. Source-QA-approved no-write proposal;
-- pending final projection proof after the approved correction/quality flags.
--
-- Starts from the exact current materialized-view definition and scopes URL
-- partitioning and target-row preference to six reviewed FMANZ events. The
-- sixth event is AIA: same official case/source page, NZD 700,000, with the
-- source-backed settlement PDF selected while retaining the existing public
-- case ID. The retired duplicate public ID is never restored. No raw row,
-- registry, alias, suppression, override, or other-regulator row is changed.
--
-- This query returns candidate SQL/definition as text only. Run it and its
-- generated SELECT only inside a bounded read-only transaction.

WITH captured AS (
  SELECT
    pg_get_viewdef('public.all_regulatory_fines_canonical'::regclass, true) AS base_definition
), guarded AS (
  SELECT
    base_definition,
    length(base_definition) - length(replace(base_definition, 'FROM identified', '')) AS matched_text_length,
    length(base_definition) - length(replace(
      base_definition,
      $needle$corrected.date_issued::text, corrected.normalised_evidence_url, COALESCE(corrected.amount_original::text, 'undisclosed'::text), upper(COALESCE(corrected.currency, ''::text)), corrected.case_ref$needle$,
      ''
    )) AS matched_identity_text_length,
    length(base_definition) - length(replace(
      base_definition,
      $rankneedle$PARTITION BY identified.source_duplicate_identity ORDER BY ((identified.amount_gbp IS NOT NULL)::integer * 4$rankneedle$,
      ''
    )) AS matched_rank_text_length,
    position('regulatory_case_suppressions' IN base_definition) > 0 AS already_has_suppression_gate
  FROM captured
), identity_patched AS (
  SELECT
    base_definition,
    matched_text_length,
    matched_identity_text_length,
    matched_rank_text_length,
    already_has_suppression_gate,
    replace(
      base_definition,
      $needle$corrected.date_issued::text, corrected.normalised_evidence_url, COALESCE(corrected.amount_original::text, 'undisclosed'::text), upper(COALESCE(corrected.currency, ''::text)), corrected.case_ref$needle$,
      $identity$corrected.date_issued::text,
        CASE
          WHEN upper(corrected.regulator) = 'FMANZ'
           AND (
             (corrected.firm_individual = 'BNZ' AND corrected.date_issued = DATE '2026-06-22' AND corrected.amount_original IS NULL AND upper(corrected.currency) = 'NZD' AND corrected.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/bnz/') OR
             (corrected.firm_individual = 'Murray McClune' AND corrected.date_issued = DATE '2025-10-06' AND corrected.amount_original IS NULL AND upper(corrected.currency) = 'NZD' AND corrected.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/murray-mcclune/') OR
             (corrected.firm_individual = 'Du Val' AND corrected.date_issued = DATE '2025-08-14' AND corrected.amount_original IS NULL AND upper(corrected.currency) = 'NZD' AND corrected.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/du-val/') OR
             (corrected.firm_individual = 'Vivier and Company Limited (Vivier)' AND corrected.date_issued = DATE '2017-06-08' AND corrected.amount_original IS NULL AND upper(corrected.currency) = 'NZD' AND corrected.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/vivier/') OR
             (corrected.firm_individual = 'Milford Asset Management Limited' AND corrected.date_issued = DATE '2015-06-18' AND corrected.amount_original IS NULL AND upper(corrected.currency) = 'NZD' AND corrected.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/milford-asset-management-limited-settlement-agreement/') OR
             (corrected.firm_individual = 'AIA' AND corrected.date_issued = DATE '2022-09-30' AND corrected.amount_original = 700000.00 AND upper(corrected.currency) = 'NZD' AND corrected.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/aia/')
           )
            THEN normalise_regulatory_evidence_url(corrected.source_url)
          ELSE corrected.normalised_evidence_url
        END,
        COALESCE(corrected.amount_original::text, 'undisclosed'::text),
        upper(COALESCE(corrected.currency, ''::text)),
        corrected.case_ref$identity$
    ) AS identity_definition
  FROM guarded
), patched AS (
  SELECT
    base_definition,
    matched_text_length,
    matched_identity_text_length,
    matched_rank_text_length,
    already_has_suppression_gate,
    CASE
      WHEN matched_text_length = length('FROM identified')
       AND matched_identity_text_length = length($needle$corrected.date_issued::text, corrected.normalised_evidence_url, COALESCE(corrected.amount_original::text, 'undisclosed'::text), upper(COALESCE(corrected.currency, ''::text)), corrected.case_ref$needle$)
       AND matched_rank_text_length = length($rankneedle$PARTITION BY identified.source_duplicate_identity ORDER BY ((identified.amount_gbp IS NOT NULL)::integer * 4$rankneedle$)
       AND NOT already_has_suppression_gate
      THEN replace(
        replace(
          identity_definition,
          $rankneedle$PARTITION BY identified.source_duplicate_identity ORDER BY ((identified.amount_gbp IS NOT NULL)::integer * 4$rankneedle$,
          $rankreplacement$PARTITION BY identified.source_duplicate_identity ORDER BY (CASE WHEN upper(identified.regulator) = 'FMANZ' AND identified.id::text IN (
            'e6b37190-1078-4711-85ab-56f9e459eb24', 'e4efb815-f665-443a-9a13-403a688e07a4',
            'fe37d000-cb72-479b-a5f9-a59cb1804b44', '5f2dadc6-1970-43a9-8c3f-3cfacd34fb5e',
            'c10cd0e8-5271-4155-b4da-3ee456c74516', '1d17f226-d075-448a-9f88-0cc9ddff5acf'
          ) THEN 1 ELSE 0 END) DESC, ((identified.amount_gbp IS NOT NULL)::integer * 4$rankreplacement$
        ),
        'FROM identified',
        $gate$FROM identified
          WHERE NOT (
            upper(identified.regulator) = 'FMANZ'
            AND EXISTS (
              SELECT 1
              FROM public.regulatory_case_suppressions AS suppression
              WHERE suppression.source_row_id = identified.id::text
                AND upper(suppression.regulator) = 'FMANZ'
            )
          )$gate$
      )
      ELSE NULL
    END AS patched_definition
  FROM identity_patched
)
SELECT
  CASE WHEN patched.patched_definition IS NULL THEN 'rejected' ELSE 'ready' END AS status,
  CASE
    WHEN patched.matched_text_length <> length('FROM identified')
      THEN 'Expected exactly one unmodified FROM identified site in the current canonical definition.'
    WHEN patched.matched_identity_text_length <> length($needle$corrected.date_issued::text, corrected.normalised_evidence_url, COALESCE(corrected.amount_original::text, 'undisclosed'::text), upper(COALESCE(corrected.currency, ''::text)), corrected.case_ref$needle$)
      THEN 'Expected exactly one current source_duplicate_identity URL expression in the canonical definition.'
    WHEN patched.matched_rank_text_length <> length($rankneedle$PARTITION BY identified.source_duplicate_identity ORDER BY ((identified.amount_gbp IS NOT NULL)::integer * 4$rankneedle$)
      THEN 'Expected exactly one current canonical rank ordering site.'
    WHEN patched.already_has_suppression_gate
      THEN 'Current canonical definition already contains a suppression gate; inspect it rather than patching again.'
    ELSE NULL
  END AS status_reason,
  patched.patched_definition AS candidate_definition,
  CASE WHEN patched.patched_definition IS NULL THEN NULL ELSE format($candidate$
WITH candidate_canonical AS (
%s
), continuity_handoffs(public_case_id, old_source_row_id, target_source_row_id, firm_individual, date_issued, amount_original, currency, source_url, target_notice_url, retired_public_case_id) AS (
  VALUES
    ('90062ab8-243b-48d5-94f2-048f00cda505', '459ee354-13c0-4360-b486-09d85a7ae397', 'e6b37190-1078-4711-85ab-56f9e459eb24', 'BNZ', DATE '2026-06-22', NULL::numeric, 'NZD', 'https://www.fma.govt.nz/about-us/enforcement/cases/bnz/', 'https://www.fma.govt.nz/assets/Enforcement/Enforceable-undertakings/BNZ-Enforceable-Undertaking-20260608.pdf', NULL::text),
    ('4b7ebf8b-0176-4ed5-a3dc-6ab8460a5f80', '54b2b4e4-8012-49e7-97b6-598d19703180', 'e4efb815-f665-443a-9a13-403a688e07a4', 'Murray McClune', DATE '2025-10-06', NULL::numeric, 'NZD', 'https://www.fma.govt.nz/about-us/enforcement/cases/murray-mcclune/', 'https://www.fma.govt.nz/assets/Enforcement/Judgements/MCCLUNE-Murray-Robert-Frederick-Sentencing.pdf', NULL::text),
    ('60764f2f-271e-46ed-8232-f7896685c9c6', 'c49e917a-8cd7-4d15-9ce5-08193aa33754', 'fe37d000-cb72-479b-a5f9-a59cb1804b44', 'Du Val', DATE '2025-08-14', NULL::numeric, 'NZD', 'https://www.fma.govt.nz/about-us/enforcement/cases/du-val/', 'https://www.fma.govt.nz/assets/Enforcement/Judgements/FMA-application-2025-NZHC-1857.pdf', NULL::text),
    ('df40aac3-0504-4ae5-b89d-88594eb402f2', '7ad14544-e3f8-4bce-b7d2-90b04eefacd3', '5f2dadc6-1970-43a9-8c3f-3cfacd34fb5e', 'Vivier and Company Limited (Vivier)', DATE '2017-06-08', NULL::numeric, 'NZD', 'https://www.fma.govt.nz/about-us/enforcement/cases/vivier/', 'https://www.fma.govt.nz/assets/Enforcement/Judgements/COA-Judgment-Vivier-130516.pdf', NULL::text),
    ('89e5a769-777f-416b-9e06-d77414274627', 'ea63d63e-8f90-4f09-8bde-390aeb45716f', 'c10cd0e8-5271-4155-b4da-3ee456c74516', 'Milford Asset Management Limited', DATE '2015-06-18', NULL::numeric, 'NZD', 'https://www.fma.govt.nz/about-us/enforcement/cases/milford-asset-management-limited-settlement-agreement/', 'https://www.fma.govt.nz/assets/Enforcement/Settlements/Milford-Asset-Management-Limited-and-FMA-Settlement-Agreement.pdf', NULL::text),
    ('3ec81b4c-6e62-44b6-9c06-654f37363ee0', '541a89d0-465d-4cc1-8589-6b3b7d92ce91', '1d17f226-d075-448a-9f88-0cc9ddff5acf', 'AIA', DATE '2022-09-30', 700000.00::numeric, 'NZD', 'https://www.fma.govt.nz/about-us/enforcement/cases/aia/', 'https://www.fma.govt.nz/assets/Enforcement/Settlements/AIA-Settlement-agreement-final-for-execution-incl.-schedules.pdf', 'da3264db-6860-4325-a19c-2fe8ddb334e8')
), current_valid AS (
  SELECT trusted.id::text AS id
  FROM public.all_regulatory_fines_trusted AS trusted
), handoff_validation AS (
  SELECT count(*)::integer AS matched_handoffs
  FROM continuity_handoffs AS handoff
  JOIN candidate_canonical AS candidate
    ON candidate.id::text = handoff.target_source_row_id
   AND upper(candidate.regulator) = 'FMANZ'
   AND candidate.firm_individual = handoff.firm_individual
   AND candidate.date_issued = handoff.date_issued
   AND candidate.amount_original IS NOT DISTINCT FROM handoff.amount_original
   AND upper(candidate.currency) = upper(handoff.currency)
   AND candidate.source_url = handoff.source_url
   AND candidate.notice_url = handoff.target_notice_url
)
SELECT
  candidate.id::text AS id,
  COALESCE(
    handoff.public_case_id,
    source_registry.legacy_public_case_id,
    source_registry.public_case_id::text,
    fingerprint_alias.public_case_id::text,
    candidate.canonical_case_id
  ) AS public_case_id,
  candidate.canonical_case_id,
  upper(candidate.regulator) AS regulator,
  candidate.firm_individual,
  candidate.date_issued,
  candidate.amount_original,
  candidate.amount_gbp,
  candidate.currency,
  candidate.notice_url,
  candidate.source_url,
  handoff.old_source_row_id AS continuity_from_source_row_id,
  (handoff.target_source_row_id IS NOT NULL) AS continuity_handoff_applied,
  handoff.retired_public_case_id,
  handoff_validation.matched_handoffs,
  CASE WHEN upper(candidate.regulator) = 'FMANZ' THEN concat_ws(
      '|',
      upper(candidate.regulator),
      regexp_replace(lower(trim(COALESCE(candidate.firm_individual, ''))), '[[:space:]]+', ' ', 'g'),
      candidate.date_issued::text,
      CASE
        WHEN upper(candidate.regulator) = 'FMANZ'
         AND (
           (candidate.firm_individual = 'BNZ' AND candidate.date_issued = DATE '2026-06-22' AND candidate.amount_original IS NULL AND upper(candidate.currency) = 'NZD' AND candidate.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/bnz/') OR
           (candidate.firm_individual = 'Murray McClune' AND candidate.date_issued = DATE '2025-10-06' AND candidate.amount_original IS NULL AND upper(candidate.currency) = 'NZD' AND candidate.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/murray-mcclune/') OR
           (candidate.firm_individual = 'Du Val' AND candidate.date_issued = DATE '2025-08-14' AND candidate.amount_original IS NULL AND upper(candidate.currency) = 'NZD' AND candidate.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/du-val/') OR
           (candidate.firm_individual = 'Vivier and Company Limited (Vivier)' AND candidate.date_issued = DATE '2017-06-08' AND candidate.amount_original IS NULL AND upper(candidate.currency) = 'NZD' AND candidate.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/vivier/') OR
           (candidate.firm_individual = 'Milford Asset Management Limited' AND candidate.date_issued = DATE '2015-06-18' AND candidate.amount_original IS NULL AND upper(candidate.currency) = 'NZD' AND candidate.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/milford-asset-management-limited-settlement-agreement/') OR
           (candidate.firm_individual = 'AIA' AND candidate.date_issued = DATE '2022-09-30' AND candidate.amount_original = 700000.00 AND upper(candidate.currency) = 'NZD' AND candidate.source_url = 'https://www.fma.govt.nz/about-us/enforcement/cases/aia/')
         )
          THEN public.normalise_regulatory_evidence_url(candidate.source_url)
        ELSE public.normalise_regulatory_evidence_url(
          COALESCE(NULLIF(candidate.notice_url, ''), NULLIF(candidate.source_url, ''), '')
        )
      END,
      COALESCE(candidate.amount_original::text, 'undisclosed'),
      upper(COALESCE(candidate.currency, ''))
    ) END AS fmanz_source_duplicate_identity,
  candidate.duplicate_count,
  candidate.id::text IN (SELECT id FROM current_valid) AS already_currently_public
FROM candidate_canonical AS candidate
LEFT JOIN continuity_handoffs AS handoff
  ON candidate.id::text = handoff.target_source_row_id
 AND upper(candidate.regulator) = 'FMANZ'
 AND candidate.firm_individual = handoff.firm_individual
 AND candidate.date_issued = handoff.date_issued
 AND candidate.amount_original IS NOT DISTINCT FROM handoff.amount_original
 AND upper(candidate.currency) = upper(handoff.currency)
 AND candidate.source_url = handoff.source_url
 AND candidate.notice_url = handoff.target_notice_url
LEFT JOIN public.regulatory_case_registry AS source_registry
  ON source_registry.source_row_id = candidate.id::text
LEFT JOIN public.regulatory_case_aliases AS fingerprint_alias
  ON fingerprint_alias.fingerprint = candidate.canonical_case_id
CROSS JOIN handoff_validation
WHERE NOT EXISTS (
  SELECT 1
  FROM public.regulatory_case_suppressions AS suppression
  WHERE suppression.source_row_id = candidate.id::text
)
ORDER BY upper(candidate.regulator), candidate.date_issued DESC, candidate.id
$candidate$, regexp_replace(patched.patched_definition, ';[[:space:]]*$', '')) END AS candidate_sql
FROM patched;

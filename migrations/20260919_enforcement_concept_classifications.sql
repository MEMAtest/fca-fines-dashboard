-- Versioned, deterministic classifications for cross-regulator concepts.
-- Source breach labels remain untouched; this table records the derived
-- concept, the evidence fields that matched and the model version.

CREATE TABLE IF NOT EXISTS public.enforcement_concept_classifications (
  regulator text NOT NULL,
  canonical_case_id text NOT NULL,
  concept text NOT NULL,
  classification_version text NOT NULL,
  match_reasons text[] NOT NULL DEFAULT '{}',
  original_breach_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_breach_type text,
  source_summary text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regulator, canonical_case_id, concept, classification_version)
);

CREATE INDEX IF NOT EXISTS enforcement_concept_lookup_idx
  ON public.enforcement_concept_classifications (concept, classification_version);

CREATE OR REPLACE FUNCTION public.refresh_enforcement_concept_classifications()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  INSERT INTO public.enforcement_concept_classifications (
    regulator,
    canonical_case_id,
    concept,
    classification_version,
    match_reasons,
    original_breach_categories,
    source_breach_type,
    source_summary,
    classified_at
  )
  SELECT
    upper(regulator),
    public_case_id,
    'CYBER_OPERATIONAL_RESILIENCE',
    '2026-09-19.v1',
    array_remove(ARRAY[
      CASE WHEN COALESCE(breach_type, '') ILIKE ANY(ARRAY[
        '%data breach%', '%cyber incident%', '%ransomware%', '%cybersecurity%',
        '%ict risk%', '%information security%', '%technology risk%',
        '%operational resilience%'
      ]) THEN 'breachType' END,
      CASE WHEN COALESCE(summary, '') ILIKE ANY(ARRAY[
        '%data breach%', '%cyber incident%', '%ransomware%', '%cybersecurity%',
        '%ict risk%', '%information security%', '%technology risk%',
        '%operational resilience%'
      ]) THEN 'summary' END,
      CASE WHEN COALESCE(breach_categories::text, '') ILIKE ANY(ARRAY[
        '%data breach%', '%cyber incident%', '%ransomware%', '%cybersecurity%',
        '%ict risk%', '%information security%', '%technology risk%',
        '%operational resilience%'
      ]) THEN 'breachCategory' END
    ], NULL)::text[],
    COALESCE(breach_categories, '[]'::jsonb),
    breach_type,
    summary,
    now()
  FROM public.all_regulatory_fines_trusted
  WHERE public_case_id IS NOT NULL
    AND (
      COALESCE(breach_type, '') ILIKE ANY(ARRAY[
        '%data breach%', '%cyber incident%', '%ransomware%', '%cybersecurity%',
        '%ict risk%', '%information security%', '%technology risk%',
        '%operational resilience%'
      ])
      OR COALESCE(summary, '') ILIKE ANY(ARRAY[
        '%data breach%', '%cyber incident%', '%ransomware%', '%cybersecurity%',
        '%ict risk%', '%information security%', '%technology risk%',
        '%operational resilience%'
      ])
      OR COALESCE(breach_categories::text, '') ILIKE ANY(ARRAY[
        '%data breach%', '%cyber incident%', '%ransomware%', '%cybersecurity%',
        '%ict risk%', '%information security%', '%technology risk%',
        '%operational resilience%'
      ])
    )
  ON CONFLICT (regulator, canonical_case_id, concept, classification_version)
  DO UPDATE SET
    match_reasons = EXCLUDED.match_reasons,
    original_breach_categories = EXCLUDED.original_breach_categories,
    source_breach_type = EXCLUDED.source_breach_type,
    source_summary = EXCLUDED.source_summary,
    classified_at = EXCLUDED.classified_at;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

SELECT public.refresh_enforcement_concept_classifications();

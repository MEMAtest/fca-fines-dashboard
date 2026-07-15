-- Canonical enforcement evidence layer.
--
-- The source materialised view intentionally preserves every ingested row. This
-- second materialised view is the application-facing source of truth: it applies
-- verified amount corrections, collapses repeat ingestions of the same official
-- action, and retains provenance for audit and review.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.normalise_regulatory_evidence_url(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(trim(COALESCE(value, '')), '[?#].*$', ''),
      '/+$',
      ''
    )
  );
$$;

CREATE TABLE IF NOT EXISTS public.regulatory_amount_overrides (
  regulator text NOT NULL,
  evidence_url text NOT NULL,
  amount_original numeric(20, 2),
  currency text NOT NULL,
  amount_gbp numeric(20, 2),
  amount_eur numeric(20, 2),
  verification_url text NOT NULL,
  reason text NOT NULL,
  quality_status text NOT NULL DEFAULT 'verified_override',
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regulator, evidence_url),
  CHECK (regulator = upper(regulator)),
  CHECK (evidence_url = public.normalise_regulatory_evidence_url(evidence_url))
);

ALTER TABLE public.regulatory_amount_overrides
  ADD COLUMN IF NOT EXISTS quality_status text NOT NULL DEFAULT 'verified_override';

-- These corrections are restricted to values confirmed in the linked official
-- regulator publication. A NULL amount represents an order that imposed no
-- monetary penalty, rather than an unknown value.
INSERT INTO public.regulatory_amount_overrides (
  regulator,
  evidence_url,
  amount_original,
  currency,
  amount_gbp,
  amount_eur,
  verification_url,
  reason,
  quality_status,
  verified_at
)
VALUES
  (
    'FINRA',
    public.normalise_regulatory_evidence_url('https://www.finra.org/sites/default/files/fda_documents/2023079913301%20U.S.%20Bancorp%20Investments%2C%20Inc.%20CRD%2017868%20AWC%20kess%20%282025-1758932396464%29.pdf'),
    500000,
    'USD',
    390000,
    460000,
    'https://www.finra.org/sites/default/files/2025-10/disciplinary-actions-october-2025.pdf',
    'Official FINRA action records a $500,000 fine. The source parser had selected a $25,000 SAR threshold and then mis-scaled it.',
    'verified_override',
    '2026-07-15T00:00:00Z'
  ),
  (
    'FMANZ',
    public.normalise_regulatory_evidence_url('https://www.fma.govt.nz/assets/Enforcement/Judgements/FMA-v-AA-Insurance-Ltd.pdf'),
    6175000,
    'NZD',
    2902250,
    3272750,
    'https://www.fma.govt.nz/about-us/enforcement/cases/aa-insurance-limited-aai/',
    'Official FMA case page records a $6.175 million penalty. The source parser had treated the decimal point as a thousands separator.',
    'verified_override',
    '2026-07-15T00:00:00Z'
  ),
  (
    'AMF',
    public.normalise_regulatory_evidence_url('https://www.amf-france.org/en/news-publications/news-releases/enforcement-committee-news-releases/amfs-enforcement-committee-fines-asset-management-company-specialising-real-estate-breaches-its'),
    600000,
    'EUR',
    510000,
    600000,
    'https://www.amf-france.org/en/news-publications/news-releases/enforcement-committee-news-releases/amfs-enforcement-committee-fines-asset-management-company-specialising-real-estate-breaches-its',
    'Official AMF release records a EUR 600,000 penalty. The source parser had added EUR 1.5 billion of assets under management.',
    'verified_override',
    '2026-07-15T00:00:00Z'
  ),
  (
    'SEBI',
    public.normalise_regulatory_evidence_url('https://www.sebi.gov.in/sebi_data/attachdocs/dec-2025/b.Order_in_the_matter_Adani_Green_Energy.pdf'),
    NULL,
    'INR',
    NULL,
    NULL,
    'https://www.sebi.gov.in/sebi_data/attachdocs/dec-2025/b.Order_in_the_matter_Adani_Green_Energy.pdf',
    'Official SEBI order disposes of the matter without disgorgement or any monetary penalty. Historical ingestion selected unrelated trading values.',
    'verified_override',
    '2026-07-15T00:00:00Z'
  )
ON CONFLICT (regulator, evidence_url) DO UPDATE SET
  amount_original = EXCLUDED.amount_original,
  currency = EXCLUDED.currency,
  amount_gbp = EXCLUDED.amount_gbp,
  amount_eur = EXCLUDED.amount_eur,
  verification_url = EXCLUDED.verification_url,
  reason = EXCLUDED.reason,
  quality_status = EXCLUDED.quality_status,
  verified_at = EXCLUDED.verified_at,
  updated_at = now();

DROP MATERIALIZED VIEW IF EXISTS public.all_regulatory_fines_canonical;

CREATE MATERIALIZED VIEW public.all_regulatory_fines_canonical AS
WITH corrected AS (
  SELECT
    fines.id,
    fines.regulator,
    fines.regulator_full_name,
    fines.country_code,
    fines.country_name,
    fines.firm_individual,
    fines.firm_category,
    CASE WHEN override.regulator IS NOT NULL THEN override.amount_original ELSE fines.amount_original END AS amount_original,
    CASE WHEN override.regulator IS NOT NULL THEN override.currency ELSE fines.currency END AS currency,
    CASE WHEN override.regulator IS NOT NULL THEN override.amount_gbp ELSE fines.amount_gbp END AS amount_gbp,
    CASE WHEN override.regulator IS NOT NULL THEN override.amount_eur ELSE fines.amount_eur END AS amount_eur,
    fines.date_issued,
    fines.year_issued,
    fines.month_issued,
    fines.breach_type,
    fines.breach_categories,
    fines.summary,
    fines.notice_url,
    fines.source_url,
    fines.created_at,
    fines.search_vector,
    public.normalise_regulatory_evidence_url(
      COALESCE(NULLIF(fines.notice_url, ''), NULLIF(fines.source_url, ''), '')
    ) AS normalised_evidence_url,
    override.regulator IS NOT NULL AS has_verified_amount_override,
    override.verification_url AS amount_verification_url,
    override.reason AS amount_override_reason,
    override.quality_status AS override_quality_status
  FROM public.all_regulatory_fines AS fines
  LEFT JOIN public.regulatory_amount_overrides AS override
    ON override.regulator = upper(fines.regulator)
   AND override.evidence_url = public.normalise_regulatory_evidence_url(
     COALESCE(NULLIF(fines.notice_url, ''), NULLIF(fines.source_url, ''), '')
   )
), identified AS (
  SELECT
    corrected.*,
    -- Keep the identity deliberately strict. Even where two rows point to the
    -- same publication, amount and breach must also agree before they collapse;
    -- one official order can contain several separate sanctions.
    concat_ws(
      '|',
      upper(corrected.regulator),
      regexp_replace(lower(trim(COALESCE(corrected.firm_individual, ''))), '[[:space:]]+', ' ', 'g'),
      corrected.date_issued::text,
      corrected.normalised_evidence_url,
      COALESCE(corrected.amount_original::text, 'undisclosed'),
      upper(COALESCE(corrected.currency, '')),
      regexp_replace(lower(trim(COALESCE(corrected.breach_type, ''))), '[[:space:]]+', ' ', 'g')
    ) AS canonical_identity
  FROM corrected
), ranked AS (
  SELECT
    identified.*,
    row_number() OVER (
      PARTITION BY identified.canonical_identity
      ORDER BY
        (
          (identified.amount_gbp IS NOT NULL)::int * 4
          + (NULLIF(identified.summary, '') IS NOT NULL)::int * 2
          + (NULLIF(identified.breach_type, '') IS NOT NULL)::int
          + (NULLIF(identified.notice_url, '') IS NOT NULL)::int
        ) DESC,
        identified.created_at DESC NULLS LAST,
        identified.id DESC
    ) AS canonical_rank,
    count(*) OVER (PARTITION BY identified.canonical_identity)::integer AS duplicate_count
  FROM identified
)
SELECT
  id,
  regulator,
  regulator_full_name,
  country_code,
  country_name,
  firm_individual,
  firm_category,
  amount_original,
  currency,
  amount_gbp,
  amount_eur,
  date_issued,
  year_issued,
  month_issued,
  breach_type,
  breach_categories,
  summary,
  notice_url,
  source_url,
  created_at,
  search_vector,
  md5(canonical_identity) AS canonical_case_id,
  duplicate_count,
  CASE
    WHEN has_verified_amount_override THEN override_quality_status
    WHEN amount_original IS NULL THEN 'not_disclosed'
    ELSE 'reported'
  END AS amount_quality,
  (amount_gbp >= 1000000000 AND NOT has_verified_amount_override) AS requires_amount_review,
  amount_verification_url,
  amount_override_reason
FROM ranked
WHERE canonical_rank = 1;

CREATE UNIQUE INDEX idx_all_regulatory_fines_canonical_case
  ON public.all_regulatory_fines_canonical(canonical_case_id);
CREATE UNIQUE INDEX idx_all_regulatory_fines_canonical_id
  ON public.all_regulatory_fines_canonical(id);
CREATE INDEX idx_all_regulatory_fines_canonical_regulator
  ON public.all_regulatory_fines_canonical(regulator);
CREATE INDEX idx_all_regulatory_fines_canonical_country
  ON public.all_regulatory_fines_canonical(country_code);
CREATE INDEX idx_all_regulatory_fines_canonical_date
  ON public.all_regulatory_fines_canonical(date_issued DESC);
CREATE INDEX idx_all_regulatory_fines_canonical_year
  ON public.all_regulatory_fines_canonical(year_issued);
CREATE INDEX idx_all_regulatory_fines_canonical_amount_gbp
  ON public.all_regulatory_fines_canonical(amount_gbp DESC NULLS LAST);
CREATE INDEX idx_all_regulatory_fines_canonical_amount_eur
  ON public.all_regulatory_fines_canonical(amount_eur DESC NULLS LAST);
CREATE INDEX idx_all_regulatory_fines_canonical_search_vector
  ON public.all_regulatory_fines_canonical USING GIN(search_vector);

CREATE OR REPLACE FUNCTION public.refresh_all_fines()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.all_regulatory_fines;
  REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical;
END;
$$ LANGUAGE plpgsql;

GRANT SELECT ON public.all_regulatory_fines_canonical TO fca_app;
GRANT SELECT ON public.all_regulatory_fines_canonical TO monitor_readonly;
GRANT SELECT ON public.regulatory_amount_overrides TO fca_app;
GRANT SELECT ON public.regulatory_amount_overrides TO monitor_readonly;

COMMENT ON MATERIALIZED VIEW public.all_regulatory_fines_canonical IS
  'Application-facing enforcement evidence with verified amount corrections and canonical case deduplication';
COMMENT ON TABLE public.regulatory_amount_overrides IS
  'Audited amount corrections supported by an official regulator publication';

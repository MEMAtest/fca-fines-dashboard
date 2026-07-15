-- Restrict JFSC product evidence to the six official actions that have been
-- reviewed for entity, imposed amount and action date. Historical sitemap
-- ingestion included duplicates, pre-discount values and non-enforcement news.

DO $$
DECLARE
  reviewed_count integer;
BEGIN
  WITH reviewed(firm_individual, date_issued, amount, evidence_url) AS (
    VALUES
      ('Garfield Bennett Trust Company Limited', DATE '2025-07-31', 86803.19::numeric, 'https://www.jerseyfsc.org/news-and-events/garfield-bennett-trust-company-limited/'),
      ('Belasko Jersey Limited', DATE '2024-09-20', 19211.73::numeric, 'https://www.jerseyfsc.org/news-and-events/belasko-jersey-limited/'),
      ('Lloyds Bank Corporate Markets Plc, Jersey Branch', DATE '2022-08-04', 498000::numeric, 'https://www.jerseyfsc.org/news-and-events/lloyds-bank-corporate-markets-plc-jersey-branch-lbcm-jersey-branch/'),
      ('IQ EQ (Jersey) Limited (formerly, First Names (Jersey) Limited)', DATE '2022-06-17', 803661.17::numeric, 'https://www.jerseyfsc.org/news-and-events/iq-eq-jersey-limited-formerly-first-names-jersey-limited/'),
      ('Equity Trust (Jersey) Limited', DATE '2020-05-14', 115575::numeric, 'https://www.jerseyfsc.org/news-and-events/equity-trust-jersey-limited-equity/'),
      ('Sanne Fiduciary Services Limited', DATE '2019-07-17', 381010::numeric, 'https://www.jerseyfsc.org/news-and-events/jfsc-enforces-first-financial-penalty-on-local-firm/')
  )
  SELECT COUNT(*)::integer
  INTO reviewed_count
  FROM public.eu_fines AS fines
  JOIN reviewed
    ON fines.firm_individual = reviewed.firm_individual
   AND fines.date_issued = reviewed.date_issued
   AND fines.amount = reviewed.amount
   AND public.normalise_regulatory_evidence_url(fines.final_notice_url)
       = public.normalise_regulatory_evidence_url(reviewed.evidence_url)
   AND public.normalise_regulatory_evidence_url(fines.source_url)
       = public.normalise_regulatory_evidence_url(reviewed.evidence_url)
  WHERE upper(fines.regulator) = 'JFSC';

  IF reviewed_count <> 6 THEN
    RAISE EXCEPTION 'JFSC cleanup stopped: expected 6 reviewed source rows, found %', reviewed_count;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.regulatory_evidence_quarantine (
  source_id uuid PRIMARY KEY,
  regulator text NOT NULL,
  source_record jsonb NOT NULL,
  quarantine_reason text NOT NULL,
  quarantined_at timestamptz NOT NULL DEFAULT now()
);

WITH reviewed(firm_individual, date_issued, amount, evidence_url) AS (
  VALUES
    ('Garfield Bennett Trust Company Limited', DATE '2025-07-31', 86803.19::numeric, 'https://www.jerseyfsc.org/news-and-events/garfield-bennett-trust-company-limited/'),
    ('Belasko Jersey Limited', DATE '2024-09-20', 19211.73::numeric, 'https://www.jerseyfsc.org/news-and-events/belasko-jersey-limited/'),
    ('Lloyds Bank Corporate Markets Plc, Jersey Branch', DATE '2022-08-04', 498000::numeric, 'https://www.jerseyfsc.org/news-and-events/lloyds-bank-corporate-markets-plc-jersey-branch-lbcm-jersey-branch/'),
    ('IQ EQ (Jersey) Limited (formerly, First Names (Jersey) Limited)', DATE '2022-06-17', 803661.17::numeric, 'https://www.jerseyfsc.org/news-and-events/iq-eq-jersey-limited-formerly-first-names-jersey-limited/'),
    ('Equity Trust (Jersey) Limited', DATE '2020-05-14', 115575::numeric, 'https://www.jerseyfsc.org/news-and-events/equity-trust-jersey-limited-equity/'),
    ('Sanne Fiduciary Services Limited', DATE '2019-07-17', 381010::numeric, 'https://www.jerseyfsc.org/news-and-events/jfsc-enforces-first-financial-penalty-on-local-firm/')
)
INSERT INTO public.regulatory_evidence_quarantine (
  source_id,
  regulator,
  source_record,
  quarantine_reason
)
SELECT
  fines.id,
  fines.regulator,
  to_jsonb(fines),
  'Legacy JFSC sitemap ingestion outside the reviewed official archive'
FROM public.eu_fines AS fines
WHERE upper(fines.regulator) = 'JFSC'
  AND NOT EXISTS (
    SELECT 1
    FROM reviewed
    WHERE fines.firm_individual = reviewed.firm_individual
      AND fines.date_issued = reviewed.date_issued
      AND fines.amount = reviewed.amount
      AND public.normalise_regulatory_evidence_url(fines.final_notice_url)
          = public.normalise_regulatory_evidence_url(reviewed.evidence_url)
      AND public.normalise_regulatory_evidence_url(fines.source_url)
          = public.normalise_regulatory_evidence_url(reviewed.evidence_url)
  )
ON CONFLICT (source_id) DO NOTHING;

WITH reviewed(firm_individual, date_issued, amount, evidence_url) AS (
  VALUES
    ('Garfield Bennett Trust Company Limited', DATE '2025-07-31', 86803.19::numeric, 'https://www.jerseyfsc.org/news-and-events/garfield-bennett-trust-company-limited/'),
    ('Belasko Jersey Limited', DATE '2024-09-20', 19211.73::numeric, 'https://www.jerseyfsc.org/news-and-events/belasko-jersey-limited/'),
    ('Lloyds Bank Corporate Markets Plc, Jersey Branch', DATE '2022-08-04', 498000::numeric, 'https://www.jerseyfsc.org/news-and-events/lloyds-bank-corporate-markets-plc-jersey-branch-lbcm-jersey-branch/'),
    ('IQ EQ (Jersey) Limited (formerly, First Names (Jersey) Limited)', DATE '2022-06-17', 803661.17::numeric, 'https://www.jerseyfsc.org/news-and-events/iq-eq-jersey-limited-formerly-first-names-jersey-limited/'),
    ('Equity Trust (Jersey) Limited', DATE '2020-05-14', 115575::numeric, 'https://www.jerseyfsc.org/news-and-events/equity-trust-jersey-limited-equity/'),
    ('Sanne Fiduciary Services Limited', DATE '2019-07-17', 381010::numeric, 'https://www.jerseyfsc.org/news-and-events/jfsc-enforces-first-financial-penalty-on-local-firm/')
)
DELETE FROM public.eu_fines AS fines
WHERE upper(fines.regulator) = 'JFSC'
  AND NOT EXISTS (
    SELECT 1
    FROM reviewed
    WHERE fines.firm_individual = reviewed.firm_individual
      AND fines.date_issued = reviewed.date_issued
      AND fines.amount = reviewed.amount
      AND public.normalise_regulatory_evidence_url(fines.final_notice_url)
          = public.normalise_regulatory_evidence_url(reviewed.evidence_url)
      AND public.normalise_regulatory_evidence_url(fines.source_url)
          = public.normalise_regulatory_evidence_url(reviewed.evidence_url)
  );

SELECT public.refresh_all_fines();

DO $$
DECLARE
  canonical_count integer;
BEGIN
  SELECT COUNT(*)::integer
  INTO canonical_count
  FROM public.all_regulatory_fines_canonical
  WHERE upper(regulator) = 'JFSC';

  IF canonical_count <> 6 THEN
    RAISE EXCEPTION 'JFSC cleanup verification failed: expected 6 canonical rows, found %', canonical_count;
  END IF;
END $$;

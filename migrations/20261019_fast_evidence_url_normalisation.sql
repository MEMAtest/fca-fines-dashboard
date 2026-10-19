-- Preserve the case-defining FSS URL identity introduced in
-- 20261017_fss_evidence_url_identity.sql, while making the generic path a
-- scalar SQL expression that PostgreSQL can inline into evidence joins.
-- Keep all FSS-only query parsing behind its endpoint-specific CASE arms.
BEGIN;

CREATE OR REPLACE FUNCTION public.normalise_regulatory_evidence_url(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(
    CASE
      WHEN trim(COALESCE(value, '')) ~* '^https?://(www\.)?fss\.or\.kr/fss\.hpdownload\?' THEN
        CASE
          WHEN (regexp_match(
            substring(trim(COALESCE(value, '')), '\?(.*)$'),
            '(^|&)file=([^&]+)'
          )) IS NOT NULL
          AND (regexp_match(
            substring(trim(COALESCE(value, '')), '\?(.*)$'),
            '(^|&)path=([^&]+)'
          )) IS NOT NULL
          THEN lower(split_part(trim(COALESCE(value, '')), '?', 1))
            || '?file=' || replace(lower((regexp_match(
              substring(trim(COALESCE(value, '')), '\?(.*)$'),
              '(^|&)file=([^&]+)'
            ))[2]), '%20', '+')
            || '&path=' || replace(lower((regexp_match(
              substring(trim(COALESCE(value, '')), '\?(.*)$'),
              '(^|&)path=([^&]+)'
            ))[2]), '%2f', '/')
          ELSE regexp_replace(trim(COALESCE(value, '')), '[?#].*$', '')
        END
      WHEN trim(COALESCE(value, '')) ~* '^https?://(www\.)?fss\.or\.kr/fss/job/openInfo/view\.do\?' THEN
        CASE
          WHEN (regexp_match(
            substring(trim(COALESCE(value, '')), '\?(.*)$'),
            '(^|&)menuNo=([^&]+)'
          )) IS NOT NULL
          AND (regexp_match(
            substring(trim(COALESCE(value, '')), '\?(.*)$'),
            '(^|&)examMgmtNo=([^&]+)'
          )) IS NOT NULL
          AND (regexp_match(
            substring(trim(COALESCE(value, '')), '\?(.*)$'),
            '(^|&)emOpenSeq=([^&]+)'
          )) IS NOT NULL
          THEN lower(split_part(trim(COALESCE(value, '')), '?', 1))
            || '?emOpenSeq=' || (regexp_match(
              substring(trim(COALESCE(value, '')), '\?(.*)$'),
              '(^|&)emOpenSeq=([^&]+)'
            ))[2]
            || '&examMgmtNo=' || (regexp_match(
              substring(trim(COALESCE(value, '')), '\?(.*)$'),
              '(^|&)examMgmtNo=([^&]+)'
            ))[2]
            || '&menuNo=' || (regexp_match(
              substring(trim(COALESCE(value, '')), '\?(.*)$'),
              '(^|&)menuNo=([^&]+)'
            ))[2]
          ELSE regexp_replace(trim(COALESCE(value, '')), '[?#].*$', '')
        END
      ELSE regexp_replace(trim(COALESCE(value, '')), '[?#].*$', '')
    END,
    '/+$', ''
  ));
$$;

-- Guard the FSS identity contract and generic query stripping without changing
-- any row data or materialized view contents.
DO $$
BEGIN
  IF public.normalise_regulatory_evidence_url(
    'https://www.fss.or.kr/fss.hpdownload?path=/dtm/opn/&file=202400579_01_%ED%95%98%EB%82%98%EC%A6%9D%EA%B6%8C.pdf'
  ) = public.normalise_regulatory_evidence_url(
    'https://www.fss.or.kr/fss.hpdownload?path=/dtm/opn/&file=202400365_01_%ED%95%9C%EA%B5%AD%EC%97%90%EC%8A%A4%EC%A7%80%EC%A6%9D%EA%B6%8C.pdf'
  ) THEN
    RAISE EXCEPTION 'FSS sanction PDF evidence URLs still collide after normalization';
  END IF;

  IF public.normalise_regulatory_evidence_url(
    'https://www.fss.or.kr/fss.hpdownload?path=/dtm/opn/&file=202400579_01_%ED%95%98%EB%82%98%EC%A6%9D%EA%B6%8C.pdf'
  ) <> public.normalise_regulatory_evidence_url(
    'https://www.fss.or.kr/fss.hpdownload?file=202400579_01_%ED%95%98%EB%82%98%EC%A6%9D%EA%B6%8C.pdf&path=%2Fdtm%2Fopn%2F&cacheBust=ignored'
  ) THEN
    RAISE EXCEPTION 'FSS PDF identity changed when query order/irrelevant metadata changed';
  END IF;

  IF public.normalise_regulatory_evidence_url(
    'https://www.fss.or.kr/fss/job/openInfo/view.do?menuNo=200476&examMgmtNo=202400579&emOpenSeq=1'
  ) <> public.normalise_regulatory_evidence_url(
    'https://www.fss.or.kr/fss/job/openInfo/view.do?pageIndex=3&edate=2026-10-17&emOpenSeq=1&examMgmtNo=202400579&menuNo=200476'
  ) THEN
    RAISE EXCEPTION 'FSS detail identity changed when archive metadata changed';
  END IF;

  IF public.normalise_regulatory_evidence_url(
    'https://www.fss.or.kr/fss/job/openInfo/view.do?menuNo=200476&examMgmtNo=202400579&emOpenSeq=1'
  ) = public.normalise_regulatory_evidence_url(
    'https://www.fss.or.kr/fss/job/openInfo/view.do?menuNo=200476&examMgmtNo=202400365&emOpenSeq=1'
  ) THEN
    RAISE EXCEPTION 'FSS sanction detail URLs still collide after normalization';
  END IF;

  IF public.normalise_regulatory_evidence_url('https://example.org/action?id=1')
     <> public.normalise_regulatory_evidence_url('https://example.org/action?id=2') THEN
    RAISE EXCEPTION 'FSS URL normalization unexpectedly changed generic query stripping';
  END IF;
END;
$$;

COMMIT;

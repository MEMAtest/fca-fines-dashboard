-- FSS Korean sanction PDFs use query-parameter URLs where `file` identifies
-- the actual official case document. The generic canonical evidence helper
-- historically drops every query string, collapsing all /fss.hpdownload URLs
-- to one identity. Preserve and canonicalize only case-defining query
-- parameters for these official FSS routes; retain prior query-stripping
-- behavior for all other sources.
BEGIN;

CREATE OR REPLACE FUNCTION public.normalise_regulatory_evidence_url(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH parsed AS (
    SELECT
      trim(COALESCE(value, '')) AS raw_url,
      lower(split_part(trim(COALESCE(value, '')), '?', 1)) AS base_url,
      substring(trim(COALESCE(value, '')) FROM '\?(.*)$') AS query_string
  ), identities AS (
    SELECT
      parsed.*,
      regexp_match(query_string, '(^|&)file=([^&]+)') AS pdf_file,
      regexp_match(query_string, '(^|&)path=([^&]+)') AS pdf_path,
      regexp_match(query_string, '(^|&)menuNo=([^&]+)') AS menu_no,
      regexp_match(query_string, '(^|&)examMgmtNo=([^&]+)') AS exam_mgmt_no,
      regexp_match(query_string, '(^|&)emOpenSeq=([^&]+)') AS em_open_seq
    FROM parsed
  )
  SELECT lower(regexp_replace(
    CASE
      WHEN raw_url ~* '^https?://(www\.)?fss\.or\.kr/fss\.hpdownload\?'
        AND pdf_file IS NOT NULL AND pdf_path IS NOT NULL
      THEN base_url || '?file=' || replace(lower(pdf_file[2]), '%20', '+')
        || '&path=' || replace(lower(pdf_path[2]), '%2f', '/')
      WHEN raw_url ~* '^https?://(www\.)?fss\.or\.kr/fss/job/openInfo/view\.do\?'
        AND menu_no IS NOT NULL AND exam_mgmt_no IS NOT NULL AND em_open_seq IS NOT NULL
      THEN base_url || '?emOpenSeq=' || em_open_seq[2]
        || '&examMgmtNo=' || exam_mgmt_no[2] || '&menuNo=' || menu_no[2]
      ELSE regexp_replace(raw_url, '[?#].*$', '')
    END,
    '/+$', ''
  ))
  FROM identities;
$$;

-- Guard against reintroducing the cross-case collision. These are genuine
-- official FSS URL shapes observed in the 2026 archive.
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

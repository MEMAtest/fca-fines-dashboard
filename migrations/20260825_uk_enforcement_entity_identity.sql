-- Forward correction for the historical notice_url uniqueness migration.
-- A shared official document may describe multiple subjects, so identity is
-- regulator + subject + canonical notice/source URL, not URL alone.
ALTER TABLE uk_enforcement_actions
  ADD COLUMN IF NOT EXISTS source_identity_key TEXT;

UPDATE uk_enforcement_actions
SET source_identity_key = CONCAT(
  UPPER(TRIM(regulator)), '::',
  REGEXP_REPLACE(LOWER(TRIM(firm_individual)), '\s+', ' ', 'g'), '::',
  RTRIM(LOWER(COALESCE(NULLIF(notice_url, ''), source_url, '')), '/')
)
WHERE source_identity_key IS NULL OR source_identity_key = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM uk_enforcement_actions
    WHERE source_identity_key IS NOT NULL AND source_identity_key <> ''
    GROUP BY source_identity_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate entity-aware UK enforcement identities detected; review before applying the unique index';
  END IF;
END
$$;

-- Environments that applied the old migration may still have this unsafe
-- URL-only index. Drop only the index; preserve every row.
DROP INDEX IF EXISTS uk_enforcement_notice_url_idx;

CREATE INDEX IF NOT EXISTS idx_uk_enforcement_notice_url
  ON uk_enforcement_actions (notice_url)
  WHERE notice_url IS NOT NULL AND notice_url <> '';

-- Replace any earlier partial index with the full unique index required by
-- ON CONFLICT (source_identity_key) inference.
DROP INDEX IF EXISTS uk_enforcement_source_identity_idx;

CREATE UNIQUE INDEX IF NOT EXISTS uk_enforcement_source_identity_idx
  ON uk_enforcement_actions (source_identity_key);

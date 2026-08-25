-- A single official FCA release or PDF can name multiple subjects. Do not
-- delete or collapse rows by notice_url; loaders use the durable
-- source_identity_key (regulator, subject and canonical notice/source URL)
-- as their entity-aware idempotency key.
CREATE INDEX IF NOT EXISTS idx_uk_enforcement_notice_url
  ON uk_enforcement_actions (notice_url)
  WHERE notice_url IS NOT NULL AND notice_url <> '';

-- Migration: Add a subscription topic to alert_subscriptions
-- Description: Lets a single subscriber table carry both the existing fines
--   alerts and the new country-risk changes digest. Additive and non-breaking:
--   the column is nullable with a 'fines' default so every existing row keeps
--   its current behaviour and the fines path is unchanged.
-- Date: 2026-07-17

ALTER TABLE alert_subscriptions
  ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT 'fines'
    CHECK (topic IN ('fines', 'country-changes'));

-- Country-changes digests dedupe on the latest change date already sent, not a
-- fine id. A nullable date column keeps the fines columns (min_amount,
-- breach_types, last_notified_fine_id) untouched for that topic.
ALTER TABLE alert_subscriptions
  ADD COLUMN IF NOT EXISTS last_changes_date DATE;

CREATE INDEX IF NOT EXISTS idx_alert_subs_topic ON alert_subscriptions(topic);

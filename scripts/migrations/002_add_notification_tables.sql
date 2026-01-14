-- Migration: Add Notification Tables
-- Description: Email subscriptions for alerts, watchlists, and digests
-- Date: 2026-01-14

-- ============================================================================
-- Table 1: Alert Subscriptions
-- Users can subscribe to alerts based on fine criteria
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,

  -- Verification
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT UNIQUE,
  verification_expires_at TIMESTAMPTZ,

  -- Alert criteria
  min_amount NUMERIC(18,2),                    -- Notify when fine >= this amount
  breach_types TEXT[],                         -- Filter by breach types (NULL = all)

  -- Delivery preferences
  frequency TEXT DEFAULT 'immediate' CHECK (frequency IN ('immediate', 'daily', 'weekly')),

  -- Status & tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'unsubscribed')),
  unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  last_notified_at TIMESTAMPTZ,
  last_notified_fine_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_subs_email ON alert_subscriptions(email);
CREATE INDEX idx_alert_subs_status ON alert_subscriptions(status);
CREATE INDEX idx_alert_subs_verification ON alert_subscriptions(verification_token) WHERE verification_token IS NOT NULL;

-- ============================================================================
-- Table 2: Firm Watchlist
-- Users can watch specific firms for new fines
-- ============================================================================
CREATE TABLE IF NOT EXISTS firm_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,

  -- Verification
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT UNIQUE,
  verification_expires_at TIMESTAMPTZ,

  -- Firm to watch
  firm_name TEXT NOT NULL,
  firm_name_normalized TEXT NOT NULL,          -- Lowercase, trimmed for matching

  -- Status & tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'unsubscribed')),
  unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  last_notified_at TIMESTAMPTZ,
  last_notified_fine_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(email, firm_name_normalized)
);

CREATE INDEX idx_watchlist_email ON firm_watchlist(email);
CREATE INDEX idx_watchlist_firm ON firm_watchlist(firm_name_normalized);
CREATE INDEX idx_watchlist_status ON firm_watchlist(status);
CREATE INDEX idx_watchlist_verification ON firm_watchlist(verification_token) WHERE verification_token IS NOT NULL;

-- ============================================================================
-- Table 3: Digest Subscriptions
-- Users can subscribe to weekly/monthly digest emails
-- ============================================================================
CREATE TABLE IF NOT EXISTS digest_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,

  -- Verification
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT UNIQUE,
  verification_expires_at TIMESTAMPTZ,

  -- Preferences
  frequency TEXT DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'monthly')),

  -- Status & tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'unsubscribed')),
  unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  last_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_digest_email ON digest_subscriptions(email);
CREATE INDEX idx_digest_status ON digest_subscriptions(status);
CREATE INDEX idx_digest_verification ON digest_subscriptions(verification_token) WHERE verification_token IS NOT NULL;

-- ============================================================================
-- Table 4: Notification Log
-- Track sent notifications for deduplication and analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,

  -- Notification details
  notification_type TEXT NOT NULL CHECK (notification_type IN ('alert', 'watchlist', 'digest', 'verification')),
  subject TEXT,
  fine_ids UUID[],                             -- Which fines were included

  -- Delivery status
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
  ses_message_id TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_log_email ON notification_log(email);
CREATE INDEX idx_notif_log_type ON notification_log(notification_type);
CREATE INDEX idx_notif_log_created ON notification_log(created_at DESC);

-- ============================================================================
-- Trigger function for updated_at (if not exists)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_alert_subs_updated_at ON alert_subscriptions;
CREATE TRIGGER update_alert_subs_updated_at
  BEFORE UPDATE ON alert_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_watchlist_updated_at ON firm_watchlist;
CREATE TRIGGER update_watchlist_updated_at
  BEFORE UPDATE ON firm_watchlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_digest_updated_at ON digest_subscriptions;
CREATE TRIGGER update_digest_updated_at
  BEFORE UPDATE ON digest_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

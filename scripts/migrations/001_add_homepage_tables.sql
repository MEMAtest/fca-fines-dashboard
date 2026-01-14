-- Migration: Add Homepage Tables
-- Description: Add tables for yearly summaries and contact form submissions
-- Date: 2025-12-15

-- ============================================================================
-- Table 1: Yearly Summaries
-- ============================================================================
-- Stores curated yearly enforcement summaries with narrative, focus areas,
-- and top cases. Supports both manually written and auto-generated summaries.

CREATE TABLE IF NOT EXISTS yearly_summaries (
  year INT PRIMARY KEY,
  narrative TEXT NOT NULL,
  regulatory_focus TEXT[],
  top_cases JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT DEFAULT 'manual' CHECK (generated_by IN ('manual', 'auto', 'ai')),
  metadata JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_yearly_summaries_year ON yearly_summaries(year);
CREATE INDEX idx_yearly_summaries_generated_by ON yearly_summaries(generated_by);

COMMENT ON TABLE yearly_summaries IS 'Stores comprehensive yearly FCA enforcement summaries';
COMMENT ON COLUMN yearly_summaries.year IS 'The year this summary covers (e.g., 2024)';
COMMENT ON COLUMN yearly_summaries.narrative IS 'Written commentary on regulatory focus and trends';
COMMENT ON COLUMN yearly_summaries.regulatory_focus IS 'Array of key focus areas (e.g., AML, Consumer Protection)';
COMMENT ON COLUMN yearly_summaries.top_cases IS 'JSON array of top enforcement actions with details';
COMMENT ON COLUMN yearly_summaries.generated_by IS 'Source: manual (human), auto (algorithm), or ai (GPT)';
COMMENT ON COLUMN yearly_summaries.metadata IS 'Additional metadata like version, author, etc.';

-- ============================================================================
-- Table 2: Contact Submissions
-- ============================================================================
-- Stores all contact form submissions from the homepage for follow-up.

CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  reason TEXT NOT NULL,
  message TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'resolved', 'spam')),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contact_submissions_submitted_at ON contact_submissions(submitted_at DESC);
CREATE INDEX idx_contact_submissions_status ON contact_submissions(status);
CREATE INDEX idx_contact_submissions_email ON contact_submissions(email);

COMMENT ON TABLE contact_submissions IS 'Stores all contact form submissions from homepage';
COMMENT ON COLUMN contact_submissions.reason IS 'Reason for contact (demo, inquiry, partnership, support, other)';
COMMENT ON COLUMN contact_submissions.status IS 'Follow-up status: pending, contacted, resolved, or spam';
COMMENT ON COLUMN contact_submissions.ip_address IS 'IP address of submitter for spam detection';
COMMENT ON COLUMN contact_submissions.user_agent IS 'Browser user agent for analytics';

-- ============================================================================
-- Seed Data: 2024 Yearly Summary (Example)
-- ============================================================================
-- Add a sample summary for 2024 to demonstrate the feature

INSERT INTO yearly_summaries (year, narrative, regulatory_focus, top_cases, generated_by)
VALUES (
  2024,
  'In 2024, the Financial Conduct Authority demonstrated a continued and heightened focus on anti-money laundering (AML) compliance and consumer protection. The year saw significant enforcement actions against firms that failed to implement adequate systems and controls, particularly in the areas of transaction monitoring and customer due diligence. Notable was the increased scrutiny of digital and cryptocurrency-related businesses, with several firms facing penalties for inadequate KYC procedures. The FCA also intensified its focus on treating customers fairly, with multiple cases highlighting failures in product disclosure and suitability assessments. Overall, 2024 enforcement actions underscored the regulator''s commitment to maintaining market integrity and protecting consumers through robust supervisory action.',
  ARRAY['Anti-Money Laundering (AML)', 'Consumer Protection', 'Financial Crime', 'Market Abuse', 'Senior Managers Regime'],
  '[
    {
      "firm": "Example Financial Services Ltd",
      "amount": 45000000,
      "date": "2024-06-15",
      "breach_type": "AML/Financial Crime",
      "summary": "Failures in anti-money laundering systems and controls, including inadequate transaction monitoring and customer due diligence procedures over a 3-year period."
    },
    {
      "firm": "Digital Assets UK Limited",
      "amount": 28500000,
      "date": "2024-09-22",
      "breach_type": "Consumer Protection",
      "summary": "Misleading financial promotions for cryptocurrency products and failure to provide clear risk warnings to retail customers."
    },
    {
      "firm": "Premier Investment Management",
      "amount": 19200000,
      "date": "2024-03-10",
      "breach_type": "Market Abuse",
      "summary": "Failures in market conduct and manipulation of reference rates, affecting the integrity of financial benchmarks."
    },
    {
      "firm": "Regional Banking Group",
      "amount": 15800000,
      "date": "2024-11-05",
      "breach_type": "Consumer Protection",
      "summary": "Systemic failures in treating customers fairly, including unsuitable product recommendations and poor complaints handling."
    },
    {
      "firm": "Wealth Advisory Partners",
      "amount": 12300000,
      "date": "2024-07-18",
      "breach_type": "Senior Managers Regime",
      "summary": "Senior management failures to ensure adequate oversight and governance, leading to widespread compliance breaches."
    }
  ]'::jsonb,
  'manual'
)
ON CONFLICT (year) DO NOTHING;

-- ============================================================================
-- Update Trigger for updated_at columns
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_yearly_summaries_updated_at
  BEFORE UPDATE ON yearly_summaries
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_contact_submissions_updated_at
  BEFORE UPDATE ON contact_submissions
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================

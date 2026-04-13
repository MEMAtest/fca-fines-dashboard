-- FCA Fines Test Database Fixtures
-- Run this to seed test databases with known data

-- Clean existing test data
DELETE FROM fcafines.fca_fines WHERE content_hash LIKE 'fixture-%';
DELETE FROM horizon_scanning.fca_fines WHERE fine_reference LIKE 'FIXTURE-%';

-- Insert test fixtures into fcafines
INSERT INTO fcafines.fca_fines (
  content_hash, fine_reference, firm_individual, firm_category,
  amount, date_issued, year_issued, month_issued,
  breach_type, breach_categories, summary, regulator, final_notice_url
) VALUES
(
  'fixture-1',
  'FIXTURE-20260303-JOHNWO-12994',
  'John Wood Group PLC',
  NULL,
  12993700.00,
  '2026-03-03',
  2026,
  3,
  'FRAUD',
  '["FRAUD","PRINCIPLES"]'::jsonb,
  'Listing Rules breach relating to misleading information',
  'FCA',
  'https://www.fca.org.uk/publication/final-notices/john-wood-group-plc-2026.pdf'
),
(
  'fixture-2',
  'FIXTURE-20260324-DINOSA-338',
  'Dinosaur Merchant Bank Limited',
  NULL,
  338000.00,
  '2026-03-24',
  2026,
  3,
  'SYSTEMS_CONTROLS',
  '["SYSTEMS_CONTROLS","MARKET_ABUSE","PRINCIPLES"]'::jsonb,
  'Market Abuse Regulation breach - lack of systems and controls',
  'FCA',
  'https://www.fca.org.uk/publication/final-notices/dinosaur-merchant-bank-limited-2026.pdf'
),
(
  'fixture-3',
  'FIXTURE-20260127-BHAVES-56',
  'Bhavesh Hirani',
  NULL,
  56000.00,
  '2026-01-27',
  2026,
  1,
  NULL,
  '[]'::jsonb,
  'Fine issued in 2026',
  'FCA',
  'https://www.fca.org.uk/publication/final-notices/bhavesh-hirani-2026.pdf'
);

-- Insert test fixtures into horizon_scanning
INSERT INTO horizon_scanning.fca_fines (
  fine_reference, firm_individual, firm_category,
  amount, date_issued, year_issued, month_issued,
  breach_type, breach_categories, summary, source_url
) VALUES
(
  'FIXTURE-20260303-JOHNWO-12994',
  'John Wood Group PLC',
  NULL,
  12993700.00,
  '2026-03-03',
  2026,
  3,
  'FRAUD',
  '["FRAUD","PRINCIPLES"]'::jsonb,
  'Listing Rules breach relating to misleading information',
  'https://www.fca.org.uk/news/news-stories/2026-fines'
),
(
  'FIXTURE-20260324-DINOSA-338',
  'Dinosaur Merchant Bank Limited',
  NULL,
  338000.00,
  '2026-03-24',
  2026,
  3,
  'SYSTEMS_CONTROLS',
  '["SYSTEMS_CONTROLS","MARKET_ABUSE","PRINCIPLES"]'::jsonb,
  'Market Abuse Regulation breach - lack of systems and controls',
  'https://www.fca.org.uk/news/news-stories/2026-fines'
),
(
  'FIXTURE-20260127-BHAVES-56',
  'Bhavesh Hirani',
  NULL,
  56000.00,
  '2026-01-27',
  2026,
  1,
  NULL,
  '[]'::jsonb,
  'Fine issued in 2026',
  'https://www.fca.org.uk/news/news-stories/2026-fines'
);

-- Verify fixture data
SELECT 'fcafines' as db, COUNT(*) as fixture_count
FROM fcafines.fca_fines
WHERE content_hash LIKE 'fixture-%'
UNION ALL
SELECT 'horizon_scanning' as db, COUNT(*) as fixture_count
FROM horizon_scanning.fca_fines
WHERE fine_reference LIKE 'FIXTURE-%';

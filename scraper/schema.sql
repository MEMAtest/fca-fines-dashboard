-- FCA Fines Database Schema
-- Run this in your Supabase SQL Editor to create the table

CREATE TABLE IF NOT EXISTS fca_fines (
  id BIGSERIAL PRIMARY KEY,
  firm_individual TEXT NOT NULL,
  date_issued DATE NOT NULL,
  year_issued INTEGER,
  month_issued INTEGER,
  amount DECIMAL(15,2),
  summary TEXT,
  regulator TEXT DEFAULT 'FCA',
  breach_type TEXT,
  firm_category TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(firm_individual, date_issued)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_fca_fines_year ON fca_fines(year_issued);
CREATE INDEX IF NOT EXISTS idx_fca_fines_category ON fca_fines(firm_category);
CREATE INDEX IF NOT EXISTS idx_fca_fines_breach ON fca_fines(breach_type);
CREATE INDEX IF NOT EXISTS idx_fca_fines_date ON fca_fines(date_issued);

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_fca_fines_updated_at BEFORE UPDATE ON fca_fines
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Optional: Enable Row Level Security (RLS)
-- Uncomment if you want to enable RLS
-- ALTER TABLE fca_fines ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow public read access
-- CREATE POLICY "Allow public read access" ON fca_fines
--   FOR SELECT USING (true);

-- Create a policy to allow authenticated inserts/updates (for your scraper)
-- CREATE POLICY "Allow authenticated inserts" ON fca_fines
--   FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- CREATE POLICY "Allow authenticated updates" ON fca_fines
--   FOR UPDATE USING (auth.role() = 'authenticated');

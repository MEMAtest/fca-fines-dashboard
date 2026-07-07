CREATE TABLE IF NOT EXISTS agentic_taxonomy_assignments (
  action_id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  category_label TEXT NOT NULL,
  category_domain TEXT NOT NULL,
  confidence TEXT NOT NULL,
  matched_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  classifier_version TEXT NOT NULL,
  action_fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agentic_taxonomy_assignments_label
  ON agentic_taxonomy_assignments(category_label);

CREATE TABLE IF NOT EXISTS agentic_firm_profiles (
  id BIGSERIAL PRIMARY KEY,
  profile_name TEXT NOT NULL,
  persona_id TEXT,
  firm_type TEXT,
  size_band TEXT,
  jurisdictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  regulators JSONB NOT NULL DEFAULT '[]'::jsonb,
  products JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_incidents JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agentic_firm_profiles_persona
  ON agentic_firm_profiles(persona_id);

CREATE TABLE IF NOT EXISTS agentic_saved_interests (
  id BIGSERIAL PRIMARY KEY,
  profile_id BIGINT REFERENCES agentic_firm_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  regulators JSONB NOT NULL DEFAULT '[]'::jsonb,
  countries JSONB NOT NULL DEFAULT '[]'::jsonb,
  taxonomy_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_relevance INTEGER NOT NULL DEFAULT 30,
  digest_frequency TEXT NOT NULL DEFAULT 'weekly',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agentic_control_frameworks (
  id BIGSERIAL PRIMARY KEY,
  profile_id BIGINT REFERENCES agentic_firm_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  controls JSONB NOT NULL DEFAULT '[]'::jsonb,
  free_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agentic_research_runs (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  normalized_plan JSONB NOT NULL,
  evidence_hash TEXT,
  result_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agentic_impact_assessments (
  id BIGSERIAL PRIMARY KEY,
  action_id TEXT NOT NULL,
  profile_snapshot JSONB NOT NULL,
  impact_flags JSONB NOT NULL,
  memo JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

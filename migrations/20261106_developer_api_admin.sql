-- Admin issuance and revocation metadata. Idempotent.
ALTER TABLE developer_api_keys ADD COLUMN IF NOT EXISTS issued_by TEXT;
ALTER TABLE developer_api_keys ADD COLUMN IF NOT EXISTS revoked_reason TEXT;
ALTER TABLE developer_api_keys ADD COLUMN IF NOT EXISTS application_id BIGINT REFERENCES developer_api_applications(id);
CREATE INDEX IF NOT EXISTS developer_api_keys_application_idx ON developer_api_keys (application_id);

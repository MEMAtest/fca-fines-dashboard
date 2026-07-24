BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.board_pack_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_token_hash text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days',
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (octet_length(payload::text) <= 65536)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_board_pack_drafts_owner
  ON public.board_pack_drafts(id, owner_token_hash);
CREATE INDEX IF NOT EXISTS idx_board_pack_drafts_expiry
  ON public.board_pack_drafts(expires_at);

CREATE TABLE IF NOT EXISTS public.board_pack_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.board_pack_drafts(id) ON DELETE CASCADE,
  share_token_hash text NOT NULL UNIQUE,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  application_commit text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  revoked_at timestamptz,
  CHECK (jsonb_typeof(snapshot) = 'object'),
  CHECK (octet_length(snapshot::text) <= 1048576)
);

CREATE INDEX IF NOT EXISTS idx_board_pack_shares_pack
  ON public.board_pack_shares(pack_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_pack_shares_expiry
  ON public.board_pack_shares(expires_at);

CREATE TABLE IF NOT EXISTS public.board_pack_request_limits (
  scope_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (scope_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_board_pack_request_limits_window
  ON public.board_pack_request_limits(window_start);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_pack_drafts TO fca_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_pack_shares TO fca_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_pack_request_limits TO fca_app;
  END IF;
END
$$;

COMMIT;

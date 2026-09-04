CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE auth_role AS ENUM ('ADMIN', 'EMPLOYEE', 'CUSTOMER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role auth_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT auth_users_email_not_blank CHECK (length(trim(email)) > 0),
  CONSTRAINT auth_users_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_lower_unique
  ON auth_users (lower(email));

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  family_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  replaced_by_token_id UUID NULL,
  user_agent VARCHAR(512) NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NULL,
  CONSTRAINT auth_refresh_tokens_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_id_idx
  ON auth_refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_family_id_idx
  ON auth_refresh_tokens (family_id);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_active_expiry_idx
  ON auth_refresh_tokens (expires_at)
  WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION auth_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auth_users_set_updated_at ON auth_users;
CREATE TRIGGER auth_users_set_updated_at
BEFORE UPDATE ON auth_users
FOR EACH ROW
EXECUTE FUNCTION auth_set_updated_at();

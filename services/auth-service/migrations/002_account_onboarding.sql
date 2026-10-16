ALTER TABLE auth_users
  ADD COLUMN onboarding_status VARCHAR(24) NOT NULL DEFAULT 'READY',
  ADD COLUMN email_verified_at TIMESTAMPTZ,
  ADD COLUMN verification_source VARCHAR(24),
  ADD COLUMN created_by UUID REFERENCES auth_users(id),
  ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;

-- Compatibility is administrative, not evidence of a historic mailbox check.
UPDATE auth_users SET email_verified_at = created_at, verification_source = 'LEGACY_MIGRATION';
ALTER TABLE auth_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE auth_users ADD CONSTRAINT auth_users_onboarding_valid CHECK (
  onboarding_status IN ('PENDING_EMAIL', 'PENDING_INVITATION', 'READY')
  AND auth_version >= 0
  AND (password_hash IS NOT NULL OR (role = 'EMPLOYEE' AND onboarding_status = 'PENDING_INVITATION'))
  AND (onboarding_status <> 'READY' OR email_verified_at IS NOT NULL)
  AND (onboarding_status <> 'PENDING_EMAIL' OR role = 'CUSTOMER')
  AND (onboarding_status <> 'PENDING_INVITATION' OR role = 'EMPLOYEE')
);

CREATE TABLE auth_onboarding_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth_users(id),
  user_id UUID NOT NULL REFERENCES auth_users(id),
  action VARCHAR(64) NOT NULL,
  correlation_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO auth_onboarding_audit (user_id, action)
SELECT id, 'LEGACY_MIGRATION_VERIFIED' FROM auth_users;
CREATE INDEX auth_onboarding_audit_user_idx ON auth_onboarding_audit(user_id, created_at);

CREATE TABLE auth_onboarding_challenges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id),
  purpose VARCHAR(24) NOT NULL CHECK (purpose IN ('EMAIL_VERIFICATION','EMPLOYEE_INVITATION')),
  generation INTEGER NOT NULL CHECK (generation > 0),
  token_hash CHAR(64) NOT NULL UNIQUE,
  browser_nonce_hash CHAR(64),
  return_path VARCHAR(512) NOT NULL DEFAULT '/',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  delivery_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING','SENT','SIMULATED','FAILED','UNDELIVERABLE')),
  delivery_attempt INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempt >= 0),
  delivery_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,purpose,generation)
);
CREATE UNIQUE INDEX auth_onboarding_current_idx ON auth_onboarding_challenges(user_id,purpose)
WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX auth_onboarding_expiry_idx ON auth_onboarding_challenges(expires_at);

CREATE TABLE auth_onboarding_outbox (
  event_id UUID PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES auth_onboarding_challenges(id),
  routing_key VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ,
  publish_attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_onboarding_outbox_pending_idx ON auth_onboarding_outbox(next_attempt_at) WHERE published_at IS NULL;
CREATE TABLE auth_onboarding_received_events (
  event_id UUID PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE auth_onboarding_rate_limits (
  scope VARCHAR(32) NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  PRIMARY KEY(scope, subject_hash, bucket_start)
);
CREATE TABLE auth_onboarding_email_limits (
  email_hash CHAR(64) PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE auth_employee_invitation_requests (
  actor_id UUID NOT NULL REFERENCES auth_users(id),
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(actor_id,idempotency_key)
);
CREATE INDEX auth_users_employee_search_idx ON auth_users(lower(email),id) WHERE role = 'EMPLOYEE';

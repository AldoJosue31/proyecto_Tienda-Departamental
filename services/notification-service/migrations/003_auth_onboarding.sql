-- Identity onboarding has its own deliveries and results; it never creates CRM campaigns.
CREATE TABLE notification_onboarding_received_events (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL CHECK (event_type IN ('auth.email.verification.requested.v1', 'auth.employee.invitation.requested.v1')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_onboarding_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL,
  user_id UUID NOT NULL,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('EMAIL_VERIFICATION', 'EMPLOYEE_INVITATION')),
  generation INTEGER NOT NULL CHECK (generation >= 1),
  expires_at TIMESTAMPTZ NOT NULL,
  correlation_id VARCHAR(128) NULL,
  encrypted_content JSONB NULL CHECK (encrypted_content IS NULL OR jsonb_typeof(encrypted_content) = 'object'),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'SIMULATED', 'FAILED', 'UNDELIVERABLE')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at TIMESTAMPTZ NULL,
  locked_until TIMESTAMPTZ NULL,
  provider_message_id VARCHAR(255) NULL,
  failure_code VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, generation)
);
CREATE INDEX notification_onboarding_deliveries_due_idx ON notification_onboarding_deliveries (next_retry_at, updated_at)
  WHERE status IN ('PENDING', 'FAILED', 'PROCESSING');
CREATE INDEX notification_onboarding_deliveries_expiry_idx ON notification_onboarding_deliveries (expires_at)
  WHERE encrypted_content IS NOT NULL;
CREATE TRIGGER notification_onboarding_deliveries_updated_at_trigger BEFORE UPDATE ON notification_onboarding_deliveries
  FOR EACH ROW EXECUTE FUNCTION notification_set_updated_at();

CREATE TABLE notification_onboarding_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES notification_onboarding_deliveries(id),
  event_type VARCHAR(120) NOT NULL DEFAULT 'auth.email.delivery.updated.v1' CHECK (event_type = 'auth.email.delivery.updated.v1'),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  correlation_id VARCHAR(128) NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL,
  locked_by VARCHAR(160) NULL,
  locked_until TIMESTAMPTZ NULL,
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_error VARCHAR(500) NULL,
  UNIQUE (delivery_id, attempt)
);
CREATE INDEX notification_onboarding_outbox_pending_idx ON notification_onboarding_outbox_events (available_at, occurred_at)
  WHERE published_at IS NULL;

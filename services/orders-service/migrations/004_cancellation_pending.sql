-- A confirmed online order is only commercially cancelled after Logistics
-- accepts the request before dispatch. The intermediate status is retryable if
-- that private service is temporarily unavailable.
ALTER TYPE orders_status ADD VALUE IF NOT EXISTS 'CANCELLATION_PENDING';

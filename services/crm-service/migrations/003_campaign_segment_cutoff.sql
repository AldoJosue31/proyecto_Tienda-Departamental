ALTER TABLE crm_campaigns ADD COLUMN reference_at TIMESTAMPTZ;
ALTER TABLE crm_campaigns ADD COLUMN cutoff_at TIMESTAMPTZ;
-- The API enforces a minimum of three months for new campaigns. Historical
-- campaigns retain their original segment and can still receive delivery updates.

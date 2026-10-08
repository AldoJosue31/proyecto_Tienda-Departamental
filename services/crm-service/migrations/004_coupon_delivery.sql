ALTER TABLE crm_campaign_recipients DROP CONSTRAINT IF EXISTS crm_campaign_recipients_status_check;
ALTER TABLE crm_campaign_recipients ADD CONSTRAINT crm_campaign_recipients_status_check CHECK (status IN ('PENDING','SENT','SIMULATED','UNKNOWN','FAILED','UNDELIVERABLE'));
UPDATE crm_campaign_recipients SET status = 'UNKNOWN' WHERE status = 'SENT';
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS discount_type VARCHAR(16) NULL CHECK (discount_type IN ('PERCENTAGE','FIXED'));
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) NULL CHECK (discount_value > 0);
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS target_scope VARCHAR(16) NULL CHECK (target_scope IN ('ALL','CATEGORY','PRODUCT','VARIANT'));
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS target_id UUID NULL;
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64) NULL;

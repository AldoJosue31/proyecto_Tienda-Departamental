ALTER TABLE crm_campaign_recipients ADD COLUMN segment_group TEXT NOT NULL DEFAULT 'PURCHASER' CHECK (segment_group IN ('PURCHASER','NEVER_PURCHASED'));

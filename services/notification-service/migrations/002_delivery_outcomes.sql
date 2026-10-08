ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_status_check;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_status_check CHECK (status IN ('PENDING','PROCESSING','SENT','SIMULATED','FAILED','UNDELIVERABLE'));
ALTER TABLE notification_outbox_events DROP CONSTRAINT IF EXISTS notification_outbox_events_event_type_check;
ALTER TABLE notification_outbox_events ADD CONSTRAINT notification_outbox_events_event_type_check CHECK (event_type IN ('notification.sent.v1','notification.simulated.v1','notification.failed.v1'));
UPDATE notification_deliveries SET status = 'SIMULATED' WHERE status = 'SENT' AND provider_message_id LIKE 'local-%';
UPDATE notification_outbox_events e SET published_at = COALESCE(e.published_at, NOW()) FROM notification_deliveries d WHERE e.notification_id = d.id AND d.status = 'SIMULATED' AND e.event_type = 'notification.sent.v1';
INSERT INTO notification_outbox_events (notification_id,event_type,correlation_id,payload)
SELECT id,'notification.simulated.v1',correlation_id,jsonb_build_object('notificationId',id,'campaignId',campaign_id,'customerId',customer_id,'deliveryMode','log') FROM notification_deliveries WHERE status = 'SIMULATED'
ON CONFLICT (notification_id,event_type) DO NOTHING;

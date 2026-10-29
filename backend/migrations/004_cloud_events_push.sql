-- Additive cloud integration; all existing accounts, events and feedback are retained.
CREATE TABLE IF NOT EXISTS device_gateway (
  gateway_id UUID PRIMARY KEY,
  farmer_id BIGINT NOT NULL REFERENCES farmer(farmer_id) ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS push_subscription (
  subscription_id UUID PRIMARY KEY,
  farmer_id BIGINT NOT NULL REFERENCES farmer(farmer_id) ON DELETE CASCADE,
  session_token_hash CHAR(64) NOT NULL REFERENCES farmer_session(token_hash) ON DELETE CASCADE,
  endpoint_hash CHAR(64) NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  vapid_public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_subscription_farmer_idx ON push_subscription(farmer_id);
CREATE INDEX IF NOT EXISTS push_subscription_session_idx ON push_subscription(session_token_hash);
DO $$
BEGIN
 IF to_regclass('sensor_node') IS NOT NULL THEN
  CREATE TABLE IF NOT EXISTS gateway_node (
    gateway_id UUID NOT NULL REFERENCES device_gateway(gateway_id) ON DELETE CASCADE,
    node_id BIGINT NOT NULL UNIQUE REFERENCES sensor_node(node_id) ON DELETE CASCADE,
    PRIMARY KEY(gateway_id,node_id)
  );
 END IF;
 IF to_regclass('sensor_reading') IS NOT NULL THEN
  ALTER TABLE sensor_reading ALTER COLUMN amplitude DROP NOT NULL;
  ALTER TABLE sensor_reading ALTER COLUMN frequency DROP NOT NULL;
  ALTER TABLE sensor_reading ALTER COLUMN amplitude TYPE NUMERIC(12,6);
  ALTER TABLE sensor_reading ALTER COLUMN frequency TYPE NUMERIC(12,6);
  ALTER TABLE sensor_reading ALTER COLUMN duration TYPE NUMERIC(12,6);
  ALTER TABLE sensor_reading ADD COLUMN IF NOT EXISTS amplitude_unit VARCHAR(20);
 END IF;
 IF to_regclass('detection_feedback') IS NOT NULL THEN
  ALTER TABLE detection_feedback ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
  ALTER TABLE detection_feedback ADD COLUMN IF NOT EXISTS storage_path TEXT;
  ALTER TABLE detection_feedback ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64);
  CREATE INDEX IF NOT EXISTS detection_feedback_owner_idx ON detection_feedback(detection_id,farmer_id,feedback_at DESC,feedback_id DESC);
 END IF;
 IF to_regclass('detection_image') IS NOT NULL THEN
  ALTER TABLE detection_image ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
  ALTER TABLE detection_image ADD COLUMN IF NOT EXISTS storage_path TEXT;
  ALTER TABLE detection_image ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64);
  CREATE INDEX IF NOT EXISTS detection_image_detection_idx ON detection_image(detection_id,sequence_number);
 END IF;
 IF to_regclass('detection') IS NOT NULL AND to_regclass('notification') IS NOT NULL THEN
  CREATE TABLE IF NOT EXISTS gateway_event (
    gateway_id UUID NOT NULL REFERENCES device_gateway(gateway_id) ON DELETE RESTRICT,
    source_event_id UUID NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
    state VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','COMPLETED')),
    detection_id BIGINT UNIQUE REFERENCES detection(detection_id) ON DELETE RESTRICT,
    notification_id BIGINT UNIQUE REFERENCES notification(notification_id) ON DELETE RESTRICT,
    evidence JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(gateway_id,source_event_id)
  );
  CREATE TABLE IF NOT EXISTS push_delivery (
    delivery_id UUID PRIMARY KEY,
    notification_id BIGINT NOT NULL REFERENCES notification(notification_id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES push_subscription(subscription_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '24 hours'),
    locked_until TIMESTAMPTZ,
    lease_id UUID,
    last_error VARCHAR(40),
    sent_at TIMESTAMPTZ,
    UNIQUE(notification_id,subscription_id)
  );
  CREATE INDEX IF NOT EXISTS push_delivery_pending_idx ON push_delivery(available_at,locked_until) WHERE status IN ('PENDING','PROCESSING');
  CREATE INDEX IF NOT EXISTS detection_history_idx ON detection(detection_at DESC,detection_id DESC);
  CREATE INDEX IF NOT EXISTS detection_reading_idx ON detection(reading_id);
  CREATE INDEX IF NOT EXISTS sensor_reading_node_idx ON sensor_reading(node_id);
 END IF;
END $$;
-- This application authenticates through Node, not Supabase Auth/PostgREST.
-- Keep browser roles from bypassing Node ownership checks through the Data API.
-- Table-owner PostgreSQL connections used by the backend continue to work.
DO $$
DECLARE table_name TEXT;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['farmer','farmer_session','farmer_password_reset','farm_plot','sensor_node','sensor_reading','detection','detection_image','detection_feedback','feedback_category','notification','training_queue','device_gateway','gateway_node','gateway_event','push_subscription','push_delivery'] LOOP
  IF to_regclass(table_name) IS NOT NULL THEN
   EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  END IF;
 END LOOP;
END $$;

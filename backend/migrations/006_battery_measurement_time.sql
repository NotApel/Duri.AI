-- A connection ping is not a battery measurement. Keep the last measurement's time.
DO $$
BEGIN
 IF to_regclass('sensor_node') IS NOT NULL THEN
  ALTER TABLE sensor_node ADD COLUMN IF NOT EXISTS battery_recorded_at TIMESTAMPTZ;
  -- Existing values retain an unknown measurement time; do not invent a backfill.
 END IF;
END $$;

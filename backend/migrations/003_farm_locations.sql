-- Preserve existing reference coordinates, but no longer require farmers to enter them.
-- Auth-only installations are supported; full farm schemas are migrated at startup.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('farm_plot') AND attname='latitude' AND NOT attisdropped) THEN
    ALTER TABLE farm_plot ALTER COLUMN latitude DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('farm_plot') AND attname='longitude' AND NOT attisdropped) THEN
    ALTER TABLE farm_plot ALTER COLUMN longitude DROP NOT NULL;
  END IF;
  IF to_regclass('sensor_node') IS NOT NULL THEN
    ALTER TABLE sensor_node ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6)
      CHECK (latitude BETWEEN -90 AND 90);
    ALTER TABLE sensor_node ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6)
      CHECK (longitude BETWEEN -180 AND 180);
    ALTER TABLE sensor_node ADD COLUMN IF NOT EXISTS location_recorded_at TIMESTAMPTZ;
    ALTER TABLE sensor_node ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

-- Upgrade older farmer tables without resetting accounts or passwords.
ALTER TABLE farmer ADD COLUMN IF NOT EXISTS username VARCHAR(50);

-- Keep every existing nonblank username. Assign a stable, unique login name to
-- accounts whose schema previously had no username, including case collisions.
DO $$
DECLARE
  account RECORD;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR account IN
    SELECT farmer_id FROM farmer
    WHERE username IS NULL OR btrim(username) = ''
    ORDER BY farmer_id
  LOOP
    candidate := 'farmer_' || account.farmer_id::text;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM farmer WHERE lower(username) = lower(candidate)) LOOP
      suffix := suffix + 1;
      candidate := 'farmer_' || account.farmer_id::text || '_' || suffix::text;
    END LOOP;
    UPDATE farmer SET username = candidate WHERE farmer_id = account.farmer_id;
  END LOOP;
END $$;

ALTER TABLE farmer ALTER COLUMN username SET NOT NULL;

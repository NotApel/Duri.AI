-- Reference data only. Preserve existing category IDs, names, descriptions and feedback.
DO $$
BEGIN
 IF to_regclass('feedback_category') IS NOT NULL THEN
  INSERT INTO feedback_category(category_name, description)
  SELECT name, description FROM (VALUES
   ('Animal', 'Animal movement caused the event.'),
   ('Wind', 'Wind or moving vegetation caused the event.'),
   ('Rain', 'Rain caused the event.'),
   ('Other', 'Another cause observed by the farmer.')
  ) AS defaults(name, description)
  WHERE NOT EXISTS (
   SELECT 1 FROM feedback_category existing
   WHERE lower(existing.category_name)=lower(defaults.name)
  );
 END IF;
END $$;

/*
  # Drop user_id foreign key on article_batches

  1. Changes
    - Remove the foreign key constraint linking user_id to auth.users
    - This app does not use authentication, so the FK is unnecessary
    - The user_id column is kept with its default UUID for compatibility

  2. Notes
    - The column still exists with a default value
    - No data is lost
*/

DO $$ 
DECLARE
  fk_name text;
BEGIN
  SELECT constraint_name INTO fk_name
  FROM information_schema.table_constraints
  WHERE table_name = 'article_batches'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%user_id%';
  
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE article_batches DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

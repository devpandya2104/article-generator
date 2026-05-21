/*
  # Fix shared_prompts table

  1. Changes
    - Drop foreign key constraint on `updated_by` column so anonymous/ephemeral users can save
    - Seed default rows for 'title_prompt' and 'article_prompt' so reads always return data
    - Drop and recreate RLS policies to also allow the `anon` role to read prompts

  2. Notes
    - The FK was blocking saves because anonymous user IDs may not exist in auth.users
    - Seeding ensures new users always get the default prompts on first load
*/

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT constraint_name INTO fk_name
  FROM information_schema.table_constraints
  WHERE table_name = 'shared_prompts'
    AND constraint_type = 'FOREIGN KEY';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE shared_prompts DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE shared_prompts ALTER COLUMN updated_by DROP NOT NULL;

INSERT INTO shared_prompts (id, content)
VALUES ('title_prompt', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO shared_prompts (id, content)
VALUES ('article_prompt', '')
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can read shared prompts" ON shared_prompts;
CREATE POLICY "Anyone can read shared prompts"
  ON shared_prompts FOR SELECT
  TO authenticated, anon
  USING (true);

/*
  # Allow anonymous access to article_batches and articles

  1. Changes
    - Drop existing RLS policies that require auth.uid()
    - Create new permissive policies for anon and authenticated roles
    - article_batches: allow select, insert, update for all users
    - articles: allow select, insert, update for all users

  2. Security
    - RLS remains enabled on both tables
    - Policies scoped to anon and authenticated roles
    - No delete policies (data preservation)

  3. Notes
    - This app does not use user authentication
    - A fixed system user_id is used for all batches
*/

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own batches" ON article_batches;
  DROP POLICY IF EXISTS "Users can insert own batches" ON article_batches;
  DROP POLICY IF EXISTS "Users can update own batches" ON article_batches;
  DROP POLICY IF EXISTS "Users can view own articles" ON articles;
  DROP POLICY IF EXISTS "Users can insert articles for own batches" ON articles;
  DROP POLICY IF EXISTS "Users can update own articles" ON articles;
END $$;

CREATE POLICY "Anyone can view batches"
  ON article_batches FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert batches"
  ON article_batches FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update batches"
  ON article_batches FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view articles"
  ON articles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert articles"
  ON articles FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update articles"
  ON articles FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

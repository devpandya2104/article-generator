/*
  # Create shared_prompts table

  1. New Tables
    - `shared_prompts`
      - `id` (text, primary key) - prompt identifier key (e.g. 'title_prompt', 'article_prompt')
      - `content` (text) - the prompt text
      - `updated_at` (timestamptz) - last update timestamp
      - `updated_by` (uuid) - user who last updated

  2. Notes
    - Single-row-per-key design for global shared prompts
    - All authenticated users can read and update prompts
    - This is intentionally shared across all users

  3. Security
    - Enable RLS on table
    - All authenticated users can read prompts
    - All authenticated users can update/insert prompts (shared editing)
*/

CREATE TABLE IF NOT EXISTS shared_prompts (
  id text PRIMARY KEY,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE shared_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read shared prompts"
  ON shared_prompts FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert shared prompts"
  ON shared_prompts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update shared prompts"
  ON shared_prompts FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

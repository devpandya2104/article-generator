/*
  # Allow anon role to update shared prompts

  1. Changes
    - Drop and recreate update policy to include both `authenticated` and `anon` roles
    - Drop and recreate insert policy to include both `authenticated` and `anon` roles
    - This ensures users who sign in anonymously can still save prompt changes

  2. Notes
    - Anonymous sign-in may use the `anon` role depending on Supabase config
*/

DROP POLICY IF EXISTS "Authenticated users can update shared prompts" ON shared_prompts;
CREATE POLICY "Users can update shared prompts"
  ON shared_prompts FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can insert shared prompts" ON shared_prompts;
CREATE POLICY "Users can insert shared prompts"
  ON shared_prompts FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

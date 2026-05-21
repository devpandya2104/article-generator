/*
  # Add default user_id to article_batches

  1. Changes
    - Set a default UUID for user_id column so batches can be created without auth
    - The fixed UUID '00000000-0000-0000-0000-000000000000' acts as a system user

  2. Notes
    - This app does not use user authentication
    - All batches are attributed to the system user
*/

ALTER TABLE article_batches
  ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;

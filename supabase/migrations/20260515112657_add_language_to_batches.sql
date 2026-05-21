/*
  # Add language column to article_batches

  1. Modified Tables
    - `article_batches`
      - `language` (text) - the language for article generation (default 'English')

  2. Notes
    - Defaults to 'English' matching current behavior
    - Stored as the language name string (e.g. 'Spanish', 'French', 'German')
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'article_batches' AND column_name = 'language'
  ) THEN
    ALTER TABLE article_batches ADD COLUMN language text NOT NULL DEFAULT 'English';
  END IF;
END $$;

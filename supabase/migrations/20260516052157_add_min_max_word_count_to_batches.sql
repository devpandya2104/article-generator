/*
  # Add min/max word count to article_batches

  1. Modified Tables
    - `article_batches`
      - `min_word_count` (integer) - minimum target word count (default 1000)
      - `max_word_count` (integer) - maximum target word count (default 1300)

  2. Notes
    - Keeps existing `word_count` column intact to avoid data loss
    - New columns default to 1000 and 1300 respectively
    - Frontend will use min/max going forward; edge function accepts both formats
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'article_batches' AND column_name = 'min_word_count'
  ) THEN
    ALTER TABLE article_batches ADD COLUMN min_word_count integer NOT NULL DEFAULT 1000;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'article_batches' AND column_name = 'max_word_count'
  ) THEN
    ALTER TABLE article_batches ADD COLUMN max_word_count integer NOT NULL DEFAULT 1300;
  END IF;
END $$;

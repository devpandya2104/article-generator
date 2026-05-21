/*
  # Add anchors, word count, and custom prompts to article_batches

  1. Modified Tables
    - `article_batches`
      - `anchors` (jsonb) - array of {text, url} anchor pairs to embed in articles
      - `word_count` (integer) - custom target word count for articles (default 1000)
      - `title_prompt` (text) - custom prompt override for title generation
      - `article_prompt` (text) - custom prompt override for article generation

  2. Notes
    - All new columns are nullable with sensible defaults
    - Anchors stored as JSONB array: [{"text":"anchor text","url":"https://..."},...]
    - Word count defaults to 1000 (matching current behavior)
    - Prompt fields are empty by default (edge functions use built-in prompts when empty)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'article_batches' AND column_name = 'anchors'
  ) THEN
    ALTER TABLE article_batches ADD COLUMN anchors jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'article_batches' AND column_name = 'word_count'
  ) THEN
    ALTER TABLE article_batches ADD COLUMN word_count integer NOT NULL DEFAULT 1000;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'article_batches' AND column_name = 'title_prompt'
  ) THEN
    ALTER TABLE article_batches ADD COLUMN title_prompt text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'article_batches' AND column_name = 'article_prompt'
  ) THEN
    ALTER TABLE article_batches ADD COLUMN article_prompt text NOT NULL DEFAULT '';
  END IF;
END $$;

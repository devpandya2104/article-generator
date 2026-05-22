-- Add sheet generator columns to support Sheet Generator tool
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS order_id text,
  ADD COLUMN IF NOT EXISTS publisher_website text;

ALTER TABLE article_batches
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

SELECT 'Migration complete!' AS status;

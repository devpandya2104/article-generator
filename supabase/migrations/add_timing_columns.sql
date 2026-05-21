-- Add word count and timing columns for history display
-- Run this once in Supabase SQL Editor

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS word_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms integer DEFAULT 0;

ALTER TABLE article_batches
  ADD COLUMN IF NOT EXISTS batch_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS batch_completed_at timestamptz;

SELECT 'Migration complete!' as status;

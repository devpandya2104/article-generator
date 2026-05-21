-- ============================================================
-- ARTICLE GENERATOR - Complete Database Setup
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

-- 1. Create article_batches table
CREATE TABLE IF NOT EXISTS article_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  topic text NOT NULL DEFAULT '',
  requested_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'titles_pending',
  anchors jsonb DEFAULT '[]'::jsonb,
  word_count integer NOT NULL DEFAULT 1000,
  min_word_count integer NOT NULL DEFAULT 1000,
  max_word_count integer NOT NULL DEFAULT 1300,
  title_prompt text NOT NULL DEFAULT '',
  article_prompt text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'English',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE article_batches ENABLE ROW LEVEL SECURITY;

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

-- 2. Create articles table
CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES article_batches(id),
  title text NOT NULL DEFAULT '',
  body_html text DEFAULT '',
  image_url text DEFAULT '',
  google_doc_id text DEFAULT '',
  google_doc_url text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_articles_batch_id ON articles(batch_id);
CREATE INDEX IF NOT EXISTS idx_article_batches_user_id ON article_batches(user_id);

-- 3. Create shared_prompts table
CREATE TABLE IF NOT EXISTS shared_prompts (
  id text PRIMARY KEY,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE shared_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read shared prompts"
  ON shared_prompts FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can update shared prompts"
  ON shared_prompts FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can insert shared prompts"
  ON shared_prompts FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- 4. Seed default prompt rows
INSERT INTO shared_prompts (id, content)
VALUES ('title_prompt', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO shared_prompts (id, content)
VALUES ('article_prompt', '')
ON CONFLICT (id) DO NOTHING;

-- Done!
SELECT 'Database setup complete!' as status;

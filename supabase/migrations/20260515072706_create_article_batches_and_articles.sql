/*
  # Create article generation tables

  1. New Tables
    - `article_batches`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `topic` (text) - the keyword/topic for title generation
      - `requested_count` (integer) - how many articles requested
      - `status` (text) - batch status: titles_pending, titles_done, generating, done, failed
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `articles`
      - `id` (uuid, primary key)
      - `batch_id` (uuid, references article_batches)
      - `title` (text) - generated or edited title
      - `body_html` (text) - generated article HTML
      - `image_url` (text) - DALL-E generated image URL
      - `google_doc_id` (text) - Drive file ID
      - `google_doc_url` (text) - shareable URL
      - `status` (text) - pending, generating, uploading, done, failed
      - `error_message` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can only access their own batches and articles
*/

CREATE TABLE IF NOT EXISTS article_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  topic text NOT NULL DEFAULT '',
  requested_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'titles_pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE article_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own batches"
  ON article_batches FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own batches"
  ON article_batches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own batches"
  ON article_batches FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

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

CREATE POLICY "Users can view own articles"
  ON articles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM article_batches
      WHERE article_batches.id = articles.batch_id
      AND article_batches.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert articles for own batches"
  ON articles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM article_batches
      WHERE article_batches.id = articles.batch_id
      AND article_batches.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own articles"
  ON articles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM article_batches
      WHERE article_batches.id = articles.batch_id
      AND article_batches.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM article_batches
      WHERE article_batches.id = articles.batch_id
      AND article_batches.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_articles_batch_id ON articles(batch_id);
CREATE INDEX IF NOT EXISTS idx_article_batches_user_id ON article_batches(user_id);

/*
  # Word to Google Docs Conversion History

  1. New Tables
    - `conversions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - owner of the conversion
      - `session_id` (text) - groups conversions from the same upload batch
      - `original_filename` (text) - name of the uploaded Word file
      - `file_size` (bigint) - size in bytes
      - `queue_index` (int) - preserves upload order within a session
      - `status` (text) - pending | uploading | converting | success | failed
      - `google_doc_id` (text, nullable) - Drive file id once created
      - `google_doc_url` (text, nullable) - shareable Google Docs link
      - `error_message` (text, nullable)
      - `attempts` (int, default 0) - retry counter
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `conversions`
    - Authenticated users may read, insert, update, delete only their own rows

  3. Indexes
    - Index on (user_id, session_id, queue_index) for ordered retrieval
*/

CREATE TABLE IF NOT EXISTS conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL DEFAULT '',
  original_filename text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  queue_index int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  google_doc_id text,
  google_doc_url text,
  error_message text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversions_user_session_order_idx
  ON conversions (user_id, session_id, queue_index);

ALTER TABLE conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversions"
  ON conversions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversions"
  ON conversions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversions"
  ON conversions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversions"
  ON conversions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

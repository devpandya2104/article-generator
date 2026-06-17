CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  updated_by text
);

INSERT INTO app_settings (key, value) VALUES
  ('sheet_openai_title_prompt', ''),
  ('sheet_openai_article_prompt', '')
ON CONFLICT (key) DO NOTHING;

/*
  # Add TSV preview column to conversions

  1. Changes
    - Adds nullable `tsv_preview` text column to `conversions` so each
      converted Word document can store its extracted tab-separated text
      (first ~64KB) for quick paste-into-Sheets access from history.

  2. Notes
    - Non-destructive: column is added with `IF NOT EXISTS`.
    - Existing rows get NULL.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversions' AND column_name = 'tsv_preview'
  ) THEN
    ALTER TABLE conversions ADD COLUMN tsv_preview text;
  END IF;
END $$;

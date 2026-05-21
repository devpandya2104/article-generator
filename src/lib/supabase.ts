import { createClient } from '@supabase/supabase-js';

export type ConversionStatus =
  | 'pending'
  | 'uploading'
  | 'converting'
  | 'success'
  | 'failed';

export interface ConversionRow {
  id: string;
  user_id: string;
  session_id: string;
  original_filename: string;
  file_size: number;
  queue_index: number;
  status: ConversionStatus;
  google_doc_id: string | null;
  google_doc_url: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true },
  }
);

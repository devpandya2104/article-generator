export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['.doc', '.docx'];
export const ACCEPTED_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateWordFile(file: File): ValidationResult {
  const lower = file.name.toLowerCase();
  const extOk = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!extOk) return { valid: false, reason: 'Only .doc and .docx files are allowed.' };
  if (file.size === 0) return { valid: false, reason: 'File is empty.' };
  if (file.size > MAX_FILE_SIZE)
    return { valid: false, reason: `File exceeds ${formatBytes(MAX_FILE_SIZE)} limit.` };
  return { valid: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

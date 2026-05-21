import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCw,
  Trash2,
  Copy,
  ExternalLink,
  ArrowDownToLine,
  HelpCircle,
  ChevronRight,
  Sparkles,
  Link2,
} from 'lucide-react';
import {
  ACCEPTED_EXTENSIONS,
  fileKey,
  formatBytes,
  MAX_FILE_SIZE,
  validateWordFile,
} from './lib/files';
import { supabase, type ConversionStatus } from './lib/supabase';

type ItemStatus = ConversionStatus | 'queued';

interface QueueItem {
  id: string;
  queueIndex: number;
  file: File;
  status: ItemStatus;
  attempts: number;
  error?: string;
  googleDocUrl?: string;
  googleDocId?: string;
  dbId?: string;
}

const MAX_ATTEMPTS = 3;
const CONVERT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/convert-docx`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function App() {
  const [showGuide, setShowGuide] = useState(false);
  const [configStatus, setConfigStatus] = useState<'unknown' | 'ready' | 'missing'>(
    'unknown'
  );

  const [userId, setUserId] = useState<string | null>(null);
  const [sessionId] = useState<string>(() => crypto.randomUUID());

  const [items, setItems] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        if (mounted) setUserId(data.session.user.id);
      } else {
        const { data: signed } = await supabase.auth.signInAnonymously();
        if (signed.user && mounted) setUserId(signed.user.id);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(CONVERT_URL, {
          method: 'GET',
          headers: { Authorization: `Bearer ${ANON_KEY}` },
        });
        const body = await res.json();
        setConfigStatus(body?.configured ? 'ready' : 'missing');
      } catch {
        setConfigStatus('missing');
      }
    })();
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    setItems((prev) => {
      const existingKeys = new Set(prev.map((p) => fileKey(p.file)));
      const next: QueueItem[] = [...prev];
      let nextIndex = prev.length;
      for (const f of list) {
        const v = validateWordFile(f);
        const key = fileKey(f);
        const duplicate = existingKeys.has(key);
        next.push({
          id: crypto.randomUUID(),
          queueIndex: nextIndex++,
          file: f,
          attempts: 0,
          status: !v.valid || duplicate ? 'failed' : 'queued',
          error: !v.valid
            ? v.reason
            : duplicate
            ? 'Duplicate of another file in this batch.'
            : undefined,
        });
        existingKeys.add(key);
      }
      return next;
    });
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  const clearAll = () => setItems([]);

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const convertOne = async (file: File): Promise<{
    googleDocId: string;
    googleDocUrl: string;
  }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(CONVERT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || `Conversion failed (${res.status}).`);
    }
    return body;
  };

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    setGlobalError(null);

    if (configStatus === 'missing') {
      setGlobalError(
        'Owner Google credentials are not set up yet. Open the Setup guide.'
      );
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);

    try {
      const snapshot = [...items].sort((a, b) => a.queueIndex - b.queueIndex);
      for (const item of snapshot) {
        if (item.status === 'success' || item.status === 'failed') continue;

        updateItem(item.id, { status: 'uploading', error: undefined });

        let dbId = item.dbId;
        if (!dbId && userId) {
          const { data } = await supabase
            .from('conversions')
            .insert({
              user_id: userId,
              session_id: sessionId,
              original_filename: item.file.name,
              file_size: item.file.size,
              queue_index: item.queueIndex,
              status: 'uploading',
              attempts: 0,
            })
            .select('id')
            .maybeSingle();
          if (data?.id) {
            dbId = data.id;
            updateItem(item.id, { dbId });
          }
        }

        let attempt = item.attempts;
        let lastError: string | null = null;
        let success = false;

        while (attempt < MAX_ATTEMPTS && !success) {
          attempt += 1;
          try {
            updateItem(item.id, { status: 'converting', attempts: attempt });
            const result = await convertOne(item.file);
            success = true;
            updateItem(item.id, {
              status: 'success',
              googleDocId: result.googleDocId,
              googleDocUrl: result.googleDocUrl,
              attempts: attempt,
              error: undefined,
            });
            if (dbId) {
              await supabase
                .from('conversions')
                .update({
                  status: 'success',
                  google_doc_id: result.googleDocId,
                  google_doc_url: result.googleDocUrl,
                  attempts: attempt,
                  error_message: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', dbId);
            }
          } catch (err) {
            lastError = err instanceof Error ? err.message : 'Unknown error';
            updateItem(item.id, { attempts: attempt, error: lastError });
            await new Promise((r) => setTimeout(r, 600 * attempt));
          }
        }

        if (!success) {
          updateItem(item.id, {
            status: 'failed',
            error: lastError ?? 'Conversion failed.',
          });
          if (dbId) {
            await supabase
              .from('conversions')
              .update({
                status: 'failed',
                attempts: attempt,
                error_message: lastError,
                updated_at: new Date().toISOString(),
              })
              .eq('id', dbId);
          }
        }
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [items, userId, configStatus, sessionId]);

  const retryItem = (id: string) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: 'queued', attempts: 0, error: undefined } : p
      )
    );
    setTimeout(processQueue, 50);
  };

  const ordered = useMemo(
    () => [...items].sort((a, b) => a.queueIndex - b.queueIndex),
    [items]
  );

  const successItems = ordered.filter((i) => i.status === 'success');
  const pendingCount = ordered.filter(
    (i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'converting'
  ).length;
  const failedCount = ordered.filter((i) => i.status === 'failed').length;

  const successPairs = useMemo(
    () =>
      successItems
        .filter((i) => !!i.googleDocUrl)
        .map((i) => ({ name: i.file.name, url: i.googleDocUrl as string })),
    [successItems]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header onOpenGuide={() => setShowGuide(true)} configStatus={configStatus} />

      {showGuide && <SetupGuide onClose={() => setShowGuide(false)} />}

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-10">
        <Hero />

        {configStatus === 'missing' && (
          <FirstTimeBanner onOpenGuide={() => setShowGuide(true)} />
        )}

        {globalError && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            <div>{globalError}</div>
          </div>
        )}

        <section
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`mt-8 rounded-2xl border-2 border-dashed bg-white p-10 text-center transition-all ${
            isDragging
              ? 'border-emerald-500 bg-emerald-50/60 shadow-lg shadow-emerald-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={onSelect}
          />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <UploadCloud className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">
            Drop Word documents here
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Drag & drop .docx files, or click to browse. Max{' '}
            {formatBytes(MAX_FILE_SIZE)} per file. Files are uploaded to the
            owner's Google Drive and converted to tab-separated text for Sheets.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <ArrowDownToLine className="h-4 w-4" /> Browse files
            </button>
            <button
              onClick={processQueue}
              disabled={
                isProcessing ||
                ordered.filter((i) => i.status === 'queued').length === 0
              }
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Converting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Convert all
                </>
              )}
            </button>
          </div>
        </section>

        {ordered.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold">Queue</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {ordered.length}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {successItems.length} done
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {pendingCount} pending
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  {failedCount} failed
                </span>
                <button
                  onClick={clearAll}
                  disabled={isProcessing}
                  className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
            </div>
            <ul>
              {ordered.map((item, idx) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  position={idx + 1}
                  onRemove={() => removeItem(item.id)}
                  onRetry={() => retryItem(item.id)}
                  disabled={isProcessing}
                />
              ))}
            </ul>
          </section>
        )}

        {successPairs.length > 0 && (
          <BulkLinksCard pairs={successPairs} />
        )}
      </main>
    </div>
  );
}

function Header({
  onOpenGuide,
  configStatus,
}: {
  onOpenGuide: () => void;
  configStatus: 'unknown' | 'ready' | 'missing';
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <FileText className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">DocBridge</span>
          <span className="ml-2 hidden text-xs text-slate-500 sm:inline">
            Word to Google Docs
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#/articles"
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-100"
          >
            <Sparkles className="h-3.5 w-3.5" /> Article Generator
          </a>
          <StatusPill status={configStatus} />
          <button
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Setup guide
          </button>
        </div>
      </div>
    </header>
  );
}

function StatusPill({ status }: { status: 'unknown' | 'ready' | 'missing' }) {
  if (status === 'unknown') return null;
  const ready = status === 'ready';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ready
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
          : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      {ready ? 'Connected to owner Drive' : 'Owner setup required'}
    </span>
  );
}

function Hero() {
  return (
    <div className="pt-2">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <Sparkles className="h-3 w-3" /> Word → Google Docs, bulk
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        Drop Word files. Get Google Doc links you can copy in bulk.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
        Every file is uploaded into the owner's Google Drive as a proper Google
        Doc. When the batch finishes, copy all the links at once — one per line
        or as filename + link — and paste straight into Google Sheets, an
        email, anywhere.
      </p>
    </div>
  );
}

function FirstTimeBanner({ onOpenGuide }: { onOpenGuide: () => void }) {
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-amber-900">
            One-time owner setup needed
          </h3>
          <p className="mt-1 text-sm text-amber-900/80">
            Connect your Google account once — about 5 minutes, no coding.
            After that, anyone with this URL can convert files into your
            Drive without ever signing in. Open the guide.
          </p>
        </div>
        <button
          onClick={onOpenGuide}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Open setup guide <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function QueueRow({
  item,
  position,
  onRemove,
  onRetry,
  disabled,
}: {
  item: QueueItem;
  position: number;
  onRemove: () => void;
  onRetry: () => void;
  disabled: boolean;
}) {
  const colors: Record<ItemStatus, string> = {
    queued: 'text-slate-500',
    uploading: 'text-amber-600',
    converting: 'text-amber-600',
    success: 'text-emerald-700',
    failed: 'text-rose-700',
  };

  const StatusIcon = () => {
    switch (item.status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-rose-600" />;
      case 'uploading':
      case 'converting':
        return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />;
      default:
        return <FileText className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700">
          {position}
        </span>
        <StatusIcon />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-800">
            {item.file.name}
          </div>
          <div className={`mt-0.5 truncate text-xs ${colors[item.status]}`}>
            {item.status === 'success' && 'Converted • Google Doc ready'}
            {item.status === 'queued' && `${formatBytes(item.file.size)} • queued`}
            {item.status === 'uploading' && 'Uploading to owner Drive…'}
            {item.status === 'converting' && 'Converting to Google Doc…'}
            {item.status === 'failed' && (item.error || 'Failed.')}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {item.status === 'success' && item.googleDocUrl && (
            <CopyLinkButton url={item.googleDocUrl} />
          )}
          {item.status === 'success' && item.googleDocUrl && (
            <a
              href={item.googleDocUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open Doc
            </a>
          )}
          {item.status === 'failed' && !disabled && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCw className="h-3.5 w-3.5" /> Retry
            </button>
          )}
          <button
            onClick={onRemove}
            disabled={disabled && item.status !== 'failed' && item.status !== 'queued'}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      title="Copy this link"
    >
      <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

type CopyFormat = 'urls' | 'name-url' | 'numbered';

function BulkLinksCard({ pairs }: { pairs: { name: string; url: string }[] }) {
  const [format, setFormat] = useState<CopyFormat>('urls');
  const [copied, setCopied] = useState(false);

  const stripExt = (n: string) => n.replace(/\.docx?$/i, '');
  const text = useMemo(() => {
    if (format === 'urls') return pairs.map((p) => p.url).join('\n');
    if (format === 'name-url')
      return pairs.map((p) => `${stripExt(p.name)}\t${p.url}`).join('\n');
    return pairs.map((p, i) => `${i + 1}. ${stripExt(p.name)} — ${p.url}`).join('\n');
  }, [pairs, format]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const options: { key: CopyFormat; label: string; hint: string }[] = [
    { key: 'urls', label: 'URLs only', hint: 'One link per line' },
    { key: 'name-url', label: 'Name + URL', hint: 'Two columns in Sheets' },
    { key: 'numbered', label: 'Numbered list', hint: '1. Name — URL' },
  ];

  return (
    <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-emerald-700" />
          <h3 className="text-sm font-semibold text-emerald-900">
            {pairs.length} {pairs.length === 1 ? 'link' : 'links'} ready to copy
          </h3>
        </div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied' : `Copy all (${formatLabel(format)})`}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => setFormat(o.key)}
            className={`group rounded-lg border px-3 py-2 text-left text-xs transition ${
              format === o.key
                ? 'border-emerald-500 bg-white shadow-sm ring-1 ring-emerald-500/30'
                : 'border-emerald-200 bg-white/60 hover:bg-white'
            }`}
          >
            <div className="font-semibold text-emerald-900">{o.label}</div>
            <div className="text-emerald-800/60">{o.hint}</div>
          </button>
        ))}
      </div>

      <pre className="mt-4 max-h-80 overflow-auto whitespace-pre rounded-lg border border-emerald-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
        {text || '(empty)'}
      </pre>

      <ol className="mt-4 space-y-1.5">
        {pairs.map((p, i) => (
          <li
            key={p.url}
            className="flex items-center gap-3 rounded-md bg-white px-3 py-1.5 shadow-sm"
          >
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded bg-emerald-100 text-[10px] font-semibold text-emerald-700">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
              {stripExt(p.name)}
            </span>
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 truncate text-[11px] font-medium text-emerald-700 hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatLabel(f: CopyFormat) {
  if (f === 'urls') return 'URLs';
  if (f === 'name-url') return 'name + URL';
  return 'numbered';
}

function SetupGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-semibold">Owner setup — do this once</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="space-y-6 px-6 py-6 text-sm text-slate-700">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
            You only do this once. After that, anyone you share the URL with can
            drop files — 2 people, 5 people, 50 people. They never sign in,
            never see Google's screens, never set anything up. Every converted
            file lands in your Drive.
          </p>

          <Step n={1} title="Make a Google Cloud project & enable Drive">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Go to{' '}
                <a
                  className="font-medium text-emerald-700 underline"
                  href="https://console.cloud.google.com/projectcreate"
                  target="_blank"
                  rel="noreferrer"
                >
                  console.cloud.google.com
                </a>{' '}
                and create a project named anything (e.g. DocBridge).
              </li>
              <li>
                Open{' '}
                <a
                  className="font-medium text-emerald-700 underline"
                  href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Drive API
                </a>{' '}
                with the project selected and click <strong>Enable</strong>.
              </li>
            </ul>
          </Step>

          <Step n={2} title="Set up the consent screen (and publish it)">
            <p>
              Open{' '}
              <a
                className="font-medium text-emerald-700 underline"
                href="https://console.cloud.google.com/apis/credentials/consent"
                target="_blank"
                rel="noreferrer"
              >
                OAuth consent screen
              </a>
              . Pick <strong>External</strong>, fill in App name and your email
              in the support + developer fields, save.
            </p>
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-inset ring-amber-200">
              <strong>Important — do this now:</strong> on the consent screen
              dashboard, click <strong>Publish app</strong> (and confirm). This
              makes the refresh token last forever instead of expiring every 7
              days. No Google verification is needed because we only request the
              non-sensitive <code className="rounded bg-amber-100 px-1">drive.file</code>{' '}
              scope.
            </p>
          </Step>

          <Step n={3} title="Create OAuth credentials">
            <p>
              Open{' '}
              <a
                className="font-medium text-emerald-700 underline"
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
              >
                Credentials
              </a>
              .
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Click <strong>+ Create credentials → OAuth client ID</strong>.
              </li>
              <li>
                Application type: <strong>Web application</strong>.
              </li>
              <li>
                Under <strong>Authorized redirect URIs</strong>, add:{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5">
                  https://developers.google.com/oauthplayground
                </code>
              </li>
              <li>
                Click <strong>Create</strong> and copy the <strong>Client ID</strong>{' '}
                and <strong>Client secret</strong>. Keep them on screen.
              </li>
            </ul>
          </Step>

          <Step n={4} title="Get a refresh token (no coding)">
            <p>
              Open{' '}
              <a
                className="font-medium text-emerald-700 underline"
                href="https://developers.google.com/oauthplayground"
                target="_blank"
                rel="noreferrer"
              >
                Google's OAuth Playground
              </a>
              .
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Click the gear icon (top right). Tick{' '}
                <strong>Use your own OAuth credentials</strong> and paste your
                Client ID + secret. Close the gear.
              </li>
              <li>
                On the left, scroll to <strong>Drive API v3</strong> and tick{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5">
                  https://www.googleapis.com/auth/drive.file
                </code>
                .
              </li>
              <li>
                Click <strong>Authorize APIs</strong>, sign in with the Google
                account where files should land, accept.
              </li>
              <li>
                Back on the Playground, click{' '}
                <strong>Exchange authorization code for tokens</strong>. Copy the{' '}
                <strong>Refresh token</strong> shown.
              </li>
            </ul>
          </Step>

          <Step n={5} title="Paste 3 values into Supabase">
            <p>
              In your Supabase dashboard, go to <strong>Project Settings →
              Edge Functions → Manage secrets</strong> and add these three:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <code className="rounded bg-slate-100 px-1.5 py-0.5">
                  GOOGLE_CLIENT_ID
                </code>{' '}
                — from step 3
              </li>
              <li>
                <code className="rounded bg-slate-100 px-1.5 py-0.5">
                  GOOGLE_CLIENT_SECRET
                </code>{' '}
                — from step 3
              </li>
              <li>
                <code className="rounded bg-slate-100 px-1.5 py-0.5">
                  GOOGLE_REFRESH_TOKEN
                </code>{' '}
                — from step 4
              </li>
            </ul>
            <p className="mt-2 text-slate-500">
              Save. Refresh this page. The pill at the top should say
              "Connected to owner Drive". Done — drop files and convert.
            </p>
          </Step>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
        {n}
      </div>
      <div className="flex-1 pt-0.5">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{children}</div>
      </div>
    </div>
  );
}

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Upload, FileText, Copy, Check,
  ExternalLink, X, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import CustomCursor from '../components/CustomCursor';

const STORAGE_KEY   = 'sheet_gen_script_url'; // reuse same Apps Script URL
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY      = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const MAX_PARALLEL  = 3;

type FileStatus = 'queued' | 'converting' | 'done' | 'failed';

interface ConvFile {
  id: string;
  file: File;
  status: FileStatus;
  url?: string;
  error?: string;
}

async function edgeFetch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `${path} failed (${res.status})`);
  }
  return res.json();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : 'Copy URL'}
    </button>
  );
}

export default function DocConverter() {
  const navigate = useNavigate();
  const [scriptUrl, setScriptUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [files, setFiles]         = useState<ConvFile[]>([]);
  const [running, setRunning]     = useState(false);
  const [dragging, setDragging]   = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const abortRef  = useRef(false);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const valid = Array.from(list).filter(f => /\.docx?$/i.test(f.name));
    if (!valid.length) return;
    setFiles(prev => [
      ...prev,
      ...valid.map(f => ({ id: `${f.name}-${Date.now()}-${Math.random()}`, file: f, status: 'queued' as FileStatus })),
    ]);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));

  const upd = (id: string, patch: Partial<ConvFile>) =>
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

  const convertAll = async () => {
    if (!scriptUrl.trim() || running) return;
    const toConvert = files.filter(f => f.status === 'queued' || f.status === 'failed');
    if (!toConvert.length) return;

    abortRef.current = false;
    setRunning(true);
    // reset failed → queued before starting
    setFiles(prev => prev.map(f => f.status === 'failed' ? { ...f, status: 'queued' } : f));

    let qi = 0;
    const worker = async () => {
      while (true) {
        if (abortRef.current) return;
        const i = qi++;
        if (i >= toConvert.length) return;
        const item = toConvert[i];
        upd(item.id, { status: 'converting' });
        try {
          const base64 = await fileToBase64(item.file);
          const res = await edgeFetch<{ ok: boolean; url: string }>('sheet-proxy', {
            url: scriptUrl.trim(),
            method: 'POST',
            body: { action: 'convertDoc', fileName: item.file.name, fileBase64: base64 },
          });
          upd(item.id, { status: 'done', url: res.url });
        } catch (err) {
          upd(item.id, { status: 'failed', error: (err as Error).message });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, toConvert.length) }, () => worker()));
    setRunning(false);
  };

  const doneCount       = files.filter(f => f.status === 'done').length;
  const failedCount     = files.filter(f => f.status === 'failed').length;
  const convertingCount = files.filter(f => f.status === 'converting').length;
  const queuedCount     = files.filter(f => f.status === 'queued').length;
  const pendingCount    = queuedCount + failedCount;

  return (
    <div className="min-h-screen bg-[#050508] text-slate-100">
      <CustomCursor />

      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/4 rounded-full opacity-25"
          style={{ width: '60vw', height: '60vw', background: '#0369a1', filter: 'blur(150px)' }} />
        <div className="absolute bottom-0 right-1/4 rounded-full opacity-18"
          style={{ width: '45vw', height: '45vw', background: '#4f46e5', filter: 'blur(140px)' }} />
        <div className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(rgba(59,130,246,1) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,1) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }} />
      </div>

      {/* Back button */}
      <button onClick={() => navigate('/')}
        className="fixed left-6 top-5 z-40 flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-500 backdrop-blur-md transition-colors hover:text-slate-300">
        <ChevronLeft className="h-3.5 w-3.5" />Dashboard
      </button>

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-24">

        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/[0.09] px-4 py-1.5 text-[10px] font-black tracking-[0.2em] uppercase text-blue-400">
            <FileText className="h-3 w-3" />Doc Converter
          </div>
          <h1 className="mb-3 font-black tracking-tight text-white" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)' }}>
            Word → Google Docs
          </h1>
          <p className="text-[14px] text-slate-500">
            Upload .docx files and get Google Doc URLs instantly.
            Processes up to {MAX_PARALLEL} files at the same time.
          </p>
        </div>

        {/* Script URL */}
        <div className="mb-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
            Apps Script URL
          </label>
          <input
            type="text"
            value={scriptUrl}
            onChange={e => { setScriptUrl(e.target.value); localStorage.setItem(STORAGE_KEY, e.target.value); }}
            placeholder="https://script.google.com/macros/s/..."
            className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3 font-mono text-[13px] text-slate-300 placeholder-slate-700 outline-none transition-colors focus:border-blue-500/50"
          />
          <p className="mt-2 text-[11px] text-slate-700">
            Same URL as Sheet Generator — just update the script with the <code className="rounded bg-white/[0.05] px-1 text-blue-400">convertDoc</code> action.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`mb-5 flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200 ${
            dragging
              ? 'border-blue-500/60 bg-blue-500/[0.07] scale-[1.01]'
              : 'border-white/[0.08] bg-white/[0.015] hover:border-white/[0.16] hover:bg-white/[0.03]'
          }`}
        >
          <input ref={inputRef} type="file" accept=".doc,.docx" multiple className="hidden"
            onChange={e => addFiles(e.target.files)} />
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${dragging ? 'bg-blue-500/20' : 'bg-white/[0.05]'}`}>
            <Upload className={`h-6 w-6 transition-colors ${dragging ? 'text-blue-400' : 'text-slate-600'}`} />
          </div>
          <div>
            <p className="mb-1 text-[14px] font-black text-slate-400">
              {dragging ? 'Drop to add files' : 'Drop .docx files or click to browse'}
            </p>
            <p className="text-[12px] text-slate-700">Supports .doc and .docx · Multiple files at once</p>
          </div>
        </div>

        {/* File queue */}
        {files.length > 0 && (
          <div className="mb-5">
            {/* Summary chips */}
            {(doneCount > 0 || failedCount > 0 || convertingCount > 0) && (
              <div className="mb-4 flex flex-wrap gap-2">
                {doneCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-black text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />{doneCount} Done
                  </span>
                )}
                {convertingCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[11px] font-black text-blue-400">
                    <Loader2 className="h-3 w-3 animate-spin" />{convertingCount} Converting
                  </span>
                )}
                {failedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-[11px] font-black text-red-400">
                    <AlertCircle className="h-3 w-3" />{failedCount} Failed
                  </span>
                )}
                {queuedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-800/50 px-3 py-1 text-[11px] font-black text-slate-500">
                    {queuedCount} Queued
                  </span>
                )}
              </div>
            )}

            <div className="space-y-2">
              {files.map(f => (
                <div key={f.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-300 ${
                    f.status === 'done'       ? 'border-emerald-500/20 bg-emerald-500/[0.04]' :
                    f.status === 'failed'     ? 'border-red-500/20 bg-red-500/[0.04]'         :
                    f.status === 'converting' ? 'border-blue-500/20 bg-blue-500/[0.04]'        :
                    'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <div className="shrink-0 w-5 flex items-center justify-center">
                    {f.status === 'done'       && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    {f.status === 'converting' && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
                    {f.status === 'failed'     && <AlertCircle className="h-4 w-4 text-red-400" />}
                    {f.status === 'queued'     && <FileText className="h-4 w-4 text-slate-600" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-slate-300">{f.file.name}</p>
                    {f.status === 'done' && f.url && (
                      <p className="truncate text-[11px] text-slate-600">{f.url}</p>
                    )}
                    {f.status === 'failed' && (
                      <p className="text-[11px] text-red-500">{f.error}</p>
                    )}
                    {f.status === 'converting' && (
                      <p className="text-[11px] text-blue-500/70">Converting to Google Doc…</p>
                    )}
                    {f.status === 'queued' && (
                      <p className="text-[11px] text-slate-700">{(f.file.size / 1024).toFixed(0)} KB</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {f.status === 'done' && f.url && (
                      <>
                        <CopyBtn text={f.url} />
                        <a href={f.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors">
                          <ExternalLink className="h-3.5 w-3.5" />Open
                        </a>
                      </>
                    )}
                    {(f.status === 'queued' || f.status === 'failed') && !running && (
                      <button onClick={() => removeFile(f.id)}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action bar */}
        {files.length > 0 && (
          <div className="mb-8 flex items-center gap-4">
            <button
              onClick={convertAll}
              disabled={running || !scriptUrl.trim() || pendingCount === 0}
              className="flex items-center gap-2.5 rounded-2xl bg-blue-600 px-8 py-3.5 text-[14px] font-black text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ boxShadow: (!running && scriptUrl && pendingCount > 0) ? '0 0 30px rgba(59,130,246,0.5)' : 'none' }}
            >
              {running
                ? <><Loader2 className="h-4 w-4 animate-spin" />Converting ({convertingCount} active)…</>
                : <><Upload className="h-4 w-4" />Convert {pendingCount} File{pendingCount !== 1 ? 's' : ''}</>
              }
            </button>
            {!running && (
              <button onClick={() => setFiles([])} className="text-xs font-bold text-slate-600 hover:text-slate-400 transition-colors">
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Copy all URLs */}
        {doneCount > 0 && (
          <div className="mb-8 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500">
                All Done URLs ({doneCount})
              </p>
              <button
                onClick={() => {
                  const urls = files.filter(f => f.status === 'done' && f.url).map(f => f.url).join('\n');
                  navigator.clipboard.writeText(urls);
                }}
                className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Copy className="h-3 w-3" />Copy all
              </button>
            </div>
            <div className="space-y-1">
              {files.filter(f => f.status === 'done' && f.url).map(f => (
                <div key={f.id} className="flex items-center gap-2">
                  <span className="truncate font-mono text-[11px] text-slate-500">{f.url}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Setup instructions */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6">
          <h3 className="mb-4 text-[11px] font-black uppercase tracking-widest text-slate-500">One-time Setup</h3>
          <ol className="space-y-3">
            {[
              <>In Apps Script editor: click <strong className="text-slate-400">Services (+)</strong> in the left sidebar → find <strong className="text-slate-400">Drive API</strong> → click <strong className="text-slate-400">Add</strong></>,
              <>Replace your <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-blue-400">doPost</code> function with the updated version (includes the <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-blue-400">convertDoc</code> action) — code provided below</>,
              <>Deploy a <strong className="text-slate-400">New Deployment</strong> (or a new version of your existing deployment)</>,
              <>Paste the script URL above — you're ready to drop files</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-[13px] text-slate-600">
                <span className="shrink-0 font-black text-blue-600">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Upload, FileText, Copy, Check,
  ExternalLink, X, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import CustomCursor from '../components/CustomCursor';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const MAX_PARALLEL = 3;

type FileStatus = 'queued' | 'converting' | 'done' | 'failed';

interface ConvFile {
  id: string;
  file: File;
  status: FileStatus;
  url?: string;
  error?: string;
}

async function convertDocx(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/convert-docx`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON_KEY}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Convert failed (${res.status})`);
  return data.googleDocUrl as string;
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
  const navigate  = useNavigate();
  const [files, setFiles]     = useState<ConvFile[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

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
    if (running) return;
    const toConvert = files.filter(f => f.status === 'queued' || f.status === 'failed');
    if (!toConvert.length) return;

    abortRef.current = false;
    setRunning(true);
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
          const url = await convertDocx(item.file);
          upd(item.id, { status: 'done', url });
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

      {/* Background — violet only, no blue */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/4 rounded-full opacity-28"
          style={{ width: '55vw', height: '55vw', background: '#5b21b6', filter: 'blur(150px)' }} />
        <div className="absolute bottom-0 right-1/4 rounded-full opacity-20"
          style={{ width: '45vw', height: '45vw', background: '#4c1d95', filter: 'blur(140px)' }} />
        <div className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(139,92,246,1) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)',
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
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/[0.09] px-4 py-1.5 text-[10px] font-black tracking-[0.2em] uppercase text-violet-400">
            <FileText className="h-3 w-3" />Doc Converter
          </div>
          <h1 className="mb-3 font-black tracking-tight text-white" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)' }}>
            Word → Google Docs
          </h1>
          <p className="text-[14px] text-slate-500">
            Drop your .docx files and get Google Doc URLs instantly.
            Converts up to {MAX_PARALLEL} files at the same time using your Google Drive.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`mb-5 flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-all duration-200 ${
            dragging
              ? 'border-violet-500/60 bg-violet-500/[0.07] scale-[1.01]'
              : 'border-white/[0.08] bg-white/[0.015] hover:border-white/[0.16] hover:bg-white/[0.03]'
          }`}
        >
          <input ref={inputRef} type="file" accept=".doc,.docx" multiple className="hidden"
            onChange={e => addFiles(e.target.files)} />
          <div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${dragging ? 'bg-violet-500/20' : 'bg-white/[0.05]'}`}>
            <Upload className={`h-7 w-7 transition-colors ${dragging ? 'text-violet-400' : 'text-slate-600'}`} />
          </div>
          <div>
            <p className="mb-1 text-[15px] font-black text-slate-300">
              {dragging ? 'Drop to add files' : 'Drop .docx files or click to browse'}
            </p>
            <p className="text-[12px] text-slate-700">Supports .doc and .docx · Multiple files at once</p>
          </div>
        </div>

        {/* File queue */}
        {files.length > 0 && (
          <div className="mb-5">
            {(doneCount > 0 || failedCount > 0 || convertingCount > 0) && (
              <div className="mb-4 flex flex-wrap gap-2">
                {doneCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-black text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />{doneCount} Done
                  </span>
                )}
                {convertingCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[11px] font-black text-violet-400">
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
                    f.status === 'converting' ? 'border-violet-500/20 bg-violet-500/[0.04]'   :
                    'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <div className="shrink-0 w-5 flex items-center justify-center">
                    {f.status === 'done'       && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    {f.status === 'converting' && <Loader2 className="h-4 w-4 animate-spin text-violet-400" />}
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
                      <p className="text-[11px] text-violet-500/70">Uploading & converting…</p>
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
              disabled={running || pendingCount === 0}
              className="flex items-center gap-2.5 rounded-2xl bg-violet-600 px-8 py-3.5 text-[14px] font-black text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ boxShadow: (!running && pendingCount > 0) ? '0 0 30px rgba(124,58,237,0.5)' : 'none' }}
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
          <div className="mb-6 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500">
                All Done — {doneCount} URL{doneCount !== 1 ? 's' : ''}
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
                <p key={f.id} className="truncate font-mono text-[11px] text-slate-600">{f.url}</p>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

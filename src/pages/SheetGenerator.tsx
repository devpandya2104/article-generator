import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import {
  ChevronLeft, Sheet, RefreshCw, Play, CheckCircle2, AlertCircle,
  Loader2, ExternalLink, Copy, Check, Clock, Zap, Link2,
  Settings2, X, FileText, Globe, Hash, Sparkles,
} from 'lucide-react';
import CustomCursor from '../components/CustomCursor';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY      = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const STORAGE_KEY   = 'sheet_gen_script_url';
const DEFAULT_TOPIC = 'Online Slots';

/* ── Types ─────────────────────────────────────────────────────── */
interface SheetRow {
  _rowIndex: number;
  'Order ID': string;
  'Article Title': string;
  'Publisher Website': string;
  'Anchor Text 1': string;
  'Anchor URL 1': string;
  'Anchor Text 2': string;
  'Anchor URL 2': string;
  'Anchor Text 3': string;
  'Anchor URL 3': string;
  'Language': string;
  'Min. Word Count': string;
  'Max. Word Count': string;
  'Status': string;
  'Article DOC URL': string;
  'DOC Word count': string;
  'time': string;
  [key: string]: string | number;
}

type ProcStatus = 'pending' | 'title' | 'article' | 'doc' | 'sheet' | 'done' | 'failed';

interface ProcRow extends SheetRow {
  procStatus: ProcStatus;
  finalTitle: string;
  docUrl?: string;
  wordCount?: number;
  duration?: number;
  error?: string;
}

/* ── Helpers ────────────────────────────────────────────────────── */
function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function countWords(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
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

async function sheetProxy<T>(scriptUrl: string, method: 'GET' | 'POST', body?: object): Promise<T> {
  const res = await edgeFetch<T>('sheet-proxy', { url: scriptUrl, method, body });
  return res;
}

/* ── Status config ─────────────────────────────────────────────── */
const STATUS_CFG: Record<ProcStatus, { label: string; color: string; dot: string }> = {
  pending:  { label: 'Pending',          color: 'text-slate-500',   dot: 'bg-slate-600'   },
  title:    { label: 'Generating title', color: 'text-amber-400',   dot: 'bg-amber-400'   },
  article:  { label: 'Writing article',  color: 'text-violet-400',  dot: 'bg-violet-400'  },
  doc:      { label: 'Creating doc',     color: 'text-sky-400',     dot: 'bg-sky-400'     },
  sheet:    { label: 'Updating sheet',   color: 'text-indigo-400',  dot: 'bg-indigo-400'  },
  done:     { label: 'Completed',        color: 'text-emerald-400', dot: 'bg-emerald-400' },
  failed:   { label: 'Failed',           color: 'text-red-400',     dot: 'bg-red-400'     },
};

/* ── APPS SCRIPT CODE ───────────────────────────────────────────── */
const APPS_SCRIPT = `function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
  }
  const headers = values[0];
  const rows = values.slice(1).map((row, idx) => {
    const obj = { _rowIndex: idx + 2 };
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]) : ''; });
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const { rowIndex, updates } = data;
    updates.forEach(({ column, value }) => {
      const colIdx = headers.indexOf(column) + 1;
      if (colIdx > 0) sheet.getRange(rowIndex, colIdx).setValue(value);
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

/* ── CopyBtn ────────────────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

/* ── SetupPanel ─────────────────────────────────────────────────── */
function SetupPanel({ onSave }: { onSave: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const test = async () => {
    if (!url.trim()) return;
    setTesting(true); setError('');
    try {
      await sheetProxy(url.trim(), 'GET');
      onSave(url.trim());
    } catch {
      setError('Connection failed. Make sure the script is deployed correctly and the URL is right.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-16">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600"
          style={{ boxShadow: '0 4px 24px rgba(16,185,129,0.35)' }}>
          <Sheet className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Connect Google Sheet</h1>
        <p className="mt-2 text-slate-500">One-time setup using a Google Apps Script web app</p>
      </div>

      {/* Steps */}
      <div className="mb-8 space-y-5">
        {[
          { n: 1, title: 'Open your Google Sheet', body: 'The sheet containing your order data with the correct column headers.' },
          { n: 2, title: 'Open Apps Script', body: 'Click Extensions → Apps Script in the menu bar.' },
          {
            n: 3, title: 'Paste the script', body: null,
            code: true,
          },
          { n: 4, title: 'Deploy as Web App', body: 'Click Deploy → New deployment. Set Type: Web app, Execute as: Me, Who has access: Anyone. Click Deploy and authorize.' },
          { n: 5, title: 'Paste the Web App URL below', body: 'Copy the deployment URL and paste it in the field below.' },
        ].map(step => (
          <div key={step.n} className="flex gap-4 rounded-2xl border border-white/[0.07] bg-[#0a0a14] p-5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-xs font-black text-violet-400">
              {step.n}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-200 mb-1">{step.title}</p>
              {step.body && <p className="text-xs text-slate-500 leading-relaxed">{step.body}</p>}
              {step.code && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">Apps Script code</span>
                    <CopyBtn text={APPS_SCRIPT} />
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-xl border border-white/[0.07] bg-black/40 p-4 text-[11px] leading-relaxed text-emerald-400 font-mono">
                    {APPS_SCRIPT}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* URL input */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a14] p-6">
        <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">
          Web App URL
        </label>
        <div className="flex gap-3">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && test()}
            placeholder="https://script.google.com/macros/s/..."
            className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-violet-500/50 transition-colors"
          />
          <button
            onClick={test}
            disabled={testing || !url.trim()}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40 hover:bg-violet-500 transition-colors"
            style={{ boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {testing ? 'Testing…' : 'Connect'}
          </button>
        </div>
        {error && (
          <p className="mt-3 flex items-start gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── RowCard ────────────────────────────────────────────────────── */
function RowCard({ row }: { row: ProcRow }) {
  const ref = useRef<HTMLDivElement>(null);
  const cfg = STATUS_CFG[row.procStatus];
  const isActive = row.procStatus === 'title' || row.procStatus === 'article' || row.procStatus === 'doc' || row.procStatus === 'sheet';

  useEffect(() => {
    if (ref.current) {
      gsap.from(ref.current, { y: 24, opacity: 0, duration: 0.45, ease: 'back.out(1.5)' });
    }
  }, []);

  return (
    <div ref={ref} className="rounded-2xl border border-white/[0.07] bg-[#0a0a14] p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
              {row['Order ID'] || '—'}
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-[10px] font-semibold text-slate-600 flex items-center gap-1">
              <Globe className="h-2.5 w-2.5" />{row['Publisher Website'] || '—'}
            </span>
          </div>
          <p className="text-sm font-black text-slate-200 leading-snug">
            {row.finalTitle || row['Article Title'] || (
              <span className="text-slate-600 italic">Title will be generated…</span>
            )}
          </p>
        </div>
        {/* Status */}
        <div className={`flex items-center gap-1.5 shrink-0 text-xs font-black ${cfg.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${isActive ? 'animate-pulse' : ''}`} />
          {cfg.label}
        </div>
      </div>

      {/* Meta chips */}
      {row.procStatus === 'done' && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/[0.05]">
          {row.docUrl && (
            <a href={row.docUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-400 hover:text-emerald-300 transition-colors">
              <ExternalLink className="h-3 w-3" />View Doc
            </a>
          )}
          {row.wordCount && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-bold text-slate-500">
              <FileText className="h-3 w-3" />{row.wordCount.toLocaleString()} words
            </span>
          )}
          {row.duration && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-bold text-slate-500">
              <Clock className="h-3 w-3" />{formatMs(row.duration)}
            </span>
          )}
        </div>
      )}

      {row.procStatus === 'failed' && row.error && (
        <p className="mt-3 pt-3 border-t border-white/[0.05] text-xs text-red-400 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{row.error}
        </p>
      )}
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────── */
export default function SheetGenerator() {
  const navigate = useNavigate();
  const [scriptUrl, setScriptUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [procRows, setProcRows] = useState<ProcRow[]>([]);
  const [running, setRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const abortRef = useRef(false);

  const pending = sheetRows.filter(r => !r['Status'] || r['Status'].trim() === '');
  const done    = sheetRows.filter(r => r['Status']?.toLowerCase().includes('complet'));
  const failed  = sheetRows.filter(r => r['Status']?.toLowerCase().includes('fail'));
  const isConfigured = !!scriptUrl;

  /* ── Save URL ── */
  const saveUrl = async () => {
    if (!newUrl.trim()) return;
    setSavingUrl(true);
    try {
      await sheetProxy(newUrl.trim(), 'GET');
      localStorage.setItem(STORAGE_KEY, newUrl.trim());
      setScriptUrl(newUrl.trim());
      setNewUrl('');
      setShowSettings(false);
    } catch {
      setFetchError('Could not connect with new URL.');
    } finally {
      setSavingUrl(false);
    }
  };

  /* ── Fetch sheet rows ── */
  const fetchRows = useCallback(async () => {
    if (!scriptUrl) return;
    setFetching(true); setFetchError('');
    try {
      const rows = await sheetProxy<SheetRow[]>(scriptUrl, 'GET');
      setSheetRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setFetchError((e as Error).message || 'Failed to read sheet');
    } finally {
      setFetching(false);
    }
  }, [scriptUrl]);

  useEffect(() => {
    if (isConfigured) fetchRows();
  }, [isConfigured, fetchRows]);

  /* ── Update a single row in the sheet ── */
  const updateRow = async (rowIndex: number, updates: { column: string; value: string }[]) => {
    await sheetProxy(scriptUrl, 'POST', { rowIndex, updates });
  };

  /* ── Process all pending rows ── */
  const processAll = async () => {
    const toProcess = sheetRows.filter(r => !r['Status'] || r['Status'].trim() === '');
    if (!toProcess.length || running) return;

    abortRef.current = false;
    setRunning(true);

    const initialRows: ProcRow[] = toProcess.map(r => ({
      ...r,
      procStatus: 'pending',
      finalTitle: r['Article Title'] || '',
    }));
    setProcRows(initialRows);

    const updateProc = (rowIndex: number, patch: Partial<ProcRow>) => {
      setProcRows(prev => prev.map(r => r._rowIndex === rowIndex ? { ...r, ...patch } : r));
    };

    let queueIdx = 0;

    const worker = async () => {
      while (true) {
        if (abortRef.current) return;
        const i = queueIdx++;
        if (i >= toProcess.length) return;
        const row = toProcess[i];
        const rid = row._rowIndex;
        const t0  = Date.now();

        try {
          /* 1 — Generate title if missing */
          let title = row['Article Title']?.trim();
          if (!title) {
            updateProc(rid, { procStatus: 'title' });
            await updateRow(rid, [{ column: 'Status', value: 'Processing' }]);
            const res = await edgeFetch<{ titles: string[] }>('generate-titles', {
              topic: DEFAULT_TOPIC, count: 1,
            });
            title = res.titles[0] || `${DEFAULT_TOPIC} Guide`;
            updateProc(rid, { finalTitle: title });
          } else {
            await updateRow(rid, [{ column: 'Status', value: 'Processing' }]);
          }

          /* 2 — Build anchors */
          const anchors = [1, 2, 3]
            .filter(n => row[`Anchor Text ${n}`] && row[`Anchor URL ${n}`])
            .map(n => ({ text: String(row[`Anchor Text ${n}`]), url: String(row[`Anchor URL ${n}`]) }));

          const language     = row['Language']?.trim()       || 'English';
          const minWordCount = parseInt(row['Min. Word Count']) || 1000;
          const maxWordCount = parseInt(row['Max. Word Count']) || 1300;

          /* 3 — Generate article HTML */
          updateProc(rid, { procStatus: 'article' });
          const artData = await edgeFetch<{ html: string }>('generate-article', {
            title, anchors, minWordCount, maxWordCount, language,
          });

          const wc = countWords(artData.html);

          /* 4 — Create Google Doc */
          updateProc(rid, { procStatus: 'doc' });
          const docName = `${row['Order ID']} - ${row['Publisher Website']}`;
          const docData = await edgeFetch<{ googleDocUrl: string }>('create-article-doc', {
            title, bodyHtml: artData.html, docName,
          });

          const duration = Date.now() - t0;

          /* 5 — Write back to sheet */
          updateProc(rid, { procStatus: 'sheet' });
          await updateRow(rid, [
            { column: 'Status',          value: 'Completed'          },
            { column: 'Article DOC URL', value: docData.googleDocUrl },
            { column: 'DOC Word count',  value: String(wc)           },
            { column: 'time',            value: formatMs(duration)   },
          ]);

          updateProc(rid, {
            procStatus: 'done',
            docUrl: docData.googleDocUrl,
            wordCount: wc,
            duration,
          });

        } catch (err) {
          const msg = (err as Error).message || 'Unknown error';
          updateProc(rid, { procStatus: 'failed', error: msg });
          try {
            await updateRow(rid, [{ column: 'Status', value: 'Failed' }]);
          } catch { /* best effort */ }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, toProcess.length) }, () => worker()));
    setRunning(false);
    fetchRows();
  };

  /* ── Handle initial setup save ── */
  const handleSetup = (url: string) => {
    localStorage.setItem(STORAGE_KEY, url);
    setScriptUrl(url);
  };

  /* ── Sheet stats ── */
  const doneCount    = procRows.filter(r => r.procStatus === 'done').length;
  const failedCount  = procRows.filter(r => r.procStatus === 'failed').length;
  const activeCount  = procRows.filter(r => r.procStatus !== 'pending' && r.procStatus !== 'done' && r.procStatus !== 'failed').length;

  /* ══════════════════════════════════════════════════════════ */
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-[#04040a] text-slate-100 overflow-x-hidden px-6">
        <CustomCursor />
        <button onClick={() => navigate('/')}
          className="fixed top-5 left-6 z-40 flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-500 backdrop-blur-md transition-all hover:border-violet-500/30 hover:bg-violet-500/[0.07] hover:text-slate-200">
          <ChevronLeft className="h-3.5 w-3.5" />Dashboard
        </button>
        <SetupPanel onSave={handleSetup} />
      </div>
    );
  }

  /* ── Configured main view ── */
  return (
    <div className="min-h-screen bg-[#04040a] text-slate-100 overflow-x-hidden">
      <CustomCursor />

      {/* ── Fixed header ── */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-white/[0.05] bg-[#04040a]/80 px-8 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-300 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />Dashboard
          </button>
          <span className="text-slate-800">|</span>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
              <Sheet className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-black text-white">Sheet Generator</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Connected
          </span>
          <button onClick={() => { setShowSettings(true); setNewUrl(scriptUrl); }}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-200 transition-colors">
            <Settings2 className="h-3.5 w-3.5" />Settings
          </button>
        </div>
      </header>

      {/* ── Settings modal ── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0e0e1a] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-black text-white">Update Script URL</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-600 hover:text-slate-300 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/..."
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-violet-500/50 mb-4 transition-colors"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowSettings(false)} className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm font-bold text-slate-500 hover:text-slate-300 transition-colors">
                Cancel
              </button>
              <button onClick={saveUrl} disabled={savingUrl}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-black text-white hover:bg-violet-500 disabled:opacity-40 transition-colors">
                {savingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {savingUrl ? 'Testing…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-4xl px-6 pt-28 pb-20">

        {/* ── Stats bar ── */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total rows',  value: sheetRows.length,        color: 'text-slate-300'  },
            { label: 'Pending',     value: pending.length,          color: 'text-amber-400'  },
            { label: 'Completed',   value: done.length,             color: 'text-emerald-400'},
            { label: 'Failed',      value: failed.length,           color: 'text-red-400'    },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-white/[0.07] bg-[#0a0a14] p-4 text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="mt-0.5 text-xs font-semibold text-slate-600">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Action bar ── */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <button onClick={fetchRows} disabled={fetching || running}
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-black text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors">
            <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Checking…' : 'Check for Pending'}
          </button>

          <button onClick={processAll} disabled={running || !pending.length || fetching}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-40 transition-all"
            style={{ boxShadow: pending.length && !running ? '0 0 20px rgba(16,185,129,0.35)' : 'none' }}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? `Processing… (${activeCount} active)` : `Process Pending (${pending.length})`}
          </button>

          {running && (
            <button onClick={() => { abortRef.current = true; }}
              className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-black text-red-400 hover:bg-red-500/20 transition-colors">
              <X className="h-4 w-4" />Abort
            </button>
          )}
        </div>

        {fetchError && (
          <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {fetchError}
          </div>
        )}

        {/* ── Processing rows ── */}
        {procRows.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">
                Processing — {doneCount}/{procRows.length} done
                {failedCount > 0 && <span className="ml-2 text-red-400">· {failedCount} failed</span>}
              </h2>
              {!running && (
                <button onClick={() => setProcRows([])} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                  Clear
                </button>
              )}
            </div>
            {/* Progress bar */}
            <div className="relative mb-5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${procRows.length ? (doneCount / procRows.length) * 100 : 0}%` }}
              />
            </div>
            <div className="space-y-3">
              {procRows.map(r => <RowCard key={r._rowIndex} row={r} />)}
            </div>
          </section>
        )}

        {/* ── Pending rows preview ── */}
        {pending.length > 0 && procRows.length === 0 && (
          <section>
            <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-500">
              Pending — {pending.length} rows
            </h2>
            <div className="space-y-3">
              {pending.map(row => (
                <div key={row._rowIndex}
                  className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-[#0a0a14] px-5 py-4">
                  {/* Order */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <Hash className="h-4 w-4 text-violet-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 mb-0.5">
                      {row['Order ID'] || '—'}
                    </div>
                    <div className="text-sm font-bold text-slate-300 truncate">
                      {row['Article Title'] ? (
                        <span>{row['Article Title']}</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <Sparkles className="h-3 w-3 text-violet-500" />Will generate title
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Website */}
                  <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <Globe className="h-3.5 w-3.5" />{row['Publisher Website'] || '—'}
                  </span>
                  {/* Anchors count */}
                  {([1, 2, 3].filter(n => row[`Anchor Text ${n}`] && row[`Anchor URL ${n}`]).length > 0) && (
                    <span className="hidden sm:flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Link2 className="h-3.5 w-3.5" />
                      {[1, 2, 3].filter(n => row[`Anchor Text ${n}`] && row[`Anchor URL ${n}`]).length} anchor{[1, 2, 3].filter(n => row[`Anchor Text ${n}`] && row[`Anchor URL ${n}`]).length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black text-amber-400">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Empty state ── */}
        {!fetching && sheetRows.length > 0 && pending.length === 0 && procRows.length === 0 && (
          <div className="py-20 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-3" />
            <p className="text-slate-400 font-bold">All rows are completed!</p>
            <p className="text-xs text-slate-600 mt-1">No pending articles found in the sheet.</p>
          </div>
        )}

        {!fetching && sheetRows.length === 0 && procRows.length === 0 && (
          <div className="py-20 text-center">
            <Sheet className="mx-auto h-10 w-10 text-slate-700 mb-3" />
            <p className="text-slate-500 font-bold">Sheet is empty</p>
            <p className="text-xs text-slate-600 mt-1">No rows found. Check your sheet has data and headers match.</p>
          </div>
        )}
      </div>
    </div>
  );
}

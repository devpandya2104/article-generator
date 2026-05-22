import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import {
  ChevronLeft, RefreshCw, Play, CheckCircle2, AlertCircle,
  Loader2, ExternalLink, Copy, Check, Clock, Zap, Link2,
  Settings2, X, FileText, Globe, Hash, Sparkles, Sheet,
  History, LayoutGrid,
} from 'lucide-react';
import CustomCursor from '../components/CustomCursor';
import { supabase } from '../lib/supabase';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY      = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const STORAGE_KEY   = 'sheet_gen_script_url';
const DEFAULT_TOPIC = 'Online Slots';
const TITLE_HIGHLIGHT_COLOR = '#ede9fe'; // light violet — marks auto-generated titles

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

interface SheetUpdate { column: string; value: string; bgColor?: string; }

type ProcStatus = 'pending' | 'title' | 'article' | 'doc' | 'sheet' | 'done' | 'failed';

interface ProcRow extends SheetRow {
  procStatus: ProcStatus;
  finalTitle: string;
  docUrl?: string;
  wordCount?: number;
  duration?: number;
  error?: string;
}

interface HistoryArticle {
  id: string;
  title: string;
  status: string;
  google_doc_url: string | null;
  word_count: number;
  duration_ms: number;
  order_id: string | null;
  publisher_website: string | null;
}

interface HistoryBatch {
  id: string;
  batch_started_at: string | null;
  batch_completed_at: string | null;
  articles: HistoryArticle[];
}

type ActiveTab = 'generator' | 'status' | 'history';

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
  return edgeFetch<T>('sheet-proxy', { url: scriptUrl, method, body });
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

/* ── Apps Script code (with bgColor + title write support) ─────── */
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
    updates.forEach(({ column, value, bgColor }) => {
      const colIdx = headers.indexOf(column) + 1;
      if (colIdx > 0) {
        const cell = sheet.getRange(rowIndex, colIdx);
        if (value !== undefined && value !== null) cell.setValue(value);
        if (bgColor) cell.setBackground(bgColor);
      }
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
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
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
      setError('Connection failed. Make sure the script is deployed correctly.');
    } finally { setTesting(false); }
  };

  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="mb-10 text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600"
          style={{ boxShadow: '0 4px 24px rgba(16,185,129,0.35)' }}>
          <Sheet className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Connect Google Sheet</h1>
        <p className="mt-2 text-slate-500">One-time setup using a Google Apps Script web app</p>
      </div>

      <div className="mb-8 space-y-4">
        {[
          { n: 1, title: 'Open your Google Sheet', body: 'The sheet with your order data and the correct column headers.' },
          { n: 2, title: 'Open Apps Script', body: 'Click Extensions → Apps Script in the menu bar.' },
          { n: 3, title: 'Paste the script below', body: null, code: true },
          { n: 4, title: 'Deploy as Web App', body: 'Deploy → New deployment. Set Type: Web app, Execute as: Me, Who has access: Anyone. Click Deploy and authorize.' },
          { n: 5, title: 'Paste the Web App URL below', body: 'Copy the deployment URL and paste it in the field below.' },
        ].map(step => (
          <div key={step.n} className="flex gap-4 rounded-2xl border border-white/[0.07] bg-[#0a0a14] p-5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-xs font-black text-violet-400">{step.n}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-200 mb-1">{step.title}</p>
              {step.body && <p className="text-xs text-slate-500 leading-relaxed">{step.body}</p>}
              {step.code && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">Apps Script — supports title write-back + cell highlighting</span>
                    <CopyBtn text={APPS_SCRIPT} />
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-xl border border-white/[0.07] bg-black/40 p-4 text-[11px] leading-relaxed text-emerald-400 font-mono">{APPS_SCRIPT}</pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a14] p-6">
        <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Web App URL</label>
        <div className="flex gap-3">
          <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && test()}
            placeholder="https://script.google.com/macros/s/..."
            className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-violet-500/50 transition-colors" />
          <button onClick={test} disabled={testing || !url.trim()}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40 hover:bg-violet-500 transition-colors"
            style={{ boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {testing ? 'Testing…' : 'Connect'}
          </button>
        </div>
        {error && <p className="mt-3 flex items-start gap-2 text-xs text-red-400"><AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}</p>}
      </div>
    </div>
  );
}

/* ── ProcRowCard ────────────────────────────────────────────────── */
function ProcRowCard({ row }: { row: ProcRow }) {
  const ref = useRef<HTMLDivElement>(null);
  const cfg = STATUS_CFG[row.procStatus];
  const isActive = ['title','article','doc','sheet'].includes(row.procStatus);

  useEffect(() => {
    if (ref.current) gsap.from(ref.current, { y: 24, opacity: 0, duration: 0.45, ease: 'back.out(1.5)' });
  }, []);

  return (
    <div ref={ref} className="rounded-2xl border border-white/[0.07] bg-[#0a0a14] p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">{row['Order ID'] || '—'}</span>
            <span className="text-slate-700">·</span>
            <span className="text-[10px] font-semibold text-slate-600 flex items-center gap-1"><Globe className="h-2.5 w-2.5" />{row['Publisher Website'] || '—'}</span>
          </div>
          <p className="text-sm font-black text-slate-200 leading-snug">
            {row.finalTitle || row['Article Title'] || <span className="text-slate-600 italic">Generating title…</span>}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 shrink-0 text-xs font-black ${cfg.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${isActive ? 'animate-pulse' : ''}`} />
          {cfg.label}
        </div>
      </div>
      {row.procStatus === 'done' && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/[0.05]">
          {row.docUrl && (
            <a href={row.docUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-400 hover:text-emerald-300 transition-colors">
              <ExternalLink className="h-3 w-3" />View Doc
            </a>
          )}
          {row.wordCount && <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-bold text-slate-500"><FileText className="h-3 w-3" />{row.wordCount.toLocaleString()} words</span>}
          {row.duration && <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-bold text-slate-500"><Clock className="h-3 w-3" />{formatMs(row.duration)}</span>}
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

/* ── SheetStatusTab ─────────────────────────────────────────────── */
function SheetStatusTab({ rows, procRows, loading, onRefresh }: { rows: SheetRow[]; procRows: ProcRow[]; loading: boolean; onRefresh: () => void }) {
  const activeIds = new Set(
    procRows
      .filter(r => ['title','article','doc','sheet'].includes(r.procStatus))
      .map(r => r._rowIndex)
  );
  const completed  = rows.filter(r => r['Status']?.toLowerCase().includes('complet'));
  const processing = rows.filter(r => activeIds.has(r._rowIndex));
  const pending    = rows.filter(r => {
    const s = r['Status']?.trim().toLowerCase();
    return (!s || s === '' || s === 'processing') && !activeIds.has(r._rowIndex);
  });
  const failed     = rows.filter(r => r['Status']?.toLowerCase().includes('fail'));

  const categories = [
    { key: 'completed',  label: 'Completed',  rows: completed,  color: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/[0.06]' },
    { key: 'processing', label: 'Processing', rows: processing, color: 'text-amber-400',   dot: 'bg-amber-400',   border: 'border-amber-500/20',   bg: 'bg-amber-500/[0.06]'   },
    { key: 'pending',    label: 'Pending',    rows: pending,    color: 'text-slate-400',   dot: 'bg-slate-500',   border: 'border-white/[0.07]',   bg: 'bg-white/[0.02]'       },
    { key: 'failed',     label: 'Failed',     rows: failed,     color: 'text-red-400',     dot: 'bg-red-500',     border: 'border-red-500/20',     bg: 'bg-red-500/[0.06]'     },
  ];

  return (
    <div>
      {/* Summary chips */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {categories.map(c => (
            <div key={c.key} className={`flex items-center gap-2 rounded-xl border ${c.border} ${c.bg} px-4 py-2`}>
              <span className={`h-2 w-2 rounded-full ${c.dot}`} />
              <span className={`text-sm font-black ${c.color}`}>{c.rows.length}</span>
              <span className="text-xs font-semibold text-slate-500">{c.label}</span>
            </div>
          ))}
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh Sheet
        </button>
      </div>

      {/* Category sections */}
      <div className="space-y-6">
        {categories.filter(c => c.rows.length > 0).map(cat => (
          <div key={cat.key}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`h-2 w-2 rounded-full ${cat.dot}`} />
              <h3 className={`text-xs font-black uppercase tracking-widest ${cat.color}`}>{cat.label} — {cat.rows.length}</h3>
            </div>
            <div className="space-y-2">
              {cat.rows.map(row => (
                <div key={row._rowIndex}
                  className={`flex items-center gap-4 rounded-xl border ${cat.border} bg-[#0a0a14] px-4 py-3`}>
                  {/* Row number */}
                  <span className="text-[10px] font-black text-slate-700 w-6 shrink-0">R{row._rowIndex}</span>
                  {/* Order ID */}
                  <span className="text-[11px] font-black text-slate-500 shrink-0 w-28 truncate">{row['Order ID'] || '—'}</span>
                  {/* Title */}
                  <span className="flex-1 min-w-0 text-sm font-semibold text-slate-300 truncate">
                    {row['Article Title'] || <span className="text-slate-600 italic text-xs">No title yet</span>}
                  </span>
                  {/* Website */}
                  <span className="hidden sm:flex items-center gap-1 text-xs text-slate-600 shrink-0">
                    <Globe className="h-3 w-3" />{row['Publisher Website'] || '—'}
                  </span>
                  {/* Doc link */}
                  {row['Article DOC URL'] && (
                    <a href={row['Article DOC URL']} target="_blank" rel="noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] font-black text-emerald-500 hover:text-emerald-300 transition-colors">
                      <ExternalLink className="h-3 w-3" />Doc
                    </a>
                  )}
                  {/* Word count */}
                  {row['DOC Word count'] && (
                    <span className="hidden sm:block text-[10px] font-semibold text-slate-600 shrink-0">
                      {row['DOC Word count']}w
                    </span>
                  )}
                  {/* Time */}
                  {row['time'] && (
                    <span className="hidden md:block text-[10px] font-semibold text-slate-700 shrink-0">{row['time']}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {rows.length === 0 && !loading && (
          <div className="py-16 text-center">
            <Sheet className="mx-auto h-8 w-8 text-slate-700 mb-3" />
            <p className="text-slate-500 font-bold">No sheet data loaded</p>
            <p className="text-xs text-slate-600 mt-1">Click "Refresh Sheet" to load the latest data.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SheetHistoryTab ────────────────────────────────────────────── */
function SheetHistoryTab() {
  const [batches, setBatches] = useState<HistoryBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: batchData } = await supabase
        .from('article_batches')
        .select('id, batch_started_at, batch_completed_at')
        .eq('source', 'sheet')
        .order('batch_started_at', { ascending: false })
        .limit(30);

      if (!batchData?.length) { setBatches([]); return; }

      const ids = batchData.map(b => b.id);
      const { data: artData } = await supabase
        .from('articles')
        .select('id, batch_id, title, status, google_doc_url, word_count, duration_ms, order_id, publisher_website')
        .in('batch_id', ids);

      const artMap: Record<string, HistoryArticle[]> = {};
      (artData || []).forEach(a => {
        (artMap[a.batch_id] ||= []).push(a as HistoryArticle);
      });

      setBatches(batchData.map(b => ({ ...b, articles: artMap[b.id] || [] })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setExpanded(p => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" />Loading history…
    </div>
  );

  if (!batches.length) return (
    <div className="py-20 text-center">
      <History className="mx-auto h-8 w-8 text-slate-700 mb-3" />
      <p className="text-slate-500 font-bold">No history yet</p>
      <p className="text-xs text-slate-600 mt-1">Processed batches will appear here.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">{batches.length} Run{batches.length !== 1 ? 's' : ''}</p>
        <button onClick={load} className="text-xs text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3" />Refresh
        </button>
      </div>

      {batches.map(batch => {
        const done   = batch.articles.filter(a => a.status === 'done').length;
        const failed = batch.articles.filter(a => a.status === 'failed').length;
        const total  = batch.articles.length;
        const dur    = batch.batch_started_at && batch.batch_completed_at
          ? formatMs(new Date(batch.batch_completed_at).getTime() - new Date(batch.batch_started_at).getTime())
          : null;
        const isOpen = expanded.has(batch.id);
        const date   = batch.batch_started_at ? new Date(batch.batch_started_at) : null;

        return (
          <div key={batch.id} className="rounded-2xl border border-white/[0.07] bg-[#0a0a14] overflow-hidden">
            {/* Batch header */}
            <button onClick={() => toggle(batch.id)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-slate-200 mb-1">
                  Sheet Run
                  {date && <span className="ml-2 text-xs font-semibold text-slate-600">
                    {date.toLocaleDateString()} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                  <span className="text-slate-500">{total} article{total !== 1 ? 's' : ''}</span>
                  {done > 0 && <span className="text-emerald-400">✓ {done} done</span>}
                  {failed > 0 && <span className="text-red-400">✗ {failed} failed</span>}
                  {dur && <span className="text-slate-600 flex items-center gap-1"><Clock className="h-3 w-3" />{dur}</span>}
                </div>
              </div>
              {/* Mini progress bar */}
              <div className="hidden sm:block w-24 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all"
                  style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
              </div>
              <span className="text-xs text-slate-600">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Expanded articles */}
            {isOpen && (
              <div className="border-t border-white/[0.05] divide-y divide-white/[0.04]">
                {batch.articles.map(art => (
                  <div key={art.id} className="flex items-center gap-4 px-5 py-3">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${art.status === 'done' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-300 truncate">{art.title}</p>
                      <p className="text-[10px] font-semibold text-slate-600 mt-0.5">
                        {art.order_id && <span className="mr-2">{art.order_id}</span>}
                        {art.publisher_website && <span className="flex items-center gap-1 inline-flex"><Globe className="h-2.5 w-2.5" />{art.publisher_website}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {art.word_count > 0 && <span className="text-[10px] text-slate-600">{art.word_count.toLocaleString()}w</span>}
                      {art.duration_ms > 0 && <span className="text-[10px] text-slate-700">{formatMs(art.duration_ms)}</span>}
                      {art.google_doc_url && (
                        <a href={art.google_doc_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-500 hover:text-emerald-300 transition-colors">
                          <ExternalLink className="h-3 w-3" />Doc
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══ Main ═══════════════════════════════════════════════════════════ */
export default function SheetGenerator() {
  const navigate = useNavigate();
  const [scriptUrl, setScriptUrl]   = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [activeTab, setActiveTab]   = useState<ActiveTab>('generator');
  const [sheetRows, setSheetRows]   = useState<SheetRow[]>([]);
  const [fetching, setFetching]     = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [procRows, setProcRows]     = useState<ProcRow[]>([]);
  const [running, setRunning]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newUrl, setNewUrl]         = useState('');
  const [savingUrl, setSavingUrl]   = useState(false);
  const abortRef = useRef(false);

  const pending  = sheetRows.filter(r => { const s = r['Status']?.trim().toLowerCase(); return !s || s === '' || s === 'processing'; });
  const doneRows = sheetRows.filter(r => r['Status']?.toLowerCase().includes('complet'));
  const failRows = sheetRows.filter(r => r['Status']?.toLowerCase().includes('fail'));

  const doneCount   = procRows.filter(r => r.procStatus === 'done').length;
  const failedCount = procRows.filter(r => r.procStatus === 'failed').length;
  const activeCount = procRows.filter(r => ['title','article','doc','sheet'].includes(r.procStatus)).length;

  /* ── Anon auth ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) supabase.auth.signInAnonymously();
    });
  }, []);

  /* ── Save URL ── */
  const saveUrl = async () => {
    if (!newUrl.trim()) return;
    setSavingUrl(true);
    try {
      await sheetProxy(newUrl.trim(), 'GET');
      localStorage.setItem(STORAGE_KEY, newUrl.trim());
      setScriptUrl(newUrl.trim());
      setNewUrl(''); setShowSettings(false);
    } catch { setFetchError('Could not connect with new URL.'); }
    finally { setSavingUrl(false); }
  };

  /* ── Fetch rows ── */
  const fetchRows = useCallback(async () => {
    if (!scriptUrl) return;
    setFetching(true); setFetchError('');
    try {
      const rows = await sheetProxy<SheetRow[]>(scriptUrl, 'GET');
      setSheetRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setFetchError((e as Error).message || 'Failed to read sheet');
    } finally { setFetching(false); }
  }, [scriptUrl]);

  useEffect(() => { if (scriptUrl) fetchRows(); }, [scriptUrl, fetchRows]);

  /* ── Update sheet row ── */
  const updateRow = (rowIndex: number, updates: SheetUpdate[]) =>
    sheetProxy(scriptUrl, 'POST', { rowIndex, updates });

  /* ── Process all pending ── */
  const processAll = async () => {
    // Also pick up rows stuck in "Processing" from a previous interrupted session
    const toProcess = sheetRows.filter(r => {
      const s = r['Status']?.trim().toLowerCase();
      return !s || s === '' || s === 'processing';
    });
    if (!toProcess.length || running) return;

    abortRef.current = false;
    setRunning(true);

    // Create Supabase batch record
    let batchId: string | null = null;
    try {
      const { data: batch } = await supabase.from('article_batches').insert({
        topic: 'Sheet Run',
        language: 'Various',
        min_word_count: 0,
        max_word_count: 0,
        source: 'sheet',
        batch_started_at: new Date().toISOString(),
      }).select('id').single();
      batchId = batch?.id ?? null;
    } catch { /* non-fatal */ }

    setProcRows(toProcess.map(r => ({ ...r, procStatus: 'pending', finalTitle: r['Article Title'] || '' })));

    const upd = (idx: number, patch: Partial<ProcRow>) =>
      setProcRows(prev => prev.map(r => r._rowIndex === idx ? { ...r, ...patch } : r));

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
          /* 1 ─ Title */
          let title = row['Article Title']?.trim();
          const needTitle = !title;
          if (needTitle) {
            upd(rid, { procStatus: 'title' });
            const res = await edgeFetch<{ titles: string[] }>('generate-titles', {
              topic: DEFAULT_TOPIC, count: 1,
            });
            title = res.titles[0] || `${DEFAULT_TOPIC} Guide`;
            upd(rid, { finalTitle: title });
            // Write title back to sheet with violet highlight
            await updateRow(rid, [{
              column: 'Article Title',
              value: title,
              bgColor: TITLE_HIGHLIGHT_COLOR,
            }]);
          }

          /* 2 ─ Anchors */
          const anchors = [1, 2, 3]
            .filter(n => row[`Anchor Text ${n}`] && row[`Anchor URL ${n}`])
            .map(n => ({ text: String(row[`Anchor Text ${n}`]), url: String(row[`Anchor URL ${n}`]) }));
          const language     = row['Language']?.trim()        || 'English';
          const minWordCount = parseInt(row['Min. Word Count']) || 1000;
          const maxWordCount = parseInt(row['Max. Word Count']) || 1300;

          /* 3 ─ Article HTML */
          upd(rid, { procStatus: 'article' });
          const artData = await edgeFetch<{ html: string }>('generate-article', {
            title, anchors, minWordCount, maxWordCount, language,
          });
          const wc = countWords(artData.html);

          /* 4 ─ Google Doc */
          upd(rid, { procStatus: 'doc' });
          const docName = `${row['Order ID']} - ${row['Publisher Website']}`;
          const docData = await edgeFetch<{ googleDocUrl: string }>('create-article-doc', {
            title, bodyHtml: artData.html, docName,
          });
          const duration = Date.now() - t0;

          /* 5 ─ Write back to sheet */
          upd(rid, { procStatus: 'sheet' });
          await updateRow(rid, [
            { column: 'Status',          value: 'Completed'           },
            { column: 'Article DOC URL', value: docData.googleDocUrl  },
            { column: 'DOC Word count',  value: String(wc)            },
            { column: 'time',            value: formatMs(duration)    },
          ]);

          /* 6 ─ Save to Supabase history */
          if (batchId) {
            await supabase.from('articles').insert({
              batch_id: batchId, title, status: 'done',
              google_doc_url: docData.googleDocUrl,
              word_count: wc, duration_ms: duration,
              order_id: row['Order ID'],
              publisher_website: row['Publisher Website'],
            });
          }

          upd(rid, { procStatus: 'done', docUrl: docData.googleDocUrl, wordCount: wc, duration });

        } catch (err) {
          const msg = (err as Error).message || 'Unknown error';
          upd(rid, { procStatus: 'failed', error: msg });
          try {
            await updateRow(rid, [{ column: 'Status', value: 'Failed' }]);
            if (batchId) {
              await supabase.from('articles').insert({
                batch_id: batchId,
                title: String(row['Article Title'] || row['Order ID'] || '—'),
                status: 'failed',
                error_message: msg,
                order_id: row['Order ID'],
                publisher_website: row['Publisher Website'],
              });
            }
          } catch { /* best effort */ }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, toProcess.length) }, () => worker()));

    // Close batch in Supabase
    if (batchId) {
      await supabase.from('article_batches').update({ batch_completed_at: new Date().toISOString() }).eq('id', batchId);
    }

    setRunning(false);
    fetchRows();
  };

  /* ── Setup save ── */
  const handleSetup = (url: string) => {
    localStorage.setItem(STORAGE_KEY, url);
    setScriptUrl(url);
  };

  /* ── Not configured ── */
  if (!scriptUrl) return (
    <div className="min-h-screen bg-[#04040a] text-slate-100 overflow-x-hidden px-6">
      <CustomCursor />
      <button onClick={() => navigate('/')}
        className="fixed top-5 left-6 z-40 flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-500 backdrop-blur-md hover:border-violet-500/30 hover:bg-violet-500/[0.07] hover:text-slate-200 transition-all">
        <ChevronLeft className="h-3.5 w-3.5" />Dashboard
      </button>
      <SetupPanel onSave={handleSetup} />
    </div>
  );

  /* ══ Configured view ════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#04040a] text-slate-100 overflow-x-hidden">
      <CustomCursor />

      {/* ── Header ── */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-white/[0.05] bg-[#04040a]/80 px-8 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-300 transition-colors">
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
              <button onClick={() => setShowSettings(false)} className="text-slate-600 hover:text-slate-300 transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-xs text-amber-400/80 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              If you updated the Apps Script to support title highlighting, re-deploy it and paste the new URL here.
            </p>
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/..."
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-violet-500/50 mb-4 transition-colors" />
            <div className="flex gap-3">
              <button onClick={() => setShowSettings(false)} className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm font-bold text-slate-500 hover:text-slate-300 transition-colors">Cancel</button>
              <button onClick={saveUrl} disabled={savingUrl}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-black text-white hover:bg-violet-500 disabled:opacity-40 transition-colors">
                {savingUrl && <Loader2 className="h-4 w-4 animate-spin" />}
                {savingUrl ? 'Testing…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-4xl px-6 pt-24 pb-20">

        {/* ── Tab bar ── */}
        <div className="mb-8 flex rounded-xl border border-white/[0.07] bg-white/[0.02] p-1 gap-1">
          {([
            { id: 'generator', label: 'Generator',    Icon: Sheet      },
            { id: 'status',    label: 'Sheet Status', Icon: LayoutGrid },
            { id: 'history',   label: 'History',      Icon: History    },
          ] as { id: ActiveTab; label: string; Icon: typeof Sheet }[]).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-black transition-all ${activeTab === t.id ? 'bg-violet-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
              <t.Icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>

        {/* ══ GENERATOR TAB ══════════════════════════════════════ */}
        {activeTab === 'generator' && (
          <>
            {/* Stats */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total',     value: sheetRows.length, color: 'text-slate-300'   },
                { label: 'Pending',   value: pending.length,   color: 'text-amber-400'   },
                { label: 'Completed', value: doneRows.length,  color: 'text-emerald-400' },
                { label: 'Failed',    value: failRows.length,  color: 'text-red-400'     },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border border-white/[0.07] bg-[#0a0a14] p-4 text-center">
                  <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-600">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mb-8 flex flex-wrap items-center gap-3">
              <button onClick={fetchRows} disabled={fetching || running}
                className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-black text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors">
                <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
                {fetching ? 'Checking…' : 'Check for Pending'}
              </button>
              <button onClick={processAll} disabled={running || !pending.length || fetching}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-40 transition-all"
                style={{ boxShadow: (pending.length && !running) ? '0 0 20px rgba(16,185,129,0.35)' : 'none' }}>
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
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{fetchError}
              </div>
            )}

            {/* Processing rows */}
            {procRows.length > 0 && (
              <section className="mb-10">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
                    Processing — {doneCount}/{procRows.length} done
                    {failedCount > 0 && <span className="ml-2 text-red-400">· {failedCount} failed</span>}
                  </h2>
                  {!running && <button onClick={() => setProcRows([])} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Clear</button>}
                </div>
                {/* Progress bar */}
                <div className="relative mb-5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${procRows.length ? (doneCount / procRows.length) * 100 : 0}%` }} />
                </div>
                <div className="space-y-3">
                  {procRows.map(r => <ProcRowCard key={r._rowIndex} row={r} />)}
                </div>
              </section>
            )}

            {/* Pending preview */}
            {pending.length > 0 && procRows.length === 0 && (
              <section>
                <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-500">Pending — {pending.length} rows</h2>
                <div className="space-y-2">
                  {pending.map(row => (
                    <div key={row._rowIndex} className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-[#0a0a14] px-5 py-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                        <Hash className="h-4 w-4 text-violet-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 mb-0.5">{row['Order ID'] || '—'}</div>
                        <div className="text-sm font-bold text-slate-300 truncate">
                          {row['Article Title'] ? row['Article Title'] : (
                            <span className="flex items-center gap-1.5 text-slate-600">
                              <Sparkles className="h-3 w-3 text-violet-500" />Will generate + highlight title
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <Globe className="h-3.5 w-3.5" />{row['Publisher Website'] || '—'}
                      </span>
                      {[1, 2, 3].filter(n => row[`Anchor Text ${n}`] && row[`Anchor URL ${n}`]).length > 0 && (
                        <span className="hidden sm:flex items-center gap-1 text-xs font-semibold text-slate-700">
                          <Link2 className="h-3.5 w-3.5" />
                          {[1,2,3].filter(n => row[`Anchor Text ${n}`] && row[`Anchor URL ${n}`]).length} anchors
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black text-amber-400">Pending</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!fetching && sheetRows.length > 0 && pending.length === 0 && procRows.length === 0 && (
              <div className="py-20 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-3" />
                <p className="text-slate-400 font-bold">All rows are completed!</p>
              </div>
            )}

            {!fetching && sheetRows.length === 0 && procRows.length === 0 && (
              <div className="py-20 text-center">
                <Sheet className="mx-auto h-10 w-10 text-slate-700 mb-3" />
                <p className="text-slate-500 font-bold">Sheet is empty</p>
                <p className="text-xs text-slate-600 mt-1">No rows found. Check your sheet has data and headers match.</p>
              </div>
            )}
          </>
        )}

        {/* ══ SHEET STATUS TAB ═══════════════════════════════════ */}
        {activeTab === 'status' && (
          <SheetStatusTab rows={sheetRows} procRows={procRows} loading={fetching} onRefresh={fetchRows} />
        )}

        {/* ══ HISTORY TAB ════════════════════════════════════════ */}
        {activeTab === 'history' && <SheetHistoryTab />}
      </div>
    </div>
  );
}

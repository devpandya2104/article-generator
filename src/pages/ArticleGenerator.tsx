import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

import {
  Sparkles, Loader2, CheckCircle2, AlertCircle, Copy,
  ExternalLink, Trash2, Pencil, Link2, Wand2, FileText, RotateCw,
  Plus, ChevronDown, ChevronUp, Settings2, Search, Globe, Check,
  Clock, Zap, Timer,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Tab = 'generator' | 'history';
type Step = 'input' | 'titles' | 'generating' | 'done';
type ArticleStatus = 'pending' | 'generating' | 'uploading' | 'done' | 'failed';
type TitleSource = 'ai' | 'custom';

interface Anchor { text: string; url: string; }

interface ArticleEntry {
  title: string;
  status: ArticleStatus;
  bodyHtml?: string;
  googleDocId?: string;
  googleDocUrl?: string;
  error?: string;
  dbId?: string;
  startTime?: number;
  endTime?: number;
  wordCount?: number;
}

interface HistoryBatchArticle {
  id: string;
  title: string;
  google_doc_url: string | null;
  status: string;
}

interface HistoryBatch {
  id: string;
  topic: string;
  created_at: string;
  requested_count: number;
  language: string;
  articles: HistoryBatchArticle[];
}

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch',
  'Russian', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Korean',
  'Arabic', 'Hindi', 'Bengali', 'Urdu', 'Turkish', 'Vietnamese', 'Thai', 'Indonesian',
  'Malay', 'Filipino', 'Polish', 'Ukrainian', 'Romanian', 'Czech', 'Hungarian',
  'Greek', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Hebrew', 'Persian',
  'Swahili', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Gujarati',
  'Punjabi', 'Nepali', 'Sinhala', 'Burmese', 'Khmer', 'Lao', 'Georgian',
  'Armenian', 'Azerbaijani', 'Kazakh', 'Uzbek', 'Mongolian', 'Tibetan',
  'Croatian', 'Serbian', 'Slovak', 'Slovenian', 'Bulgarian', 'Lithuanian',
  'Latvian', 'Estonian', 'Albanian', 'Macedonian', 'Bosnian', 'Icelandic',
  'Irish', 'Welsh', 'Catalan', 'Basque', 'Galician', 'Afrikaans',
  'Yoruba', 'Igbo', 'Hausa', 'Amharic', 'Somali', 'Zulu', 'Xhosa',
] as const;

const DEFAULT_TITLE_PROMPT = `Generate exactly {count} unique, informative article titles about "{topic}".

Requirements:
- No brand or company names
- No product names
- No location names
- Each title must be specific, not generic
- Vary the formats (how-to, question, listicle, etc.)
- For listicle titles, NEVER include numbers (write "Several Ways" not "7 Ways")
- No numbering, no explanation

BANNED WORDS — never use these in any title:
best, buy, top, RTP, random, randomness, random numbers, cost, price, cheap, affordable

Return ONLY a JSON array of strings. Example: ["Title One", "Title Two"]`;

const DEFAULT_ARTICLE_PROMPT = `You are an expert content writer. Write a high-quality, SEO-friendly article in {language} on the title: "{title}"

CONTENT REQUIREMENTS:
- Word count: STRICTLY between {minWordCount} and {maxWordCount} words — not less, not more
- Tone: casual, human, conversational — like a knowledgeable friend explaining something
- Writing style: clear, direct, confident — no fluff, no filler
- Purpose: informative and educational, never promotional
- Keep everything positive and factual
- No brand names or company names anywhere

STRUCTURE RULES:
- NO H1 tag (title is added separately)
- Start with exactly 2-3 <p> intro paragraphs BEFORE the first <h2>
- First sentence of the intro must be a reader-focused question
- After every <h2>, write one short intro sentence before any <h3>
- Use <h2> and <h3> headings only
- Capitalize the first letter of each main word in all headings
- Paragraphs should flow naturally with no extra blank lines

FORMATTING RULES:
- Output ONLY valid HTML
- Use <h2>, <h3> for headings
- Use <p> for all paragraphs
- Use <a> for anchor links only
- No tables, no bullet points or lists
- No extra blank lines between elements
- First element MUST be a <p> tag
- NEVER use em dash (—)

{anchors}

ANCHOR LINK RULES (CRITICAL):
- Spread anchor links evenly throughout the entire article
- Minimum 2-3 sections (H2 blocks) of gap between any two anchor links
- NEVER place more than 1 anchor link in the same paragraph
- NEVER place two anchor links in the same section (between two H2s)
- Each anchor link must appear in its own separate paragraph, naturally within the flow
- Anchor text must fit the sentence so naturally that it doesn't feel inserted
- Do not force anchors — only place them where they make genuine contextual sense
- If an anchor cannot be placed naturally, skip it rather than force it

BANNED WORDS — never use these anywhere in the article:
wondering, wondered, this guide, diving, dive, embark, discover, engage, engaging, world, treasure, trove, seeds, sprout, harnessing, power, game-changer, emerge, ladder, plethora, enthusiast, seamless, emphasized, tenure, journey, realm, nuances, versatility, sophisticated, landscape, in the ever-evolving, seeking, shed, merely, embrace, presence, handy, super, notable, lies, delve, versatile, enhance, great, whether, embraced, designed, robust, revolutionize, cutting-edge, groundbreaking, transformative, leverage, holistic, synergy, unpack, demystify, navigating, unlock, crucial, vital, essential, it's worth noting, at the end of the day, in today's world, in conclusion, to summarize

WORD COUNT RULE (CRITICAL):
- You MUST write between {minWordCount} and {maxWordCount} words
- Before finishing, count your words mentally and adjust
- If you are below {minWordCount}, expand existing sections with more detail
- If you are above {maxWordCount}, trim sentences and remove filler

QUALITY CHECKLIST (apply before finishing):
- Is the word count strictly between {minWordCount} and {maxWordCount}?
- Does the intro open with a question that pulls the reader in?
- Does every section add real value, not just filler?
- Does it read like a human wrote it, not an AI?
- Are all headings properly capitalized?
- Is the first HTML element a <p> tag?
- Are all banned words avoided?`;

/* ─── Utilities ─── */

function countWords(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.split(' ').filter(Boolean).length : 0;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

async function edgeFetch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

/* ─── Shared style helpers ─── */
const card = 'rounded-2xl border border-white/[0.07] bg-white/[0.04] backdrop-blur-sm';
const inputCls = 'mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20';
const labelCls = 'block text-sm font-medium text-slate-300';

export default function ArticleGenerator() {
  const [activeTab, setActiveTab]         = useState<Tab>('generator');
  const [topic, setTopic]                 = useState('');
  const [count, setCount]                 = useState(5);
  const [minWordCount, setMinWordCount]   = useState(1000);
  const [maxWordCount, setMaxWordCount]   = useState(1300);
  const [language, setLanguage]           = useState('English');
  const [anchors, setAnchors]             = useState<Anchor[]>([]);
  const [titlePrompt, setTitlePrompt]     = useState(DEFAULT_TITLE_PROMPT);
  const [articlePrompt, setArticlePrompt] = useState(DEFAULT_ARTICLE_PROMPT);
  const [savingPrompts, setSavingPrompts] = useState(false);
  const [showAdvanced, setShowAdvanced]   = useState(false);
  const [titleSource, setTitleSource]     = useState<TitleSource>('ai');
  const [customTitlesText, setCustomTitlesText] = useState('');
  const [titles, setTitles]               = useState<string[]>([]);
  const [articles, setArticles]           = useState<ArticleEntry[]>([]);
  const [step, setStep]                   = useState<Step>('input');
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [batchId, setBatchId]             = useState<string | null>(null);
  const [editingIndex, setEditingIndex]   = useState<number | null>(null);
  const [editValue, setEditValue]         = useState('');
  const [historyBatches, setHistoryBatches] = useState<HistoryBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  /* Timing state */
  const [batchStartTime, setBatchStartTime] = useState<number | null>(null);
  const [batchEndTime, setBatchEndTime]     = useState<number | null>(null);
  const [liveTick, setLiveTick]             = useState(0);

  const abortRef          = useRef(false);
  const editInputRef      = useRef<HTMLInputElement | null>(null);
  const rootRef           = useRef<HTMLDivElement>(null);
  const prevDoneCount     = useRef(0);

  /* Live 1-second ticker during generation */
  useEffect(() => {
    if (step !== 'generating') return;
    const id = setInterval(() => setLiveTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [step]);

  /* Batch elapsed time (recomputed every tick) */
  const batchElapsed = useMemo(() => {
    if (!batchStartTime) return null;
    return (batchEndTime ?? Date.now()) - batchStartTime;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchStartTime, batchEndTime, liveTick]);

  /* Load shared prompts */
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('shared_prompts').select('id, content')
        .in('id', ['title_prompt', 'article_prompt']);
      if (data) {
        for (const row of data) {
          if (row.id === 'title_prompt' && row.content) setTitlePrompt(row.content);
          if (row.id === 'article_prompt' && row.content) setArticlePrompt(row.content);
        }
      }
    })();
  }, []);

  /* Anonymous sign-in */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) await supabase.auth.signInAnonymously();
    })();
  }, []);

  /* Focus edit input */
  useEffect(() => {
    if (editingIndex !== null) editInputRef.current?.focus();
  }, [editingIndex]);

  /* ── GSAP: floating background orbs ── */
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to('.bg-orb-1', { x: 140, y: 100,  duration: 16, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.bg-orb-2', { x: -120, y: -80, duration: 20, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 2 });
      gsap.to('.bg-orb-3', { x: 90, y: -120,  duration: 24, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 5 });
    });
    return () => ctx.revert();
  }, []);

  /* ── GSAP: page entrance with hero word reveal ── */
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.anim-header', { y: -60, opacity: 0, duration: 0.9 })
        .from('.anim-badge',  { y: 40, opacity: 0, duration: 0.7 }, '-=0.4')
        .from('.hero-word',   { y: '110%', duration: 0.75, stagger: 0.09 }, '-=0.4')
        .from('.anim-subtitle', { y: 30, opacity: 0, duration: 0.7 }, '-=0.5');
    }, rootRef);
    return () => ctx.revert();
  }, []);

  /* ── GSAP: step transition ── */
  useEffect(() => {
    gsap.fromTo('.step-panel',
      { opacity: 0, y: 32, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'power2.out' }
    );
  }, [step]);

  /* ── GSAP: tab transition ── */
  useEffect(() => {
    gsap.fromTo('.tab-panel',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
    );
  }, [activeTab]);

  /* ── GSAP: title items stagger ── */
  useEffect(() => {
    if (step === 'titles' && titles.length > 0) {
      gsap.fromTo('.title-item',
        { opacity: 0, x: -32 },
        { opacity: 1, x: 0, duration: 0.5, stagger: 0.05, ease: 'power2.out', delay: 0.3 }
      );
    }
  }, [step]);

  /* ── GSAP: article rows stagger ── */
  const prevArticleCount = useRef(0);
  useEffect(() => {
    if (articles.length > 0 && articles.length !== prevArticleCount.current) {
      prevArticleCount.current = articles.length;
      gsap.fromTo('.article-row',
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.45, stagger: 0.04, ease: 'power2.out', delay: 0.15 }
      );
    }
  }, [articles.length]);

  /* ── GSAP: done count badge bounce ── */
  useEffect(() => {
    const done = articles.filter((a) => a.status === 'done').length;
    if (done > 0 && done !== prevDoneCount.current) {
      prevDoneCount.current = done;
      gsap.fromTo('.done-count',
        { scale: 1.5, color: '#a78bfa' },
        { scale: 1, color: '#34d399', duration: 0.5, ease: 'back.out(2)' }
      );
    }
  }, [articles]);

  /* ── GSAP: batch complete celebration ── */
  useEffect(() => {
    if (step === 'done') {
      gsap.timeline()
        .from('.batch-complete-icon', {
          scale: 0, rotation: -180, duration: 0.7, ease: 'back.out(1.7)',
        })
        .to('.batch-complete-icon', {
          filter: 'drop-shadow(0 0 16px rgba(52,211,153,0.9))',
          duration: 0.4, yoyo: true, repeat: 3, ease: 'sine.inOut',
        });
      gsap.from('.batch-complete-text', {
        opacity: 0, y: 10, duration: 0.5, delay: 0.4, ease: 'power2.out',
      });
    }
  }, [step]);

  /* ── GSAP: ScrollTrigger for history items ── */
  useEffect(() => {
    if (activeTab === 'history' && historyBatches.length > 0) {
      const ctx = gsap.context(() => {
        gsap.fromTo('.history-item',
          { opacity: 0, y: 30 },
          {
            opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: 'power2.out',
            scrollTrigger: { trigger: '.history-list', start: 'top 85%' },
          }
        );
      }, rootRef);
      return () => ctx.revert();
    }
  }, [activeTab, historyBatches.length]);

  /* ── Data callbacks ── */
  const savePromptsToDb = useCallback(async () => {
    setSavingPrompts(true); setError(null);
    try {
      const { error: e1 } = await supabase.from('shared_prompts')
        .update({ content: titlePrompt, updated_at: new Date().toISOString() }).eq('id', 'title_prompt');
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from('shared_prompts')
        .update({ content: articlePrompt, updated_at: new Date().toISOString() }).eq('id', 'article_prompt');
      if (e2) throw new Error(e2.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompts');
    } finally { setSavingPrompts(false); }
  }, [titlePrompt, articlePrompt]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data: batches } = await supabase
        .from('article_batches').select('id, topic, created_at, requested_count, language')
        .order('created_at', { ascending: false });
      if (!batches || batches.length === 0) { setHistoryBatches([]); return; }
      const batchIds = batches.map((b) => b.id);
      const { data: arts } = await supabase
        .from('articles').select('id, title, google_doc_url, status, batch_id')
        .in('batch_id', batchIds);
      const artsByBatch: Record<string, HistoryBatchArticle[]> = {};
      for (const a of (arts || [])) {
        (artsByBatch[a.batch_id] ||= []).push({ id: a.id, title: a.title, google_doc_url: a.google_doc_url, status: a.status });
      }
      setHistoryBatches(batches.map((b) => ({
        id: b.id, topic: b.topic, created_at: b.created_at,
        requested_count: b.requested_count, language: b.language,
        articles: artsByBatch[b.id] || [],
      })));
    } catch { /* best-effort */ } finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  const parsedCustomTitles = useMemo(
    () => customTitlesText.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
    [customTitlesText]
  );
  const useCustomTitles = useCallback(() => {
    if (!parsedCustomTitles.length) return;
    setTitles(parsedCustomTitles); setStep('titles');
  }, [parsedCustomTitles]);

  const updateArticle = useCallback((idx: number, patch: Partial<ArticleEntry>) => {
    setArticles((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }, []);

  const validAnchors = useMemo(() => anchors.filter((a) => a.text.trim() && a.url.trim()), [anchors]);
  const addAnchor    = useCallback(() => setAnchors((p) => [...p, { text: '', url: '' }]), []);
  const updateAnchor = useCallback((idx: number, field: keyof Anchor, value: string) =>
    setAnchors((p) => p.map((a, i) => (i === idx ? { ...a, [field]: value } : a))), []);
  const removeAnchor = useCallback((idx: number) =>
    setAnchors((p) => p.filter((_, i) => i !== idx)), []);

  const isCustomTitlePrompt   = titlePrompt   !== DEFAULT_TITLE_PROMPT;
  const isCustomArticlePrompt = articlePrompt !== DEFAULT_ARTICLE_PROMPT;

  const generateTitles = useCallback(async () => {
    if (!topic.trim()) return;
    setError(null); setLoadingTitles(true);
    try {
      const data = await edgeFetch<{ titles: string[] }>('generate-titles', { topic: topic.trim(), count, titlePrompt });
      setTitles(data.titles); setStep('titles');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate titles');
    } finally { setLoadingTitles(false); }
  }, [topic, count, titlePrompt]);

  const removeTitle   = useCallback((idx: number) => setTitles((p) => p.filter((_, i) => i !== idx)), []);
  const startEditing  = useCallback((idx: number, t: string) => { setEditingIndex(idx); setEditValue(t); }, []);
  const commitEdit    = useCallback(() => {
    if (editingIndex === null) return;
    const v = editValue.trim();
    if (v) setTitles((p) => p.map((t, i) => (i === editingIndex ? v : t)));
    setEditingIndex(null); setEditValue('');
  }, [editingIndex, editValue]);

  const generateArticles = useCallback(async () => {
    if (!titles.length) return;
    setError(null);
    abortRef.current = false;
    const now = Date.now();
    setBatchStartTime(now);
    setBatchEndTime(null);
    setLiveTick(0);
    setArticles(titles.map((title) => ({ title, status: 'pending' as ArticleStatus })));
    setStep('generating');

    let currentBatchId = batchId;
    try {
      if (!currentBatchId) {
        const { data: batch } = await supabase.from('article_batches').insert({
          topic: topic.trim(), requested_count: titles.length, status: 'processing',
          min_word_count: minWordCount, max_word_count: maxWordCount, language,
          anchors: validAnchors,
          title_prompt: isCustomTitlePrompt ? titlePrompt : '',
          article_prompt: isCustomArticlePrompt ? articlePrompt : '',
        }).select('id').maybeSingle();
        if (batch?.id) { currentBatchId = batch.id; setBatchId(batch.id); }
      }
      if (currentBatchId) {
        const rows = titles.map((title) => ({ batch_id: currentBatchId, title, status: 'pending' }));
        const { data: inserted } = await supabase.from('articles').insert(rows).select('id, title');
        if (inserted) {
          setArticles((prev) => prev.map((a) => {
            const match = inserted.find((r: { id: string; title: string }) => r.title === a.title);
            return match ? { ...a, dbId: match.id } : a;
          }));
        }
      }
    } catch { /* DB best-effort */ }

    for (let i = 0; i < titles.length; i++) {
      if (abortRef.current) break;
      const artStart = Date.now();
      updateArticle(i, { status: 'generating', startTime: artStart });
      try {
        const artData = await edgeFetch<{ html: string }>('generate-article', {
          title: titles[i], topic: topic.trim(), minWordCount, maxWordCount,
          language, anchors: validAnchors, articlePrompt,
        });
        if (abortRef.current) break;
        const wc = countWords(artData.html);
        updateArticle(i, { status: 'uploading', bodyHtml: artData.html, wordCount: wc });
        const docData = await edgeFetch<{ googleDocId: string; googleDocUrl: string }>(
          'create-article-doc', { title: titles[i], bodyHtml: artData.html, topic: topic.trim() },
        );
        const artEnd = Date.now();
        updateArticle(i, { status: 'done', googleDocId: docData.googleDocId, googleDocUrl: docData.googleDocUrl, endTime: artEnd });
        setArticles((prev) => {
          const art = prev[i];
          if (art.dbId) supabase.from('articles').update({
            body_html: artData.html, google_doc_id: docData.googleDocId,
            google_doc_url: docData.googleDocUrl, status: 'done', updated_at: new Date().toISOString(),
          }).eq('id', art.dbId).then();
          return prev;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        updateArticle(i, { status: 'failed', error: message, endTime: Date.now() });
        setArticles((prev) => {
          const art = prev[i];
          if (art.dbId) supabase.from('articles').update({
            status: 'failed', error_message: message, updated_at: new Date().toISOString(),
          }).eq('id', art.dbId).then();
          return prev;
        });
      }
    }

    const batchEnd = Date.now();
    setBatchEndTime(batchEnd);
    if (currentBatchId) {
      await supabase.from('article_batches')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', currentBatchId);
    }
    setStep('done');
  }, [titles, topic, batchId, updateArticle, minWordCount, maxWordCount, language, validAnchors, articlePrompt, isCustomArticlePrompt, titlePrompt, isCustomTitlePrompt]);

  const retryArticle = useCallback(async (idx: number) => {
    const article = articles[idx];
    if (!article || article.status !== 'failed') return;
    const artStart = Date.now();
    updateArticle(idx, { status: 'generating', error: undefined, startTime: artStart, endTime: undefined });
    try {
      const artData = await edgeFetch<{ html: string }>('generate-article', {
        title: article.title, topic: topic.trim(), minWordCount, maxWordCount,
        language, anchors: validAnchors, articlePrompt,
      });
      const wc = countWords(artData.html);
      updateArticle(idx, { status: 'uploading', bodyHtml: artData.html, wordCount: wc });
      const docData = await edgeFetch<{ googleDocId: string; googleDocUrl: string }>(
        'create-article-doc', { title: article.title, bodyHtml: artData.html, topic: topic.trim() },
      );
      updateArticle(idx, { status: 'done', googleDocId: docData.googleDocId, googleDocUrl: docData.googleDocUrl, endTime: Date.now() });
      if (article.dbId) {
        await supabase.from('articles').update({
          body_html: artData.html, google_doc_id: docData.googleDocId,
          google_doc_url: docData.googleDocUrl, status: 'done', error_message: null,
          updated_at: new Date().toISOString(),
        }).eq('id', article.dbId);
      }
    } catch (err) {
      updateArticle(idx, { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error', endTime: Date.now() });
    }
  }, [articles, topic, updateArticle, minWordCount, maxWordCount, language, validAnchors, articlePrompt]);

  const doneArticles = useMemo(() => articles.filter((a) => a.status === 'done' && a.googleDocUrl), [articles]);
  const progressCounts = useMemo(() => ({
    pending:  articles.filter((a) => a.status === 'pending').length,
    active:   articles.filter((a) => a.status === 'generating' || a.status === 'uploading').length,
    done:     articles.filter((a) => a.status === 'done').length,
    failed:   articles.filter((a) => a.status === 'failed').length,
  }), [articles]);

  const resetAll = useCallback(() => {
    abortRef.current = true;
    setStep('input'); setTitles([]); setArticles([]); setBatchId(null); setError(null);
    setBatchStartTime(null); setBatchEndTime(null); setLiveTick(0);
  }, []);

  const toggleBatch = useCallback((id: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /* ══════════════════════════════
     RENDER
  ══════════════════════════════ */
  return (
    <div ref={rootRef} className="min-h-screen bg-[#06060f] text-slate-100">

      {/* ── Animated background ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
        <div className="bg-orb-1 absolute -top-80 -left-80 w-[750px] h-[750px] rounded-full bg-violet-700/20 blur-[180px]" />
        <div className="bg-orb-2 absolute top-1/2 -right-64 w-[650px] h-[650px] rounded-full bg-indigo-600/12 blur-[160px]" />
        <div className="bg-orb-3 absolute -bottom-64 left-1/4 w-[700px] h-[700px] rounded-full bg-purple-900/22 blur-[170px]" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(139,92,246,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(139,92,246,0.5) 1px,transparent 1px)', backgroundSize: '60px 60px' }}
        />
      </div>

      {/* ── Header ── */}
      <header className="anim-header sticky top-0 z-20 border-b border-white/[0.06] bg-[#06060f]/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 shadow-lg shadow-violet-900/60">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-base font-bold tracking-tight">
              Quill<span className="text-violet-400"> AI</span>
            </span>
          </div>
          <nav className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1">
            <NavTab active={activeTab === 'generator'} onClick={() => setActiveTab('generator')}
              icon={<Wand2 className="h-4 w-4" />} label="Generator" />
            <NavTab active={activeTab === 'history'} onClick={() => setActiveTab('history')}
              icon={<Clock className="h-4 w-4" />} label="History" />
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 pb-28 pt-12">

        {/* ════════ HISTORY TAB ════════ */}
        {activeTab === 'history' && (
          <div className="tab-panel">
            <h1 className="text-2xl font-bold tracking-tight">Article History</h1>
            <p className="mt-1 text-sm text-slate-400">All your generated batches and articles.</p>
            {historyLoading ? (
              <div className="mt-16 flex items-center justify-center gap-3 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading history...
              </div>
            ) : historyBatches.length === 0 ? (
              <div className="mt-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <Clock className="h-7 w-7 text-slate-500" />
                </div>
                <p className="mt-4 text-sm text-slate-400">No batches generated yet.</p>
                <button onClick={() => setActiveTab('generator')}
                  className="mt-3 text-sm font-medium text-violet-400 hover:text-violet-300 transition">
                  Start generating →
                </button>
              </div>
            ) : (
              <div className="history-list mt-6 space-y-3">
                {historyBatches.map((batch) => {
                  const isOpen = expandedBatches.has(batch.id);
                  const doneCount = batch.articles.filter((a) => a.status === 'done').length;
                  return (
                    <div key={batch.id} className="history-item overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] transition-all">
                      <button onClick={() => toggleBatch(batch.id)}
                        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]">
                        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20">
                          <FileText className="h-4 w-4 text-violet-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-100">{batch.topic}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {new Date(batch.created_at).toLocaleDateString('en-US', {
                              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                            {' · '}{batch.language}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-none">
                          <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-300 ring-1 ring-violet-500/20">
                            {doneCount}/{batch.requested_count}
                          </span>
                          {isOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-white/[0.06]">
                          {batch.articles.length === 0 ? (
                            <p className="px-5 py-4 text-sm text-slate-500">No articles in this batch.</p>
                          ) : (
                            <>
                              {batch.articles.some((a) => a.google_doc_url) && (
                                <div className="flex items-center gap-2 border-b border-white/[0.05] bg-white/[0.02] px-5 py-2.5">
                                  <CopyBtn
                                    text={batch.articles.filter((a) => a.google_doc_url).map((a) => a.google_doc_url).join('\n')}
                                    label="Copy all URLs"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition"
                                  />
                                </div>
                              )}
                              <ul className="divide-y divide-white/[0.05]">
                                {batch.articles.map((article) => (
                                  <li key={article.id} className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/[0.02]">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium text-slate-300">{article.title}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-none">
                                      {article.google_doc_url ? (
                                        <>
                                          <CopyBtn text={article.google_doc_url} label="Copy" />
                                          <a href={article.google_doc_url} target="_blank" rel="noreferrer"
                                            className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition">
                                            <ExternalLink className="h-3 w-3" /> Open
                                          </a>
                                        </>
                                      ) : (
                                        <span className="text-xs text-slate-500">{article.status === 'failed' ? 'Failed' : 'Pending'}</span>
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════ GENERATOR TAB ════════ */}
        {activeTab === 'generator' && (
          <>
            {/* Hero with word-reveal animation */}
            <div className="tab-panel">
              <div className="anim-badge inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3.5 py-1.5 text-xs font-medium text-violet-300">
                <Sparkles className="h-3 w-3" /> AI-powered bulk article generation
              </div>
              <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl leading-tight">
                {/* Each word animates independently from below */}
                {['Generate', 'articles.'].map((w, i) => (
                  <span key={i} className="inline-block overflow-hidden mr-[0.25em] align-bottom">
                    <span className="hero-word inline-block">{w}</span>
                  </span>
                ))}
                <br />
                {['Get', 'Google', 'Docs.'].map((w, i) => (
                  <span key={i} className="inline-block overflow-hidden mr-[0.25em] align-bottom">
                    <span className="hero-word inline-block bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                      {w}
                    </span>
                  </span>
                ))}
              </h1>
              <p className="anim-subtitle mt-4 max-w-2xl text-base text-slate-400 leading-relaxed">
                Enter a topic, choose your titles, and watch Claude AI write full SEO articles
                and upload them to Google Docs — all at once.
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-rose-400" />
                <div>{error}</div>
              </div>
            )}

            {/* ── Step 1: Input ── */}
            {step === 'input' && (
              <section className="step-panel mt-8 space-y-4">
                <div className={`${card} p-8`}>
                  <div className="flex items-center gap-2.5">
                    <Wand2 className="h-5 w-5 text-violet-400" />
                    <h2 className="text-lg font-semibold text-slate-100">Configure your batch</h2>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-400">Set your article parameters, then choose how to provide titles.</p>

                  <div className="mt-7 space-y-5">
                    <div>
                      <label className={labelCls}>Topic</label>
                      <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                        placeholder='e.g. "Online Slot", "Digital Marketing Tips"'
                        className={inputCls}
                      />
                    </div>
                    <div className="flex flex-wrap gap-5">
                      <div>
                        <label className={labelCls}>Min word count</label>
                        <input type="number" min={300} max={10000} step={100} value={minWordCount}
                          onChange={(e) => {
                            const v = Math.max(300, Math.min(10000, +e.target.value || 1000));
                            setMinWordCount(v);
                            if (maxWordCount < v) setMaxWordCount(v);
                          }}
                          className={`${inputCls} w-36`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Max word count</label>
                        <input type="number" min={300} max={10000} step={100} value={maxWordCount}
                          onChange={(e) => setMaxWordCount(Math.max(minWordCount, Math.min(10000, +e.target.value || 1300)))}
                          className={`${inputCls} w-36`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Language</label>
                        <LanguageSelect value={language} onChange={setLanguage} />
                      </div>
                    </div>
                  </div>

                  {/* Anchor Links */}
                  <div className="mt-7 border-t border-white/[0.06] pt-7">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-cyan-400" />
                      <label className="text-sm font-medium text-slate-200">Anchor Links</label>
                      {validAnchors.length > 0 && (
                        <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-medium text-cyan-300 ring-1 ring-cyan-500/20">
                          {validAnchors.length}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Anchor text and URLs to embed naturally in every article.</p>
                    <div className="mt-4 space-y-3">
                      {anchors.map((anchor, idx) => (
                        <div key={idx} className="flex items-start gap-2.5">
                          <div className="flex min-w-0 flex-1 gap-2.5">
                            <div className="flex-1">
                              {idx === 0 && <label className="mb-1.5 block text-xs font-medium text-slate-500">Anchor text</label>}
                              <input type="text" value={anchor.text} onChange={(e) => updateAnchor(idx, 'text', e.target.value)}
                                placeholder="e.g. best online slots"
                                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                              />
                            </div>
                            <div className="flex-1">
                              {idx === 0 && <label className="mb-1.5 block text-xs font-medium text-slate-500">URL</label>}
                              <input type="url" value={anchor.url} onChange={(e) => updateAnchor(idx, 'url', e.target.value)}
                                placeholder="https://example.com"
                                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                              />
                            </div>
                          </div>
                          <button onClick={() => removeAnchor(idx)}
                            className={`flex-none rounded-xl p-2.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400 ${idx === 0 ? 'mt-6' : ''}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button onClick={addAnchor}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-white/10 px-3.5 py-2 text-xs font-medium text-slate-400 transition hover:border-cyan-500/40 hover:bg-cyan-500/5 hover:text-cyan-400">
                        <Plus className="h-3.5 w-3.5" /> Add Anchor
                      </button>
                    </div>
                  </div>

                  {/* Title source toggle */}
                  <div className="mt-7 border-t border-white/[0.06] pt-7">
                    <label className="block text-sm font-medium text-slate-200 mb-3">How do you want to provide titles?</label>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { key: 'ai',     icon: <Sparkles className="mb-1.5 inline h-4 w-4 mr-1" />, title: 'AI-generated titles',  desc: 'Generate suggestions from your topic' },
                        { key: 'custom', icon: <FileText  className="mb-1.5 inline h-4 w-4 mr-1" />, title: 'Your own titles',       desc: 'Paste titles separated by commas or lines' },
                      ] as const).map((opt) => (
                        <button key={opt.key} onClick={() => setTitleSource(opt.key)}
                          className={`rounded-xl border p-4 text-left transition ${
                            titleSource === opt.key
                              ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/20'
                              : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                          }`}>
                          <div className={`text-sm font-semibold ${titleSource === opt.key ? 'text-violet-300' : 'text-slate-300'}`}>
                            {opt.icon}{opt.title}
                          </div>
                          <div className={`mt-1 text-xs ${titleSource === opt.key ? 'text-violet-400/70' : 'text-slate-500'}`}>
                            {opt.desc}
                          </div>
                        </button>
                      ))}
                    </div>

                    {titleSource === 'ai' && (
                      <div className="mt-5 flex items-end gap-3">
                        <div>
                          <label className={labelCls}>Number of titles</label>
                          <input type="number" min={1} max={200} value={count}
                            onChange={(e) => setCount(Math.max(1, Math.min(200, +e.target.value || 1)))}
                            className={`${inputCls} w-32`}
                          />
                        </div>
                        <MagneticBtn
                          onClick={generateTitles}
                          disabled={loadingTitles || !topic.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                        >
                          {loadingTitles
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                            : <><Sparkles className="h-4 w-4" /> Generate Titles</>}
                        </MagneticBtn>
                      </div>
                    )}

                    {titleSource === 'custom' && (
                      <div className="mt-5">
                        <label className={labelCls}>Paste your titles</label>
                        <textarea value={customTitlesText} onChange={(e) => setCustomTitlesText(e.target.value)}
                          rows={6}
                          placeholder={"How to Win at Online Slots\nBest Strategies for Digital Marketing\nTop 10 SEO Tips for Beginners"}
                          className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-relaxed text-slate-100 placeholder-slate-500 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 resize-none"
                        />
                        <div className="mt-3 flex items-center justify-between">
                          <p className="text-xs text-slate-500">
                            {parsedCustomTitles.length === 0
                              ? 'Separate titles with commas or new lines'
                              : `${parsedCustomTitles.length} title${parsedCustomTitles.length !== 1 ? 's' : ''} detected`}
                          </p>
                          <MagneticBtn onClick={useCustomTitles} disabled={parsedCustomTitles.length === 0}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-40">
                            <FileText className="h-4 w-4" /> Use These Titles
                          </MagneticBtn>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Prompt Settings */}
                <div className={card}>
                  <button onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex w-full items-center justify-between px-8 py-5 text-left transition rounded-2xl hover:bg-white/[0.02]">
                    <div className="flex items-center gap-2.5">
                      <Settings2 className="h-5 w-5 text-slate-500" />
                      <span className="text-base font-semibold text-slate-200">Prompt Settings</span>
                      {(isCustomTitlePrompt || isCustomArticlePrompt) && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20">Customized</span>
                      )}
                    </div>
                    {showAdvanced ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
                  </button>
                  {showAdvanced && (
                    <div className="border-t border-white/[0.06] px-8 pb-8 pt-6 space-y-6">
                      <p className="text-sm text-slate-400">
                        Customize AI prompts. Use{' '}
                        {['{topic}','{count}','{title}','{minWordCount}','{maxWordCount}','{language}','{anchors}'].map((p) => (
                          <code key={p} className="mx-0.5 rounded-md bg-white/10 px-1.5 py-0.5 text-xs font-mono text-violet-300">{p}</code>
                        ))}.
                      </p>
                      {([
                        { id: 'title',   label: 'Title Generation Prompt',   value: titlePrompt,   isCustom: isCustomTitlePrompt,   onChange: setTitlePrompt,   onReset: () => setTitlePrompt(DEFAULT_TITLE_PROMPT),   rows: 4,  hint: `Placeholders: {'{topic}'}, {'{count}'}. Must return JSON array.` },
                        { id: 'article', label: 'Article Generation Prompt', value: articlePrompt, isCustom: isCustomArticlePrompt, onChange: setArticlePrompt, onReset: () => setArticlePrompt(DEFAULT_ARTICLE_PROMPT), rows: 14, hint: `Placeholders: {'{title}'}, {'{minWordCount}'}, {'{maxWordCount}'}, {'{language}'}, {'{anchors}'}. Must return HTML.` },
                      ]).map((p) => (
                        <div key={p.id}>
                          <div className="flex items-center justify-between">
                            <label className={labelCls}>{p.label}</label>
                            {p.isCustom && (
                              <button onClick={p.onReset} className="text-xs font-medium text-violet-400 hover:text-violet-300 transition">Reset to default</button>
                            )}
                          </div>
                          <textarea value={p.value} onChange={(e) => p.onChange(e.target.value)} rows={p.rows}
                            className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-xs leading-relaxed text-slate-300 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 resize-none"
                          />
                          <p className="mt-1 text-xs text-slate-500">{p.hint}</p>
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-white/[0.06] pt-5">
                        <p className="text-xs text-slate-500 max-w-xs">Prompts are shared. Saved changes apply for everyone.</p>
                        <MagneticBtn onClick={savePromptsToDb} disabled={savingPrompts}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-40">
                          {savingPrompts ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Check className="h-4 w-4" /> Save Prompts</>}
                        </MagneticBtn>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Step 2: Title review ── */}
            {step === 'titles' && (
              <section className="step-panel mt-8 space-y-4">
                <div className={card}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-violet-400" />
                      <h3 className="text-sm font-semibold text-slate-100">Titles to Generate</h3>
                      <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-300 ring-1 ring-violet-500/20">{titles.length}</span>
                    </div>
                    <button onClick={() => { setStep('input'); setTitles([]); }}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10">
                      ← Back
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 border-b border-white/[0.05] bg-white/[0.02] px-6 py-3">
                    <Chip>{minWordCount}–{maxWordCount} words</Chip>
                    <Chip icon={<Globe className="h-3 w-3" />}>{language}</Chip>
                    {validAnchors.length > 0 && <Chip icon={<Link2 className="h-3 w-3" />}>{validAnchors.length} anchor{validAnchors.length !== 1 ? 's' : ''}</Chip>}
                    {isCustomArticlePrompt && <Chip icon={<Settings2 className="h-3 w-3" />}>Custom prompt</Chip>}
                  </div>
                  <p className="px-6 pt-3 text-xs text-slate-500">Edit or remove titles, then click Generate Articles.</p>
                  <ul className="divide-y divide-white/[0.05] px-6 pb-2">
                    {titles.map((title, idx) => (
                      <li key={idx} className="title-item group flex items-center gap-3 py-3.5">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-white/[0.06] text-xs font-semibold text-slate-400">{idx + 1}</span>
                        {editingIndex === idx ? (
                          <input ref={editInputRef} type="text" value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditingIndex(null); setEditValue(''); } }}
                            className="min-w-0 flex-1 rounded-xl border border-violet-500 bg-violet-500/10 px-3 py-1.5 text-sm text-slate-100 outline-none ring-2 ring-violet-500/20"
                          />
                        ) : (
                          <span className="min-w-0 flex-1 text-sm text-slate-200">{title}</span>
                        )}
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {editingIndex !== idx && (
                            <button onClick={() => startEditing(idx, title)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-300 transition">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => removeTitle(idx)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                {titles.length === 0 && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-center text-sm text-amber-300">
                    All titles removed. Go back to generate new ones.
                  </div>
                )}
                <MagneticBtn onClick={generateArticles} disabled={titles.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-40">
                  <Wand2 className="h-4 w-4" />
                  Generate {titles.length > 0 ? `${titles.length} ` : ''}Article{titles.length !== 1 ? 's' : ''}
                </MagneticBtn>
              </section>
            )}

            {/* ── Step 3 & 4: Generating / Done ── */}
            {(step === 'generating' || step === 'done') && (
              <section className="step-panel mt-8 space-y-4">

                {/* Progress card */}
                <div className={`${card} p-5`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {step === 'generating' ? (
                        <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                      ) : (
                        <CheckCircle2 className="batch-complete-icon h-5 w-5 text-emerald-400" />
                      )}
                      <div>
                        {step === 'generating' ? (
                          <h3 className="text-sm font-semibold text-slate-100">Generating articles...</h3>
                        ) : (
                          <h3 className="batch-complete-text text-sm font-semibold text-slate-100">
                            Batch complete
                            {batchElapsed !== null && (
                              <span className="ml-2 font-normal text-slate-400">· {formatDuration(batchElapsed)} total</span>
                            )}
                          </h3>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span className="done-count font-semibold">{progressCounts.done}</span> done
                      </span>
                      {progressCounts.active > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          {progressCounts.active} active
                        </span>
                      )}
                      {progressCounts.pending > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                          {progressCounts.pending} pending
                        </span>
                      )}
                      {progressCounts.failed > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-rose-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          {progressCounts.failed} failed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Glowing gradient progress bar */}
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-500 transition-all duration-700 ease-out"
                      style={{
                        width: `${articles.length ? ((progressCounts.done + progressCounts.failed) / articles.length) * 100 : 0}%`,
                        boxShadow: '0 0 12px rgba(139,92,246,0.7), 0 0 24px rgba(139,92,246,0.3)',
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      {progressCounts.done + progressCounts.failed} of {articles.length} complete
                    </p>
                    {step === 'generating' && batchElapsed !== null && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Timer className="h-3 w-3" /> {formatDuration(batchElapsed)} elapsed
                      </span>
                    )}
                  </div>
                </div>

                {/* Article list */}
                <div className={`${card} overflow-hidden`}>
                  <ul className="divide-y divide-white/[0.05]">
                    {articles.map((article, idx) => (
                      <ArticleRow
                        key={idx}
                        index={idx}
                        article={article}
                        onRetry={() => retryArticle(idx)}
                        isProcessing={step === 'generating'}
                        liveTick={liveTick}
                      />
                    ))}
                  </ul>
                </div>

                {step === 'done' && (
                  <button onClick={resetAll}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-slate-100">
                    <RotateCw className="h-4 w-4" /> New Batch
                  </button>
                )}

                {doneArticles.length > 0 && (
                  <BulkLinksCard pairs={doneArticles.map((a) => ({ name: a.title, url: a.googleDocUrl! }))} />
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ════════════ Sub-components ════════════ */

function NavTab({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
        active ? 'bg-violet-600 text-white shadow-md shadow-violet-900/50' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
      }`}>
      {icon} {label}
    </button>
  );
}

function MagneticBtn({ children, className, onClick, disabled }: {
  children: React.ReactNode; className?: string; onClick?: () => void; disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const onMove = (e: React.MouseEvent) => {
    if (!ref.current || disabled) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width  / 2) * 0.3;
    const y = (e.clientY - r.top  - r.height / 2) * 0.3;
    gsap.to(ref.current, { x, y, duration: 0.3, ease: 'power2.out' });
  };

  const onLeave = () => {
    if (!ref.current) return;
    gsap.to(ref.current, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
  };

  useEffect(() => {
    if (disabled && ref.current) gsap.to(ref.current, { x: 0, y: 0, duration: 0.3 });
  }, [disabled]);

  return (
    <button ref={ref} className={className} onClick={onClick} disabled={disabled}
      onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </button>
  );
}

function Chip({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-400">
      {icon}{children}
    </span>
  );
}

function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return [...LANGUAGES];
    const q = search.toLowerCase();
    return LANGUAGES.filter((l) => l.toLowerCase().includes(q));
  }, [search]);

  useEffect(() => { if (open) { setSearch(''); setTimeout(() => searchRef.current?.focus(), 0); } }, [open]);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  return (
    <div ref={containerRef} className="relative mt-1.5">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-52 items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition hover:border-white/20">
        <span className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" />{value}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d1a] shadow-2xl shadow-black/60">
          <div className="border-b border-white/[0.06] p-2.5">
            <div className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search languages..."
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-4 py-3 text-center text-sm text-slate-500">No languages found</li>}
            {filtered.map((lang) => (
              <li key={lang}>
                <button type="button" onClick={() => { onChange(lang); setOpen(false); }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-violet-500/10 ${
                    value === lang ? 'bg-violet-500/15 font-medium text-violet-300' : 'text-slate-300'
                  }`}>
                  {lang}
                  {value === lang && <Check className="h-4 w-4 text-violet-400" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const STATUS_CFG: Record<ArticleStatus, { label: string; color: string }> = {
  pending:    { label: 'Pending',                     color: 'text-slate-500' },
  generating: { label: 'Generating content',          color: 'text-amber-400' },
  uploading:  { label: 'Uploading to Google Docs',    color: 'text-cyan-400'  },
  done:       { label: 'Done',                        color: 'text-emerald-400' },
  failed:     { label: 'Failed',                      color: 'text-rose-400'  },
};

function StatusIcon({ status }: { status: ArticleStatus }) {
  switch (status) {
    case 'done':       return <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-none" />;
    case 'failed':     return <AlertCircle  className="h-4 w-4 text-rose-400 flex-none" />;
    case 'generating': return <Loader2      className="h-4 w-4 animate-spin text-amber-400 flex-none" />;
    case 'uploading':  return <Loader2      className="h-4 w-4 animate-spin text-cyan-400 flex-none" />;
    default:           return <FileText     className="h-4 w-4 text-slate-500 flex-none" />;
  }
}

function ArticleRow({ index, article, onRetry, isProcessing, liveTick }: {
  index: number; article: ArticleEntry; onRetry: () => void; isProcessing: boolean; liveTick: number;
}) {
  const cfg = STATUS_CFG[article.status];
  const isActive = article.status === 'generating' || article.status === 'uploading';

  /* Live elapsed for in-progress articles */
  const liveElapsed = isActive && article.startTime
    ? Date.now() - article.startTime
    : null;
  void liveTick; // consumed for re-render

  /* Completed duration */
  const completedDuration = article.endTime && article.startTime
    ? article.endTime - article.startTime
    : null;

  return (
    <li className={`article-row flex items-center gap-3 px-5 py-4 transition ${
      isActive
        ? 'border-l-2 border-violet-500/70 bg-violet-500/[0.04]'
        : 'border-l-2 border-transparent hover:bg-white/[0.02]'
    }`}>
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-white/[0.06] text-xs font-semibold text-slate-400">
        {index + 1}
      </span>
      <StatusIcon status={article.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-200">{article.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className={`text-xs ${cfg.color}`}>
            {article.status === 'failed' && article.error ? article.error : cfg.label}
            {liveElapsed !== null && (
              <span className="text-slate-500"> · {formatDuration(liveElapsed)}</span>
            )}
          </span>
          {/* Word count badge */}
          {article.wordCount && article.wordCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
              {article.wordCount.toLocaleString()} words
            </span>
          )}
          {/* Time taken badge */}
          {completedDuration !== null && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
              <Timer className="h-3 w-3" /> {formatDuration(completedDuration)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-none">
        {article.status === 'done' && article.googleDocUrl && (
          <>
            <CopyBtn text={article.googleDocUrl} label="Copy" />
            <a href={article.googleDocUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition">
              <ExternalLink className="h-3.5 w-3.5" /> Open Doc
            </a>
          </>
        )}
        {article.status === 'failed' && !isProcessing && (
          <button onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition">
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </button>
        )}
      </div>
    </li>
  );
}

function CopyBtn({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <button onClick={copy} title={label}
      className={className || 'inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition'}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

type CopyFormat = 'urls' | 'name-url' | 'numbered';
const FORMAT_OPTIONS: { key: CopyFormat; label: string; hint: string }[] = [
  { key: 'urls',     label: 'URLs only',     hint: 'One link per line' },
  { key: 'name-url', label: 'Name + URL',    hint: 'Two columns in Sheets' },
  { key: 'numbered', label: 'Numbered list', hint: '1. Name — URL' },
];

function BulkLinksCard({ pairs }: { pairs: { name: string; url: string }[] }) {
  const [format, setFormat] = useState<CopyFormat>('urls');
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    if (format === 'urls')     return pairs.map((p) => p.url).join('\n');
    if (format === 'name-url') return pairs.map((p) => `${p.name}\t${p.url}`).join('\n');
    return pairs.map((p, i) => `${i + 1}. ${p.name} — ${p.url}`).join('\n');
  }, [pairs, format]);

  const copy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/20">
            <Link2 className="h-4 w-4 text-violet-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-100">
            {pairs.length} {pairs.length === 1 ? 'link' : 'links'} ready to copy
          </h3>
        </div>
        <button onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-3.5 py-2 text-xs font-semibold text-white shadow shadow-violet-900/40 hover:from-violet-500 hover:to-purple-600 transition">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy all'}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {FORMAT_OPTIONS.map((o) => (
          <button key={o.key} onClick={() => setFormat(o.key)}
            className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
              format === o.key
                ? 'border-violet-500/40 bg-white/10 ring-1 ring-violet-500/20'
                : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
            }`}>
            <div className={`font-semibold ${format === o.key ? 'text-violet-300' : 'text-slate-300'}`}>{o.label}</div>
            <div className="text-slate-500">{o.hint}</div>
          </button>
        ))}
      </div>
      <pre className="mt-4 max-h-72 overflow-auto whitespace-pre rounded-xl border border-white/[0.07] bg-white/[0.04] p-4 text-xs leading-relaxed text-slate-300">
        {text || '(empty)'}
      </pre>
      <ol className="mt-4 space-y-2">
        {pairs.map((p, i) => (
          <li key={p.url} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3.5 py-2.5">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-lg bg-violet-500/20 text-[10px] font-bold text-violet-300">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-300">{p.name}</span>
            <a href={p.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-400 hover:text-violet-300 transition">
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

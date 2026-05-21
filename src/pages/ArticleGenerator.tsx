import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

import {
  Sparkles, Loader2, CheckCircle2, AlertCircle, Copy,
  ExternalLink, Trash2, Pencil, Link2, Wand2, FileText, RotateCw,
  Plus, ChevronDown, Settings2, Search, Globe, Check,
  Clock, Zap, Timer, Layers, ArrowRight, RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY    = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Tab          = 'generator' | 'history';
type Step         = 'input' | 'titles' | 'generating' | 'done';
type ArticleStatus= 'pending' | 'generating' | 'uploading' | 'done' | 'failed';
type TitleSource  = 'ai' | 'custom';

interface Anchor { text: string; url: string; }
interface ArticleEntry {
  title: string; status: ArticleStatus;
  bodyHtml?: string; googleDocId?: string; googleDocUrl?: string;
  error?: string; dbId?: string;
  startTime?: number; endTime?: number; wordCount?: number;
}
interface HistoryBatchArticle {
  id: string; title: string; google_doc_url: string | null; status: string;
  word_count?: number; duration_ms?: number;
}
interface HistoryBatch {
  id: string; topic: string; created_at: string;
  requested_count: number; language: string; articles: HistoryBatchArticle[];
  batch_started_at?: string | null; batch_completed_at?: string | null;
}

const LANGUAGES = [
  'English','Spanish','French','German','Italian','Portuguese','Dutch','Russian',
  'Chinese (Simplified)','Chinese (Traditional)','Japanese','Korean','Arabic','Hindi',
  'Bengali','Urdu','Turkish','Vietnamese','Thai','Indonesian','Malay','Filipino',
  'Polish','Ukrainian','Romanian','Czech','Hungarian','Greek','Swedish','Norwegian',
  'Danish','Finnish','Hebrew','Persian','Swahili','Tamil','Telugu','Kannada',
  'Malayalam','Marathi','Gujarati','Punjabi','Nepali','Sinhala','Burmese',
  'Khmer','Lao','Georgian','Armenian','Azerbaijani','Kazakh','Uzbek','Mongolian',
  'Tibetan','Croatian','Serbian','Slovak','Slovenian','Bulgarian','Lithuanian',
  'Latvian','Estonian','Albanian','Macedonian','Bosnian','Icelandic','Irish',
  'Welsh','Catalan','Basque','Galician','Afrikaans','Yoruba','Igbo','Hausa',
  'Amharic','Somali','Zulu','Xhosa',
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
- Use <h2>, <h3> for headings; <p> for paragraphs; <a> for anchor links only
- No tables, no bullet points or lists; No extra blank lines; First element MUST be <p>
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

QUALITY CHECKLIST:
- Is the word count strictly between {minWordCount} and {maxWordCount}?
- Does the intro open with a question that pulls the reader in?
- Does every section add real value, not just filler?
- Does it read like a human wrote it, not an AI?
- Are all headings properly capitalized?
- Is the first HTML element a <p> tag? Are all banned words avoided?`;

/* ─── Utilities ─── */
function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();
  return text ? text.split(' ').filter(Boolean).length : 0;
}
function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
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

/* ─── Style tokens ─── */
const card     = 'rounded-2xl border border-white/[0.08] bg-[#0b0b18] card-glow transition-all duration-300';
const inputCls = 'mt-1.5 w-full rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-200 focus:border-violet-400/60 focus:bg-violet-500/[0.06] focus:ring-2 focus:ring-violet-500/20';
const labelCls = 'block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2';

/* ─── Stable particle data (module-level so it's created once) ─── */
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: ((i * 13.71 + 5) % 100),
  y: ((i * 7.37 + 8) % 100),
  size: [1, 1, 1, 1.5, 1.5, 2, 2, 2.5][i % 8],
  color: [
    'rgba(139,92,246,0.7)', 'rgba(139,92,246,0.5)',
    'rgba(34,211,238,0.5)', 'rgba(34,211,238,0.3)',
    'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.2)',
  ][i % 6],
}));

/* ─── Hero char component ─── */
function HeroChar({ char, gradient }: { char: string; gradient?: boolean }) {
  return (
    <span className="overflow-hidden inline-block" style={{ verticalAlign: 'bottom' }}>
      <span className={`hero-char inline-block ${gradient
        ? 'bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent'
        : 'text-white'}`}>
        {char === ' ' ? ' ' : char}
      </span>
    </span>
  );
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
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
  const [batchStartTime, setBatchStartTime] = useState<number | null>(null);
  const [batchEndTime, setBatchEndTime]     = useState<number | null>(null);
  const [liveTick, setLiveTick]             = useState(0);

  const abortRef         = useRef(false);
  const editInputRef     = useRef<HTMLInputElement | null>(null);
  const rootRef          = useRef<HTMLDivElement>(null);
  const prevDoneCount    = useRef(0);
  const prevArticleCount = useRef(0);

  /* Live ticker */
  useEffect(() => {
    if (step !== 'generating') return;
    const id = setInterval(() => setLiveTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [step]);

  const batchElapsed = useMemo(() => {
    if (!batchStartTime) return null;
    return (batchEndTime ?? Date.now()) - batchStartTime;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchStartTime, batchEndTime, liveTick]);

  /* DB: shared prompts */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('shared_prompts').select('id,content').in('id',['title_prompt','article_prompt']);
      if (data) for (const r of data) {
        if (r.id === 'title_prompt'   && r.content) setTitlePrompt(r.content);
        if (r.id === 'article_prompt' && r.content) setArticlePrompt(r.content);
      }
    })();
  }, []);

  /* Auth */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) await supabase.auth.signInAnonymously();
    })();
  }, []);

  useEffect(() => {
    if (editingIndex !== null) editInputRef.current?.focus();
  }, [editingIndex]);

  /* ══ GSAP: floating orbs ══ */
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to('.bg-orb-1', { x: 180, y: 130,  duration: 20, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.bg-orb-2', { x: -160, y: -100, duration: 25, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 4 });
      gsap.to('.bg-orb-3', { x: 120, y: -150,  duration: 28, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 8 });
      gsap.to('.bg-orb-4', { x: -90,  y: 110,  duration: 22, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 12 });
    });
    return () => ctx.revert();
  }, []);

  /* ══ GSAP: floating particles ══ */
  useEffect(() => {
    const ctx = gsap.context(() => {
      PARTICLES.forEach((p) => {
        gsap.to(`.ptcl-${p.id}`, {
          x: gsap.utils.random(-180, 180),
          y: gsap.utils.random(-180, 180),
          duration: gsap.utils.random(18, 45),
          repeat: -1, yoyo: true, ease: 'sine.inOut',
          delay: gsap.utils.random(0, 15),
        });
      });
    });
    return () => ctx.revert();
  }, []);

  /* ══ GSAP: hero entrance — character reveal ══ */
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      tl.from('.anim-header',  { y: -70, opacity: 0, duration: 1 })
        .from('.anim-eyebrow', { y: 24, opacity: 0, duration: 0.7, ease: 'back.out(1.7)' }, '-=0.5')
        .fromTo('.hero-char',
          { y: '120%' },
          { y: '0%', duration: 1, stagger: 0.015, ease: 'power4.out' },
          '-=0.4'
        )
        .from('.anim-sub',     { y: 30, opacity: 0, duration: 0.8 }, '-=0.6')
        .from('.anim-feature', { y: 20, opacity: 0, duration: 0.6, stagger: 0.12, ease: 'back.out(1.5)' }, '-=0.5')
        .from('.anim-steps',   { y: 20, opacity: 0, duration: 0.6 }, '-=0.4');
    }, rootRef);
    return () => ctx.revert();
  }, []);

  /* ══ GSAP: step transition — blur + scale ══ */
  useEffect(() => {
    gsap.fromTo('.step-panel',
      { opacity: 0, y: 40, scale: 0.97, filter: 'blur(6px)' },
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.65, ease: 'power3.out' }
    );
  }, [step]);

  /* ══ GSAP: tab transition ══ */
  useEffect(() => {
    gsap.fromTo('.tab-panel',
      { opacity: 0, y: 28, filter: 'blur(4px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.55, ease: 'power3.out' }
    );
  }, [activeTab]);

  /* ══ GSAP: title items spring ══ */
  useEffect(() => {
    if (step === 'titles' && titles.length > 0) {
      gsap.fromTo('.title-item',
        { opacity: 0, x: -30, filter: 'blur(3px)' },
        { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.5, stagger: 0.04, ease: 'power3.out', delay: 0.2 }
      );
    }
  }, [step]);

  /* ══ GSAP: article rows ══ */
  useEffect(() => {
    if (articles.length > 0 && articles.length !== prevArticleCount.current) {
      prevArticleCount.current = articles.length;
      gsap.fromTo('.article-row',
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.45, stagger: 0.04, ease: 'back.out(1.4)', delay: 0.1 }
      );
    }
  }, [articles.length]);

  /* ══ GSAP: done count bounce ══ */
  useEffect(() => {
    const done = articles.filter(a => a.status === 'done').length;
    if (done > 0 && done !== prevDoneCount.current) {
      prevDoneCount.current = done;
      gsap.fromTo('.done-count',
        { scale: 1.8, color: '#a78bfa' },
        { scale: 1, color: '#4ade80', duration: 0.6, ease: 'elastic.out(1, 0.4)' }
      );
    }
  }, [articles]);

  /* ══ GSAP: batch complete — confetti burst + celebration ══ */
  useEffect(() => {
    if (step !== 'done') return;

    /* Icon entrance */
    gsap.timeline()
      .from('.batch-done-icon', { scale: 0, rotation: -180, duration: 0.9, ease: 'back.out(2)' })
      .to('.batch-done-icon', {
        filter: 'drop-shadow(0 0 24px rgba(74,222,128,1))',
        duration: 0.3, yoyo: true, repeat: 7, ease: 'sine.inOut',
      }, '-=0.1')
      .from('.batch-done-stat', { opacity: 0, y: 16, duration: 0.5, stagger: 0.1 }, '-=0.6');

    /* Confetti burst */
    const colors = ['#8b5cf6','#22d3ee','#4ade80','#f59e0b','#f472b6','#a78bfa'];
    const container = document.getElementById('confetti-root');
    if (!container) return;
    Array.from({ length: 35 }).forEach((_, i) => {
      const el = document.createElement('div');
      const size = 5 + Math.random() * 6;
      el.style.cssText = `
        position:absolute; width:${size}px; height:${size}px;
        border-radius:${i % 3 === 0 ? '50%' : '2px'};
        background:${colors[i % colors.length]};
        left:50%; top:40%; pointer-events:none; z-index:50;
        box-shadow: 0 0 ${size}px ${colors[i % colors.length]};
      `;
      container.appendChild(el);
      gsap.to(el, {
        x: gsap.utils.random(-280, 280),
        y: gsap.utils.random(-200, 120),
        rotation: gsap.utils.random(-540, 540),
        opacity: 0, scale: gsap.utils.random(0.3, 1.2),
        duration: gsap.utils.random(1.2, 2.4),
        ease: 'power2.out',
        delay: gsap.utils.random(0, 0.3),
        onComplete: () => el.remove(),
      });
    });
  }, [step]);

  /* ══ GSAP: ScrollTrigger for history ══ */
  useEffect(() => {
    if (activeTab === 'history' && historyBatches.length > 0) {
      const ctx = gsap.context(() => {
        ScrollTrigger.batch('.history-item', {
          onEnter: (els) => gsap.fromTo(els,
            { opacity: 0, y: 50, scale: 0.97, filter: 'blur(5px)' },
            { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.65, stagger: 0.09, ease: 'power3.out' }
          ),
          start: 'top 92%',
        });
      }, rootRef);
      return () => ctx.revert();
    }
  }, [activeTab, historyBatches.length]);

  /* ══ Callbacks ══ */
  const savePromptsToDb = useCallback(async () => {
    setSavingPrompts(true); setError(null);
    try {
      const t1 = await supabase.from('shared_prompts').update({ content: titlePrompt,   updated_at: new Date().toISOString() }).eq('id','title_prompt');
      if (t1.error) throw new Error(t1.error.message);
      const t2 = await supabase.from('shared_prompts').update({ content: articlePrompt, updated_at: new Date().toISOString() }).eq('id','article_prompt');
      if (t2.error) throw new Error(t2.error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompts');
    } finally { setSavingPrompts(false); }
  }, [titlePrompt, articlePrompt]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data: batches } = await supabase
        .from('article_batches').select('id,topic,created_at,requested_count,language,batch_started_at,batch_completed_at')
        .order('created_at', { ascending: false });
      if (!batches || !batches.length) { setHistoryBatches([]); return; }
      const { data: arts } = await supabase
        .from('articles').select('id,title,google_doc_url,status,batch_id,word_count,duration_ms')
        .in('batch_id', batches.map(b => b.id));
      const map: Record<string, HistoryBatchArticle[]> = {};
      for (const a of arts || []) (map[a.batch_id] ||= []).push({ id: a.id, title: a.title, google_doc_url: a.google_doc_url, status: a.status, word_count: a.word_count, duration_ms: a.duration_ms });
      setHistoryBatches(batches.map(b => ({ ...b, articles: map[b.id] || [] })));
    } catch { /* best-effort */ } finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);

  const parsedCustomTitles = useMemo(() => customTitlesText.split(/[,\n]/).map(s => s.trim()).filter(Boolean), [customTitlesText]);
  const useCustomTitles    = useCallback(() => { if (!parsedCustomTitles.length) return; setTitles(parsedCustomTitles); setStep('titles'); }, [parsedCustomTitles]);
  const updateArticle      = useCallback((idx: number, patch: Partial<ArticleEntry>) =>
    setArticles(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a)), []);
  const validAnchors = useMemo(() => anchors.filter(a => a.text.trim() && a.url.trim()), [anchors]);
  const addAnchor    = useCallback(() => setAnchors(p => [...p, { text:'', url:'' }]), []);
  const updateAnchor = useCallback((idx: number, f: keyof Anchor, v: string) => setAnchors(p => p.map((a,i) => i===idx ? {...a,[f]:v} : a)), []);
  const removeAnchor = useCallback((idx: number) => setAnchors(p => p.filter((_,i) => i!==idx)), []);
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

  const removeTitle  = useCallback((idx: number) => setTitles(p => p.filter((_,i) => i!==idx)), []);
  const startEditing = useCallback((idx: number, t: string) => { setEditingIndex(idx); setEditValue(t); }, []);
  const commitEdit   = useCallback(() => {
    if (editingIndex === null) return;
    const v = editValue.trim();
    if (v) setTitles(p => p.map((t,i) => i===editingIndex ? v : t));
    setEditingIndex(null); setEditValue('');
  }, [editingIndex, editValue]);

  const generateArticles = useCallback(async () => {
    if (!titles.length) return;
    setError(null); abortRef.current = false;
    const now = Date.now();
    setBatchStartTime(now); setBatchEndTime(null); setLiveTick(0);
    setArticles(titles.map(title => ({ title, status: 'pending' as ArticleStatus })));
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
          batch_started_at: new Date(now).toISOString(),
        }).select('id').maybeSingle();
        if (batch?.id) { currentBatchId = batch.id; setBatchId(batch.id); }
      }
      if (currentBatchId) {
        const { data: inserted } = await supabase.from('articles')
          .insert(titles.map(title => ({ batch_id: currentBatchId, title, status: 'pending' })))
          .select('id,title');
        if (inserted) setArticles(prev => prev.map(a => {
          const m = inserted.find((r: {id:string;title:string}) => r.title === a.title);
          return m ? { ...a, dbId: m.id } : a;
        }));
      }
    } catch { /* DB best-effort */ }

    let queueIdx = 0;
    const worker = async () => {
      while (true) {
        if (abortRef.current) return;
        const i = queueIdx++;
        if (i >= titles.length) return;
        const artStart = Date.now();
        updateArticle(i, { status: 'generating', startTime: artStart });
        try {
          const artData = await edgeFetch<{ html: string }>('generate-article', {
            title: titles[i], topic: topic.trim(), minWordCount, maxWordCount,
            language, anchors: validAnchors, articlePrompt,
          });
          if (abortRef.current) return;
          const wc = countWords(artData.html);
          updateArticle(i, { status: 'uploading', bodyHtml: artData.html, wordCount: wc });
          const docData = await edgeFetch<{ googleDocId: string; googleDocUrl: string }>(
            'create-article-doc', { title: titles[i], bodyHtml: artData.html, topic: topic.trim() },
          );
          const artEnd = Date.now(), dur = artEnd - artStart;
          updateArticle(i, { status: 'done', googleDocId: docData.googleDocId, googleDocUrl: docData.googleDocUrl, endTime: artEnd });
          setArticles(prev => {
            const art = prev[i];
            if (art.dbId) supabase.from('articles').update({ body_html: artData.html, google_doc_id: docData.googleDocId, google_doc_url: docData.googleDocUrl, status: 'done', word_count: wc, duration_ms: dur, updated_at: new Date().toISOString() }).eq('id', art.dbId).then();
            return prev;
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          updateArticle(i, { status: 'failed', error: message, endTime: Date.now() });
          setArticles(prev => {
            const art = prev[i];
            if (art.dbId) supabase.from('articles').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() }).eq('id', art.dbId).then();
            return prev;
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, titles.length) }, () => worker()));

    const batchEnd = Date.now();
    setBatchEndTime(batchEnd);
    if (currentBatchId) {
      await supabase.from('article_batches')
        .update({ status: 'completed', batch_completed_at: new Date(batchEnd).toISOString(), updated_at: new Date().toISOString() })
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
      const artData = await edgeFetch<{ html: string }>('generate-article', { title: article.title, topic: topic.trim(), minWordCount, maxWordCount, language, anchors: validAnchors, articlePrompt });
      const wc = countWords(artData.html);
      updateArticle(idx, { status: 'uploading', bodyHtml: artData.html, wordCount: wc });
      const docData = await edgeFetch<{ googleDocId: string; googleDocUrl: string }>('create-article-doc', { title: article.title, bodyHtml: artData.html, topic: topic.trim() });
      const retryEnd = Date.now();
      updateArticle(idx, { status: 'done', googleDocId: docData.googleDocId, googleDocUrl: docData.googleDocUrl, endTime: retryEnd });
      if (article.dbId) await supabase.from('articles').update({ body_html: artData.html, google_doc_id: docData.googleDocId, google_doc_url: docData.googleDocUrl, status: 'done', error_message: null, word_count: wc, duration_ms: retryEnd - artStart, updated_at: new Date().toISOString() }).eq('id', article.dbId);
    } catch (err) {
      updateArticle(idx, { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error', endTime: Date.now() });
    }
  }, [articles, topic, updateArticle, minWordCount, maxWordCount, language, validAnchors, articlePrompt]);

  const doneArticles   = useMemo(() => articles.filter(a => a.status === 'done' && a.googleDocUrl), [articles]);
  const progressCounts = useMemo(() => ({
    pending: articles.filter(a => a.status === 'pending').length,
    active:  articles.filter(a => a.status === 'generating' || a.status === 'uploading').length,
    done:    articles.filter(a => a.status === 'done').length,
    failed:  articles.filter(a => a.status === 'failed').length,
  }), [articles]);

  const resetAll = useCallback(() => {
    abortRef.current = true;
    setStep('input'); setTitles([]); setArticles([]); setBatchId(null); setError(null);
    setBatchStartTime(null); setBatchEndTime(null); setLiveTick(0);
  }, []);

  const toggleBatch = useCallback((id: string) => {
    setExpandedBatches(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  /* ══════════════════════════
     RENDER
  ══════════════════════════ */
  return (
    <div ref={rootRef} className="min-h-screen bg-[#04040a] text-slate-100 overflow-x-hidden">

      {/* ── Custom cursor ── */}
      <CustomCursor />

      {/* ── Confetti container ── */}
      <div id="confetti-root" className="fixed inset-0 pointer-events-none overflow-hidden z-50" aria-hidden />

      {/* ── Background ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
        {/* Orbs — vivid and large */}
        <div className="bg-orb-1 absolute -top-[35rem] -left-[30rem] w-[1000px] h-[1000px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.28) 0%, rgba(124,58,237,0.08) 40%, transparent 70%)' }} />
        <div className="bg-orb-2 absolute top-1/2 -right-[28rem] w-[900px] h-[900px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.2) 0%, rgba(79,70,229,0.06) 40%, transparent 70%)' }} />
        <div className="bg-orb-3 absolute -bottom-[22rem] left-1/4 w-[850px] h-[850px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.22) 0%, rgba(139,92,246,0.06) 40%, transparent 70%)' }} />
        <div className="bg-orb-4 absolute top-1/3 left-1/2 w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(14,116,144,0.1) 0%, transparent 65%)' }} />
        {/* Grid */}
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '60px 60px' }} />
        {/* Vignette */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 40%, transparent 40%, rgba(4,4,10,0.85) 100%)' }} />
        {/* Particles */}
        {PARTICLES.map(p => (
          <div key={p.id} className={`ptcl-${p.id} absolute rounded-full pointer-events-none`}
            style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%`, background: p.color, boxShadow: p.size >= 2 ? `0 0 ${p.size * 4}px ${p.color}` : undefined }} />
        ))}
      </div>

      {/* ── Header ── */}
      <header className="anim-header sticky top-0 z-30 border-b border-white/[0.06]"
        style={{ background: 'rgba(4,4,10,0.8)', backdropFilter: 'blur(20px)' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 flex items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 24px rgba(124,58,237,0.55)' }}>
              <Zap className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-sm font-black tracking-tight leading-none text-white">
                Quill<span style={{ background: 'linear-gradient(90deg,#a78bfa,#67e8f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}> AI</span>
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 mt-0.5">Bulk Article Generator</div>
            </div>
          </div>
          <nav className="flex gap-0.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
            <NavTab active={activeTab === 'generator'} onClick={() => setActiveTab('generator')} icon={<Wand2 className="h-3.5 w-3.5" />} label="Generator" />
            <NavTab active={activeTab === 'history'}  onClick={() => setActiveTab('history')}  icon={<Clock className="h-3.5 w-3.5" />} label="History" />
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 pb-32 pt-14">

        {/* ════ HISTORY ════ */}
        {activeTab === 'history' && (
          <div className="tab-panel">
            <div className="flex items-end justify-between mb-10">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-500 mb-2">Archive</p>
                <h1 className="text-4xl font-black tracking-tight text-white">Article History</h1>
                <p className="mt-1.5 text-sm text-slate-400">Every batch you've generated, with full stats.</p>
              </div>
              <button onClick={loadHistory} disabled={historyLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-white/[0.08] hover:border-white/[0.2] hover:text-white disabled:opacity-40">
                <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? 'animate-spin' : ''}`} />Refresh
              </button>
            </div>

            {historyLoading ? (
              <div className="mt-24 flex flex-col items-center gap-5 text-slate-500">
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
                  <div className="absolute inset-0 rounded-full border-t-2 border-violet-500 animate-spin" style={{ filter: 'drop-shadow(0 0 6px rgba(139,92,246,0.8))' }} />
                </div>
                <p className="text-sm">Loading history…</p>
              </div>
            ) : historyBatches.length === 0 ? (
              <div className="mt-28 flex flex-col items-center gap-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.04]">
                  <Clock className="h-7 w-7 text-slate-500" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-200">No batches yet</p>
                  <p className="mt-1 text-sm text-slate-500">Generate your first batch to see history here.</p>
                </div>
                <PrimaryBtn onClick={() => setActiveTab('generator')}><Wand2 className="h-4 w-4" /> Start generating</PrimaryBtn>
              </div>
            ) : (
              <div className="history-list space-y-3">
                {historyBatches.map(batch => {
                  const isOpen = expandedBatches.has(batch.id);
                  const doneCount = batch.articles.filter(a => a.status === 'done').length;
                  const batchDurMs = batch.batch_started_at && batch.batch_completed_at
                    ? new Date(batch.batch_completed_at).getTime() - new Date(batch.batch_started_at).getTime() : null;
                  const totalWords = batch.articles.reduce((s, a) => s + (a.word_count || 0), 0);
                  return (
                    <div key={batch.id} className="history-item overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0b18] transition-all duration-300 hover:border-violet-500/20 hover:shadow-[0_0_40px_rgba(139,92,246,0.05)]">
                      <button onClick={() => toggleBatch(batch.id)}
                        className="flex w-full items-center gap-4 px-5 py-5 text-left transition hover:bg-white/[0.02]">
                        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20"
                          style={{ boxShadow: '0 0 16px rgba(139,92,246,0.12)' }}>
                          <FileText className="h-4.5 w-4.5 text-violet-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{batch.topic}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="text-xs text-slate-500">
                              {new Date(batch.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-slate-700">·</span>
                            <span className="text-xs text-slate-500">{batch.language}</span>
                            {batchDurMs !== null && <>
                              <span className="text-slate-700">·</span>
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Timer className="h-3 w-3 text-violet-500" />{formatDuration(batchDurMs)}</span>
                            </>}
                            {totalWords > 0 && <>
                              <span className="text-slate-700">·</span>
                              <span className="text-xs text-slate-500">{totalWords.toLocaleString()} words</span>
                            </>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 flex-none">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${doneCount === batch.requested_count ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25' : 'bg-violet-500/10 text-violet-300 ring-violet-500/25'}`}>
                            {doneCount}/{batch.requested_count}
                          </span>
                          <div className={`flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-white/[0.05]">
                          {batch.articles.length === 0 ? (
                            <p className="px-5 py-5 text-sm text-slate-500">No articles found.</p>
                          ) : (
                            <>
                              {batch.articles.some(a => a.google_doc_url) && (
                                <div className="border-b border-white/[0.04] bg-white/[0.01] px-5 py-3">
                                  <CopyBtn text={batch.articles.filter(a => a.google_doc_url).map(a => a.google_doc_url).join('\n')} label="Copy all URLs"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/[0.1] hover:text-white transition" />
                                </div>
                              )}
                              <ul className="divide-y divide-white/[0.04]">
                                {batch.articles.map(article => (
                                  <li key={article.id} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]">
                                    <div className={`h-2 w-2 flex-none rounded-full ${article.status === 'done' ? 'bg-emerald-400' : article.status === 'failed' ? 'bg-red-400' : 'bg-slate-600'}`}
                                      style={article.status === 'done' ? { boxShadow: '0 0 6px rgba(74,222,128,0.6)' } : undefined} />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-slate-200">{article.title}</p>
                                      {(article.word_count || article.duration_ms) && (
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                          {!!article.word_count && article.word_count > 0 && (
                                            <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                                              {article.word_count.toLocaleString()} words
                                            </span>
                                          )}
                                          {!!article.duration_ms && article.duration_ms > 0 && (
                                            <span className="inline-flex items-center gap-0.5 rounded-md border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                                              <Timer className="h-2.5 w-2.5" />{formatDuration(article.duration_ms)}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-none opacity-0 group-hover:opacity-100 transition-opacity">
                                      {article.google_doc_url ? (
                                        <>
                                          <CopyBtn text={article.google_doc_url} label="Copy" />
                                          <a href={article.google_doc_url} target="_blank" rel="noreferrer"
                                            className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-bold text-violet-300 hover:bg-violet-500/20 hover:text-white transition">
                                            <ExternalLink className="h-3 w-3" />Open
                                          </a>
                                        </>
                                      ) : (
                                        <span className="text-xs capitalize text-slate-500">{article.status}</span>
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

        {/* ════ GENERATOR ════ */}
        {activeTab === 'generator' && (
          <div className="tab-panel">

            {/* Hero */}
            <div className="mb-16">
              <div className="anim-eyebrow inline-flex items-center gap-2.5 rounded-full border border-violet-500/25 bg-violet-500/[0.08] px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-300 mb-8"
                style={{ boxShadow: '0 0 20px rgba(139,92,246,0.15)' }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-400" />
                </span>
                AI-Powered Content Generation
              </div>

              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter mb-6 select-none leading-[0.95]">
                <div>
                  {'Generate '.split('').map((c, i) => <HeroChar key={`a${i}`} char={c} />)}
                </div>
                <div>
                  {'articles.'.split('').map((c, i) => <HeroChar key={`b${i}`} char={c} />)}
                </div>
                <div>
                  {'Instantly.'.split('').map((c, i) => <HeroChar key={`c${i}`} char={c} gradient />)}
                </div>
              </h1>

              <p className="anim-sub text-lg text-slate-400 leading-relaxed max-w-lg mb-10">
                Enter a topic, review AI-suggested titles, then watch Claude write full
                SEO articles and push them to Google Docs — <strong className="text-slate-200 font-semibold">three at a time.</strong>
              </p>

              <div className="flex flex-wrap gap-3 mb-12">
                {[
                  { icon: <Layers className="h-3.5 w-3.5" />,   label: '3 in parallel'     },
                  { icon: <FileText className="h-3.5 w-3.5" />, label: 'Auto Google Docs'  },
                  { icon: <Globe className="h-3.5 w-3.5" />,    label: '80+ languages'     },
                  { icon: <Sparkles className="h-3.5 w-3.5" />, label: 'Claude AI'         },
                ].map(f => (
                  <div key={f.label} className="anim-feature inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300 transition-all hover:border-violet-500/40 hover:bg-violet-500/[0.07] hover:text-white">
                    <span className="text-violet-400">{f.icon}</span>{f.label}
                  </div>
                ))}
              </div>

              <div className="anim-steps">
                <StepIndicator step={step} />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.08] p-4 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* ══ Step 1: Configure ══ */}
            {step === 'input' && (
              <section className="step-panel space-y-4">
                <div className={card}>
                  <div className="flex items-center gap-3 border-b border-white/[0.06] px-7 py-5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black text-violet-300 ring-1 ring-violet-500/30"
                      style={{ background: 'rgba(124,58,237,0.15)', boxShadow: '0 0 14px rgba(124,58,237,0.2)' }}>01</span>
                    <div>
                      <h2 className="text-sm font-black text-white">Configure your batch</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Set parameters, add anchors, choose title source.</p>
                    </div>
                  </div>

                  <div className="px-7 py-6 space-y-7">
                    <div>
                      <label className={labelCls}>Topic</label>
                      <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
                        placeholder='e.g. "Online Slots", "Digital Marketing"'
                        className={inputCls} />
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <div>
                        <label className={labelCls}>Min words</label>
                        <input type="number" min={300} max={10000} step={100} value={minWordCount}
                          onChange={e => { const v = Math.max(300,Math.min(10000,+e.target.value||1000)); setMinWordCount(v); if(maxWordCount<v) setMaxWordCount(v); }}
                          className={`${inputCls} w-32`} />
                      </div>
                      <div>
                        <label className={labelCls}>Max words</label>
                        <input type="number" min={300} max={10000} step={100} value={maxWordCount}
                          onChange={e => setMaxWordCount(Math.max(minWordCount,Math.min(10000,+e.target.value||1300)))}
                          className={`${inputCls} w-32`} />
                      </div>
                      <div>
                        <label className={labelCls}>Language</label>
                        <LanguageSelect value={language} onChange={setLanguage} />
                      </div>
                    </div>

                    {/* Anchors */}
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                          <span className="text-xs font-black uppercase tracking-[0.15em] text-slate-300">Anchor Links</span>
                          {validAnchors.length > 0 && (
                            <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-black text-cyan-400 ring-1 ring-cyan-500/25">{validAnchors.length}</span>
                          )}
                        </div>
                        <button onClick={addAnchor}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] px-3 py-1.5 text-[11px] font-bold text-slate-400 transition hover:border-cyan-400/40 hover:text-cyan-400">
                          <Plus className="h-3 w-3" />Add anchor
                        </button>
                      </div>
                      {anchors.length === 0 && <p className="text-xs text-slate-500">No anchors yet. Anchor links are embedded naturally across every article.</p>}
                      <div className="space-y-2.5">
                        {anchors.map((anchor, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input type="text" value={anchor.text} onChange={e => updateAnchor(idx,'text',e.target.value)} placeholder="Anchor text"
                              className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-500/20 transition" />
                            <input type="url" value={anchor.url} onChange={e => updateAnchor(idx,'url',e.target.value)} placeholder="https://example.com"
                              className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-500/20 transition" />
                            <button onClick={() => removeAnchor(idx)} className="rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Title source */}
                    <div>
                      <label className={labelCls}>Title source</label>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {([
                          { key: 'ai',     icon: <Sparkles className="h-4 w-4" />, title: 'AI generated',   desc: 'Claude suggests titles from your topic' },
                          { key: 'custom', icon: <FileText  className="h-4 w-4" />, title: 'Your own titles', desc: 'Paste titles separated by line or comma' },
                        ] as const).map(opt => (
                          <button key={opt.key} onClick={() => setTitleSource(opt.key)}
                            className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-300 ${titleSource === opt.key
                              ? 'border-violet-500/40 bg-violet-500/[0.1]'
                              : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.05]'}`}
                            style={titleSource === opt.key ? { boxShadow: '0 0 30px rgba(124,58,237,0.12), inset 0 0 30px rgba(124,58,237,0.04)' } : undefined}>
                            {titleSource === opt.key && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" />}
                            <div className={`mb-2 ${titleSource === opt.key ? 'text-violet-400' : 'text-slate-600 group-hover:text-slate-500'} transition`}>{opt.icon}</div>
                            <div className={`text-sm font-black ${titleSource === opt.key ? 'text-white' : 'text-slate-400'}`}>{opt.title}</div>
                            <div className={`mt-0.5 text-[11px] leading-relaxed ${titleSource === opt.key ? 'text-slate-400' : 'text-slate-600'}`}>{opt.desc}</div>
                          </button>
                        ))}
                      </div>

                      {titleSource === 'ai' && (
                        <div className="mt-5 flex items-end gap-3">
                          <div>
                            <label className={labelCls}>Number of titles</label>
                            <input type="number" min={1} max={200} value={count}
                              onChange={e => setCount(Math.max(1,Math.min(200,+e.target.value||1)))}
                              className={`${inputCls} w-28`} />
                          </div>
                          <MagneticBtn onClick={generateTitles} disabled={loadingTitles || !topic.trim()}
                            className="group relative overflow-hidden inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white btn-glow disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                            {loadingTitles ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><Sparkles className="h-4 w-4" />Generate Titles</>}
                          </MagneticBtn>
                        </div>
                      )}

                      {titleSource === 'custom' && (
                        <div className="mt-5">
                          <label className={labelCls}>Paste your titles</label>
                          <textarea value={customTitlesText} onChange={e => setCustomTitlesText(e.target.value)} rows={6}
                            placeholder={"Title One\nTitle Two\nTitle Three"}
                            className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm leading-relaxed text-white placeholder-slate-500 outline-none focus:border-violet-400/50 focus:ring-2 focus:ring-violet-500/20 resize-none transition" />
                          <div className="mt-3 flex items-center justify-between">
                            <p className="text-xs text-slate-500">
                              {parsedCustomTitles.length === 0 ? 'One title per line, or separate by comma' : <><span className="text-violet-400 font-black">{parsedCustomTitles.length}</span> titles detected</>}
                            </p>
                            <MagneticBtn onClick={useCustomTitles} disabled={parsedCustomTitles.length === 0}
                              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white btn-glow disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                              <FileText className="h-4 w-4" />Use These Titles
                            </MagneticBtn>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Prompt settings */}
                <div className={card}>
                  <button onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex w-full items-center justify-between px-7 py-5 text-left rounded-2xl transition hover:bg-white/[0.02]">
                    <div className="flex items-center gap-2.5">
                      <Settings2 className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-black text-slate-200">Prompt Settings</span>
                      {(isCustomTitlePrompt || isCustomArticlePrompt) && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-400 ring-1 ring-amber-500/25">Custom</span>
                      )}
                    </div>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`}>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </button>
                  {showAdvanced && (
                    <div className="border-t border-white/[0.06] px-7 pb-7 pt-6 space-y-6">
                      <p className="text-xs text-slate-500">Available variables:{' '}
                        {['{topic}','{count}','{title}','{minWordCount}','{maxWordCount}','{language}','{anchors}'].map(p => (
                          <code key={p} className="mx-0.5 rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-violet-300">{p}</code>
                        ))}
                      </p>
                      {([
                        { id:'title',   label:'Title Prompt',   value:titlePrompt,   isCustom:isCustomTitlePrompt,   onChange:setTitlePrompt,   onReset:()=>setTitlePrompt(DEFAULT_TITLE_PROMPT),   rows:5 },
                        { id:'article', label:'Article Prompt', value:articlePrompt, isCustom:isCustomArticlePrompt, onChange:setArticlePrompt, onReset:()=>setArticlePrompt(DEFAULT_ARTICLE_PROMPT), rows:14 },
                      ]).map(p => (
                        <div key={p.id}>
                          <div className="flex items-center justify-between mb-2">
                            <label className={labelCls}>{p.label}</label>
                            {p.isCustom && <button onClick={p.onReset} className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition">Reset</button>}
                          </div>
                          <textarea value={p.value} onChange={e => p.onChange(e.target.value)} rows={p.rows}
                            className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 font-mono text-[11px] leading-relaxed text-slate-300 outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-500/20 resize-none transition" />
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-white/[0.06] pt-5">
                        <p className="text-xs text-slate-500">Shared prompts apply for all sessions.</p>
                        <MagneticBtn onClick={savePromptsToDb} disabled={savingPrompts}
                          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white btn-glow disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                          {savingPrompts ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Check className="h-3.5 w-3.5" />Save Prompts</>}
                        </MagneticBtn>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ══ Step 2: Titles ══ */}
            {step === 'titles' && (
              <section className="step-panel space-y-4">
                <div className={card}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-7 py-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black text-violet-300 ring-1 ring-violet-500/30"
                        style={{ background: 'rgba(124,58,237,0.15)', boxShadow: '0 0 14px rgba(124,58,237,0.2)' }}>02</span>
                      <div>
                        <h2 className="text-sm font-black text-white">Review titles</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Edit or remove, then generate.</p>
                      </div>
                    </div>
                    <button onClick={() => { setStep('input'); setTitles([]); }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/[0.08] hover:text-white transition">
                      ← Back
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 border-b border-white/[0.05] bg-white/[0.01] px-7 py-3">
                    {[
                      `${minWordCount}–${maxWordCount} words`,
                      language,
                      validAnchors.length > 0 ? `${validAnchors.length} anchors` : null,
                      isCustomArticlePrompt ? 'Custom prompt' : null,
                      '3 parallel',
                    ].filter(Boolean).map(label => (
                      <span key={label} className="inline-flex items-center rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                    ))}
                  </div>
                  <ul className="divide-y divide-white/[0.05] px-4 py-2">
                    {titles.map((title, idx) => (
                      <li key={idx} className="title-item group flex items-center gap-3 rounded-xl px-3 py-3.5 transition hover:bg-white/[0.03]">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-white/[0.06] text-[10px] font-black text-slate-500">{idx + 1}</span>
                        {editingIndex === idx ? (
                          <input ref={editInputRef} type="text" value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if(e.key==='Enter') commitEdit(); if(e.key==='Escape'){setEditingIndex(null);setEditValue('');} }}
                            className="min-w-0 flex-1 rounded-xl border border-violet-500/50 bg-violet-500/[0.08] px-3 py-1.5 text-sm text-white outline-none ring-2 ring-violet-500/20" />
                        ) : (
                          <span className="min-w-0 flex-1 text-sm text-slate-200">{title}</span>
                        )}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          {editingIndex !== idx && (
                            <button onClick={() => startEditing(idx, title)} className="rounded-lg p-1.5 text-slate-600 hover:bg-white/[0.08] hover:text-slate-300 transition"><Pencil className="h-3.5 w-3.5" /></button>
                          )}
                          <button onClick={() => removeTitle(idx)} className="rounded-lg p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-400 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {titles.length === 0 && <p className="px-7 pb-5 text-sm text-slate-500">All titles removed. Go back to regenerate.</p>}
                </div>
                <MagneticBtn onClick={generateArticles} disabled={titles.length === 0}
                  className="group relative overflow-hidden inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-black text-white btn-glow disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <Wand2 className="h-4 w-4" />
                  Generate {titles.length > 0 ? `${titles.length} ` : ''}Article{titles.length !== 1 ? 's' : ''}
                  <ArrowRight className="h-4 w-4" />
                </MagneticBtn>
              </section>
            )}

            {/* ══ Step 3 & 4: Generating / Done ══ */}
            {(step === 'generating' || step === 'done') && (
              <section className="step-panel space-y-5">

                {/* Progress card */}
                <div className={card} style={{ borderColor: step === 'done' ? 'rgba(74,222,128,0.2)' : undefined }}>
                  <div className="h-px" style={{ background: step === 'done' ? 'linear-gradient(90deg,transparent,rgba(74,222,128,0.6),transparent)' : 'linear-gradient(90deg,transparent,rgba(139,92,246,0.6),transparent)' }} />

                  <div className="px-7 py-6">
                    {step === 'done' ? (
                      <div className="flex flex-wrap items-start gap-6">
                        <div className="batch-done-icon flex h-16 w-16 flex-none items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10"
                          style={{ boxShadow: '0 0 30px rgba(74,222,128,0.2)' }}>
                          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-1">Complete</p>
                          <h3 className="text-2xl font-black text-white mb-4">Batch finished</h3>
                          <div className="flex flex-wrap gap-6">
                            {[
                              { label: 'Articles Done',  val: progressCounts.done,            color: 'text-white',     cls: 'batch-done-stat' },
                              { label: 'Total Time',     val: batchElapsed ? formatDuration(batchElapsed) : '—', color: 'text-violet-300', cls: 'batch-done-stat' },
                              progressCounts.failed > 0 ? { label: 'Failed', val: progressCounts.failed, color: 'text-red-400', cls: 'batch-done-stat' } : null,
                            ].filter(Boolean).map(s => (
                              <div key={s!.label} className={s!.cls}>
                                <p className={`text-2xl font-black ${s!.color}`}>{s!.val}</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mt-0.5">{s!.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <button onClick={resetAll}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/[0.08] hover:text-white transition">
                          <RotateCw className="h-4 w-4" />New Batch
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-6">
                        <ProgressRing done={progressCounts.done + progressCounts.failed} total={articles.length} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-5">
                            <div className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
                            </div>
                            <p className="text-sm font-black text-white">Generating articles…</p>
                            {batchElapsed !== null && (
                              <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
                                <Timer className="h-3 w-3 text-violet-500" />{formatDuration(batchElapsed)}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                              { label:'Done',    val: progressCounts.done,    color:'text-emerald-400', dot:'bg-emerald-400', glow:'rgba(74,222,128,0.7)',   cls:'done-count', pulse: false },
                              { label:'Active',  val: progressCounts.active,  color:'text-amber-400',   dot:'bg-amber-400',   glow:'rgba(251,191,36,0.7)',   cls:'',           pulse: true  },
                              { label:'Pending', val: progressCounts.pending, color:'text-slate-400',   dot:'bg-slate-500',   glow:'',                       cls:'',           pulse: false },
                            ].map(s => (
                              <div key={s.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                                <p className={`text-2xl font-black ${s.color} ${s.cls}`} style={s.glow ? { textShadow: `0 0 12px ${s.glow}` } : undefined}>{s.val}</p>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`} />
                                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">{s.label}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Shimmer progress bar */}
                  <div className="relative h-1.5 bg-white/[0.04] overflow-hidden shimmer-bar">
                    <div className="h-full transition-all duration-700 ease-out"
                      style={{
                        width: `${articles.length ? ((progressCounts.done + progressCounts.failed) / articles.length) * 100 : 0}%`,
                        background: step === 'done' ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#7c3aed,#8b5cf6,#22d3ee)',
                        boxShadow: step === 'done' ? '0 0 16px rgba(52,211,153,0.8)' : '0 0 16px rgba(139,92,246,0.9)',
                      }} />
                  </div>
                </div>

                {/* Article list */}
                <div className={card}>
                  <div className="border-b border-white/[0.06] px-6 py-3 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Articles</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-700">{articles.length} total</span>
                  </div>
                  <ul className="divide-y divide-white/[0.05]">
                    {articles.map((article, idx) => (
                      <ArticleRow key={idx} index={idx} article={article}
                        onRetry={() => retryArticle(idx)} isProcessing={step === 'generating'} liveTick={liveTick} />
                    ))}
                  </ul>
                </div>

                {doneArticles.length > 0 && (
                  <BulkLinksCard pairs={doneArticles.map(a => ({ name: a.title, url: a.googleDocUrl! }))} />
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* ════════════════════════════════
   SUB-COMPONENTS
════════════════════════════════ */

function NavTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-black transition-all ${active ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
      {active && <span className="absolute inset-0 rounded-lg" style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.85),rgba(79,70,229,0.85))', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }} />}
      <span className="relative flex items-center gap-1.5">{icon}{label}</span>
    </button>
  );
}

function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white btn-glow disabled:opacity-40"
      style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
      {children}
    </button>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps = [
    { key: 'input',      label: 'Configure', num: 1 },
    { key: 'titles',     label: 'Titles',    num: 2 },
    { key: 'generating', label: 'Generate',  num: 3 },
    { key: 'done',       label: 'Complete',  num: 4 },
  ] as { key: Step; label: string; num: number }[];
  const ci = steps.findIndex(s => s.key === step);
  return (
    <div className="flex items-center">
      {steps.map((s, i) => {
        const isDone = i < ci, isActive = i === ci;
        return (
          <div key={s.key} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black transition-all duration-500 ${
                isDone   ? 'text-white' :
                isActive ? 'text-white ring-4 ring-violet-500/25' :
                           'border border-white/[0.1] text-slate-600 bg-white/[0.03]'
              }`} style={isDone || isActive ? { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: isDone ? '0 0 14px rgba(124,58,237,0.45)' : '0 0 22px rgba(124,58,237,0.7)' } : undefined}>
                {isDone ? <Check className="h-3.5 w-3.5" /> : s.num}
              </div>
              <span className={`hidden sm:block text-xs font-black transition-all duration-500 ${isActive ? 'text-violet-300' : isDone ? 'text-slate-500' : 'text-slate-700'}`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="mx-3 h-px w-8 sm:w-14 flex-none transition-all duration-700 rounded-full"
                style={{ background: i < ci ? 'linear-gradient(90deg,#7c3aed,#4f46e5)' : 'rgba(255,255,255,0.06)', boxShadow: i < ci ? '0 0 8px rgba(124,58,237,0.5)' : undefined }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProgressRing({ done, total, size = 128, stroke = 8 }: { done: number; total: number; size?: number; stroke?: number }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = total > 0 ? done / total : 0;
  const offset = circ * (1 - pct);
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute -rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#rGrad)" strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="ring-glow"
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
        <defs>
          <linearGradient id="rGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-white leading-none">{Math.round(pct * 100)}<span className="text-sm text-slate-500">%</span></span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mt-0.5">{done}/{total}</span>
      </div>
    </div>
  );
}

function MagneticBtn({ children, className, onClick, disabled, style }: {
  children: React.ReactNode; className?: string; onClick?: () => void; disabled?: boolean; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const onMove = (e: React.MouseEvent) => {
    if (!ref.current || disabled) return;
    const r = ref.current.getBoundingClientRect();
    gsap.to(ref.current, { x: (e.clientX - r.left - r.width/2)*0.25, y: (e.clientY - r.top - r.height/2)*0.25, duration: 0.3, ease: 'power2.out' });
  };
  const onLeave = () => { if (ref.current) gsap.to(ref.current, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1,0.4)' }); };
  useEffect(() => { if (disabled && ref.current) gsap.to(ref.current, { x: 0, y: 0, duration: 0.3 }); }, [disabled]);
  return (
    <button ref={ref} className={className} style={style} onClick={onClick} disabled={disabled} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </button>
  );
}

function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const containerRef        = useRef<HTMLDivElement>(null);
  const searchRef           = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => { const q = search.toLowerCase().trim(); return q ? LANGUAGES.filter(l => l.toLowerCase().includes(q)) : [...LANGUAGES]; }, [search]);
  useEffect(() => { if (open) { setSearch(''); setTimeout(() => searchRef.current?.focus(), 0); } }, [open]);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);
  return (
    <div ref={containerRef} className="relative mt-1.5">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-52 items-center justify-between rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition hover:border-white/[0.2]">
        <span className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-500" />{value}</span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-white/[0.1] shadow-2xl shadow-black/80" style={{ background: '#0b0b18' }}>
          <div className="border-b border-white/[0.06] p-2.5">
            <div className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2">
              <Search className="h-3.5 w-3.5 text-slate-500" />
              <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search languages…"
                className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none" />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-4 py-3 text-center text-xs text-slate-500">No results</li>}
            {filtered.map(lang => (
              <li key={lang}>
                <button type="button" onClick={() => { onChange(lang); setOpen(false); }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-violet-500/10 ${value === lang ? 'bg-violet-500/10 font-bold text-violet-300' : 'text-slate-300'}`}>
                  {lang}{value === lang && <Check className="h-3.5 w-3.5 text-violet-400" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const STATUS_CFG: Record<ArticleStatus, { label: string; color: string; dot: string; glow?: string }> = {
  pending:    { label: 'Pending',                 color: 'text-slate-500',   dot: 'bg-slate-600'   },
  generating: { label: 'Generating content',       color: 'text-amber-400',   dot: 'bg-amber-400',   glow: 'rgba(251,191,36,0.7)' },
  uploading:  { label: 'Uploading to Google Docs', color: 'text-cyan-400',    dot: 'bg-cyan-400',    glow: 'rgba(34,211,238,0.7)' },
  done:       { label: 'Done',                     color: 'text-emerald-400', dot: 'bg-emerald-400', glow: 'rgba(74,222,128,0.7)' },
  failed:     { label: 'Failed',                   color: 'text-red-400',     dot: 'bg-red-400'     },
};

function ArticleRow({ index, article, onRetry, isProcessing, liveTick }: {
  index: number; article: ArticleEntry; onRetry: () => void; isProcessing: boolean; liveTick: number;
}) {
  const cfg      = STATUS_CFG[article.status];
  const isActive = article.status === 'generating' || article.status === 'uploading';
  const liveElapsed       = isActive && article.startTime ? Date.now() - article.startTime : null;
  void liveTick;
  const completedDuration = article.endTime && article.startTime ? article.endTime - article.startTime : null;

  return (
    <li className={`article-row group flex items-start gap-4 px-6 py-4 transition-all duration-200 ${
      isActive ? 'border-l-2 border-violet-500 bg-violet-500/[0.03]' : 'border-l-2 border-transparent hover:bg-white/[0.02]'
    }`} style={isActive ? { boxShadow: 'inset 3px 0 12px rgba(139,92,246,0.1)' } : undefined}>
      <div className="flex flex-none flex-col items-center gap-2 pt-0.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] font-black text-slate-600">{index + 1}</span>
        {isActive ? (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
          </span>
        ) : (
          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} style={cfg.glow ? { boxShadow: `0 0 6px ${cfg.glow}` } : undefined} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100 leading-snug">{article.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`text-xs font-semibold ${cfg.color}`} style={cfg.glow ? { textShadow: `0 0 8px ${cfg.glow}` } : undefined}>
            {article.status === 'failed' && article.error ? article.error : cfg.label}
            {isActive && (
              <span className="inline-flex items-end gap-[3px] ml-1.5">
                <span className="dot-1 h-1 w-1 rounded-full bg-current inline-block" />
                <span className="dot-2 h-1 w-1 rounded-full bg-current inline-block" />
                <span className="dot-3 h-1 w-1 rounded-full bg-current inline-block" />
              </span>
            )}
          </span>
          {liveElapsed !== null && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
              <Timer className="h-3 w-3 text-violet-500" />{formatDuration(liveElapsed)}
            </span>
          )}
          {article.wordCount && article.wordCount > 0 && (
            <span className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[10px] font-black text-emerald-400">
              {article.wordCount.toLocaleString()} words
            </span>
          )}
          {completedDuration !== null && article.status !== 'generating' && article.status !== 'uploading' && (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-black text-slate-400">
              <Timer className="h-2.5 w-2.5" />{formatDuration(completedDuration)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-none pt-0.5">
        {article.status === 'done' && article.googleDocUrl && (
          <>
            <CopyBtn text={article.googleDocUrl} label="Copy" />
            <a href={article.googleDocUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-black text-violet-300 hover:bg-violet-500/20 hover:text-white transition">
              <ExternalLink className="h-3 w-3" />Open
            </a>
          </>
        )}
        {article.status === 'failed' && !isProcessing && (
          <button onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-xs font-black text-slate-300 hover:bg-white/[0.08] hover:text-white transition">
            <RotateCw className="h-3 w-3" />Retry
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
      className={className || 'inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/[0.08] hover:text-white transition'}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

type CopyFormat = 'urls' | 'name-url' | 'numbered';
function BulkLinksCard({ pairs }: { pairs: { name: string; url: string }[] }) {
  const [format, setFormat] = useState<CopyFormat>('urls');
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    if (format === 'urls')     return pairs.map(p => p.url).join('\n');
    if (format === 'name-url') return pairs.map(p => `${p.name}\t${p.url}`).join('\n');
    return pairs.map((p, i) => `${i + 1}. ${p.name} — ${p.url}`).join('\n');
  }, [pairs, format]);
  const copy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <section className="rounded-2xl border border-violet-500/20 bg-[#0b0b18] overflow-hidden" style={{ boxShadow: '0 0 40px rgba(124,58,237,0.08)' }}>
      <div className="h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/25" style={{ boxShadow: '0 0 16px rgba(124,58,237,0.2)' }}>
              <Link2 className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-black text-white">{pairs.length} Google Docs ready</p>
              <p className="text-xs text-slate-500">Choose format and copy all links at once.</p>
            </div>
          </div>
          <button onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black text-white btn-glow"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy all'}
          </button>
        </div>
        <div className="flex gap-2 mb-4">
          {([
            { key: 'urls', label: 'URLs only', hint: 'One per line' },
            { key: 'name-url', label: 'Name + URL', hint: 'Paste into Sheets' },
            { key: 'numbered', label: 'Numbered', hint: '1. Name — URL' },
          ] as { key: CopyFormat; label: string; hint: string }[]).map(o => (
            <button key={o.key} onClick={() => setFormat(o.key)}
              className={`flex-1 rounded-xl border p-3 text-left text-xs transition ${format === o.key ? 'border-violet-500/35 bg-violet-500/[0.09]' : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'}`}>
              <div className={`font-black ${format === o.key ? 'text-violet-300' : 'text-slate-400'}`}>{o.label}</div>
              <div className="text-slate-600 mt-0.5">{o.hint}</div>
            </button>
          ))}
        </div>
        <pre className="max-h-36 overflow-auto whitespace-pre rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-[11px] leading-relaxed text-slate-400 mb-4">
          {text || '(empty)'}
        </pre>
        <ol className="space-y-2">
          {pairs.map((p, i) => (
            <li key={p.url} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-lg bg-violet-500/15 text-[9px] font-black text-violet-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-300">{p.name}</span>
              <a href={p.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-black text-violet-400 hover:text-violet-200 transition">
                <ExternalLink className="h-3 w-3" />Open
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── Custom Cursor ──────────────────────────────────────────────── */
function CustomCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.matchMedia('(pointer: fine)').matches) return;

    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = window.innerWidth  + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const styleEl = document.createElement('style');
    styleEl.textContent = '*, *::before, *::after { cursor: none !important; }';
    document.head.appendChild(styleEl);

    type HoverState = 'default' | 'button' | 'text';
    const state = {
      x: -300, y: -300,
      trail: [] as { x: number; y: number }[],
      hover: 'default' as HoverState,
      orbitAngle: 0,
      bursts: [] as { x: number; y: number; t: number }[],
      visible: false,
    };

    const onMove = (e: MouseEvent) => {
      state.x = e.clientX;
      state.y = e.clientY;
      state.visible = true;
      state.trail.push({ x: state.x, y: state.y });
      if (state.trail.length > 32) state.trail.shift();
    };
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select'))           state.hover = 'text';
      else if (t.closest('a,button,[role="button"],label')) state.hover = 'button';
      else                                               state.hover = 'default';
    };
    const onDown  = (e: MouseEvent) => state.bursts.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    const onLeave = () => { state.visible = false; };
    const onEnter = () => { state.visible = true;  };

    document.addEventListener('mousemove',  onMove);
    document.addEventListener('mouseover',  onOver);
    document.addEventListener('mousedown',  onDown);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    let raf: number;

    const draw = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (!state.visible) { raf = requestAnimationFrame(draw); return; }

      const { x, y, trail, hover, bursts } = state;

      /* ── Ink trail ── */
      if (trail.length > 1) {
        for (let i = 1; i < trail.length; i++) {
          const t = i / trail.length;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.strokeStyle = `rgba(139,92,246,${t * t * 0.5})`;
          ctx.lineWidth   = t * 2.5;
          ctx.lineCap     = 'round';
          ctx.stroke();
        }
      }

      /* ── Button: orbiting ring ── */
      if (hover === 'button') {
        state.orbitAngle += 0.055;
        const R = 21;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(139,92,246,0.4)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        for (const [offset, r, a] of [[0, 3.5, 1], [Math.PI, 2.5, 0.55]] as [number,number,number][]) {
          const ox = x + Math.cos(state.orbitAngle + offset) * R;
          const oy = y + Math.sin(state.orbitAngle + offset) * R;
          ctx.save();
          ctx.shadowColor = 'rgba(167,139,250,0.9)';
          ctx.shadowBlur  = 6;
          ctx.beginPath();
          ctx.arc(ox, oy, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(167,139,250,${a})`;
          ctx.fill();
          ctx.restore();
        }
      }
      /* ── Text: I-beam ── */
      else if (hover === 'text') {
        const H = 15, CAP = 6;
        ctx.strokeStyle = 'rgba(167,139,250,0.9)';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y - H);   ctx.lineTo(x, y + H);   ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - CAP, y - H); ctx.lineTo(x + CAP, y - H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - CAP, y + H); ctx.lineTo(x + CAP, y + H); ctx.stroke();
      }
      /* ── Default: glowing core dot ── */
      else {
        ctx.save();
        ctx.shadowColor = 'rgba(139,92,246,0.85)';
        ctx.shadowBlur  = 16;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }

      /* ── Click burst: radial spokes ── */
      const now = Date.now();
      state.bursts = bursts.filter(b => {
        const p = Math.min((now - b.t) / 480, 1);
        if (p >= 1) return false;
        const ease = 1 - Math.pow(1 - p, 3);
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(b.x + Math.cos(angle) * (6 + ease * 4),  b.y + Math.sin(angle) * (6 + ease * 4));
          ctx.lineTo(b.x + Math.cos(angle) * (10 + ease * 20), b.y + Math.sin(angle) * (10 + ease * 20));
          ctx.strokeStyle = `rgba(167,139,250,${(1 - p) * 0.9})`;
          ctx.lineWidth   = 1.5 * (1 - p * 0.6);
          ctx.lineCap     = 'round';
          ctx.stroke();
        }
        return true;
      });

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      styleEl.remove();
      window.removeEventListener('resize', resize);
      document.removeEventListener('mousemove',  onMove);
      document.removeEventListener('mouseover',  onOver);
      document.removeEventListener('mousedown',  onDown);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[9999]" />;
}

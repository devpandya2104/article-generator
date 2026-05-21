import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Sparkles, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Copy,
  ExternalLink, Trash2, Pencil, Link2, Wand2, FileText, RotateCw,
  Plus, ChevronDown, ChevronUp, Settings2, Search, Globe, Check,
  Clock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Tab = 'generator' | 'history';
type Step = 'input' | 'titles' | 'generating' | 'done';
type ArticleStatus = 'pending' | 'generating' | 'uploading' | 'done' | 'failed';
type TitleSource = 'ai' | 'custom';

interface Anchor {
  text: string;
  url: string;
}

interface ArticleEntry {
  title: string;
  status: ArticleStatus;
  bodyHtml?: string;
  googleDocId?: string;
  googleDocUrl?: string;
  error?: string;
  dbId?: string;
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
- No tables
- No bullet points or lists
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
- Do NOT submit the article if it falls outside this range

QUALITY CHECKLIST (apply before finishing):
- Is the word count strictly between {minWordCount} and {maxWordCount}?
- Does the intro open with a question that pulls the reader in?
- Does every section add real value, not just filler?
- Does it read like a human wrote it, not an AI?
- Are all headings properly capitalized?
- Is the first HTML element a <p> tag?
- Are all banned words avoided?
- Is the tone consistent throughout?`;

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

export default function ArticleGenerator() {
  const [activeTab, setActiveTab] = useState<Tab>('generator');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [minWordCount, setMinWordCount] = useState(1000);
  const [maxWordCount, setMaxWordCount] = useState(1300);
  const [language, setLanguage] = useState('English');
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [titlePrompt, setTitlePrompt] = useState(DEFAULT_TITLE_PROMPT);
  const [articlePrompt, setArticlePrompt] = useState(DEFAULT_ARTICLE_PROMPT);
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [savingPrompts, setSavingPrompts] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [titleSource, setTitleSource] = useState<TitleSource>('ai');
  const [customTitlesText, setCustomTitlesText] = useState('');
  const [titles, setTitles] = useState<string[]>([]);
  const [articles, setArticles] = useState<ArticleEntry[]>([]);
  const [step, setStep] = useState<Step>('input');
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const abortRef = useRef(false);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const [historyBatches, setHistoryBatches] = useState<HistoryBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('shared_prompts')
        .select('id, content')
        .in('id', ['title_prompt', 'article_prompt']);
      if (data) {
        for (const row of data) {
          if (row.id === 'title_prompt' && row.content) setTitlePrompt(row.content);
          if (row.id === 'article_prompt' && row.content) setArticlePrompt(row.content);
        }
      }
      setPromptsLoaded(true);
    })();
  }, []);

  const savePromptsToDb = useCallback(async () => {
    setSavingPrompts(true);
    setError(null);
    try {
      const { error: e1 } = await supabase.from('shared_prompts').update({
        content: titlePrompt,
        updated_at: new Date().toISOString(),
      }).eq('id', 'title_prompt');

      if (e1) throw new Error(`Title prompt save failed: ${e1.message}`);

      const { error: e2 } = await supabase.from('shared_prompts').update({
        content: articlePrompt,
        updated_at: new Date().toISOString(),
      }).eq('id', 'article_prompt');

      if (e2) throw new Error(`Article prompt save failed: ${e2.message}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompts');
    } finally {
      setSavingPrompts(false);
    }
  }, [titlePrompt, articlePrompt]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        await supabase.auth.signInAnonymously();
      }
    })();
  }, []);

  useEffect(() => {
    if (editingIndex !== null) editInputRef.current?.focus();
  }, [editingIndex]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data: batches } = await supabase
        .from('article_batches')
        .select('id, topic, created_at, requested_count, language')
        .order('created_at', { ascending: false });
      if (!batches || batches.length === 0) {
        setHistoryBatches([]);
        return;
      }
      const batchIds = batches.map((b) => b.id);
      const { data: arts } = await supabase
        .from('articles')
        .select('id, title, google_doc_url, status, batch_id')
        .in('batch_id', batchIds);
      const artsByBatch: Record<string, HistoryBatchArticle[]> = {};
      for (const a of (arts || [])) {
        (artsByBatch[a.batch_id] ||= []).push({
          id: a.id,
          title: a.title,
          google_doc_url: a.google_doc_url,
          status: a.status,
        });
      }
      setHistoryBatches(batches.map((b) => ({
        id: b.id,
        topic: b.topic,
        created_at: b.created_at,
        requested_count: b.requested_count,
        language: b.language,
        articles: artsByBatch[b.id] || [],
      })));
    } catch {
      // best-effort
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  const parsedCustomTitles = useMemo(() => {
    return customTitlesText
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [customTitlesText]);

  const useCustomTitles = useCallback(() => {
    if (!parsedCustomTitles.length) return;
    setTitles(parsedCustomTitles);
    setStep('titles');
  }, [parsedCustomTitles]);

  const updateArticle = useCallback((idx: number, patch: Partial<ArticleEntry>) => {
    setArticles((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }, []);

  const validAnchors = useMemo(
    () => anchors.filter((a) => a.text.trim() && a.url.trim()),
    [anchors]
  );

  const addAnchor = useCallback(() => {
    setAnchors((prev) => [...prev, { text: '', url: '' }]);
  }, []);

  const updateAnchor = useCallback((idx: number, field: keyof Anchor, value: string) => {
    setAnchors((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  }, []);

  const removeAnchor = useCallback((idx: number) => {
    setAnchors((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const isCustomTitlePrompt = titlePrompt !== DEFAULT_TITLE_PROMPT;
  const isCustomArticlePrompt = articlePrompt !== DEFAULT_ARTICLE_PROMPT;

  const generateTitles = useCallback(async () => {
    if (!topic.trim()) return;
    setError(null);
    setLoadingTitles(true);
    try {
      const payload: Record<string, unknown> = { topic: topic.trim(), count, titlePrompt };
      const data = await edgeFetch<{ titles: string[] }>('generate-titles', payload);
      setTitles(data.titles);
      setStep('titles');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate titles');
    } finally {
      setLoadingTitles(false);
    }
  }, [topic, count, titlePrompt, isCustomTitlePrompt]);

  const removeTitle = useCallback((idx: number) => {
    setTitles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const startEditing = useCallback((idx: number, title: string) => {
    setEditingIndex(idx);
    setEditValue(title);
  }, []);

  const commitEdit = useCallback(() => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (trimmed) setTitles((prev) => prev.map((t, i) => (i === editingIndex ? trimmed : t)));
    setEditingIndex(null);
    setEditValue('');
  }, [editingIndex, editValue]);

  const generateArticles = useCallback(async () => {
    if (!titles.length) return;
    setError(null);
    abortRef.current = false;

    const initial: ArticleEntry[] = titles.map((title) => ({ title, status: 'pending' as ArticleStatus }));
    setArticles(initial);
    setStep('generating');

    let currentBatchId = batchId;
    try {
      if (!currentBatchId) {
        const { data: batch } = await supabase
          .from('article_batches')
          .insert({
            topic: topic.trim(),
            requested_count: titles.length,
            status: 'processing',
            min_word_count: minWordCount,
            max_word_count: maxWordCount,
            language,
            anchors: validAnchors,
            title_prompt: isCustomTitlePrompt ? titlePrompt : '',
            article_prompt: isCustomArticlePrompt ? articlePrompt : '',
          })
          .select('id').maybeSingle();
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
    } catch {
      // DB tracking is best-effort
    }

    for (let i = 0; i < titles.length; i++) {
      if (abortRef.current) break;
      const title = titles[i];
      updateArticle(i, { status: 'generating' });

      try {
        const artPayload: Record<string, unknown> = {
          title,
          topic: topic.trim(),
          minWordCount,
          maxWordCount,
          language,
          anchors: validAnchors,
        };
        artPayload.articlePrompt = articlePrompt;

        const artData = await edgeFetch<{ html: string }>('generate-article', artPayload);
        if (abortRef.current) break;

        updateArticle(i, { status: 'uploading', bodyHtml: artData.html });
        const docData = await edgeFetch<{ googleDocId: string; googleDocUrl: string; shareWarning?: string; pagelessWarning?: string }>(
          'create-article-doc', { title, bodyHtml: artData.html, topic: topic.trim() },
        );
        if (docData.pagelessWarning) console.warn('Pageless:', docData.pagelessWarning);
        updateArticle(i, { status: 'done', googleDocId: docData.googleDocId, googleDocUrl: docData.googleDocUrl });

        setArticles((prev) => {
          const art = prev[i];
          if (art.dbId) {
            supabase.from('articles').update({
              body_html: artData.html,
              google_doc_id: docData.googleDocId, google_doc_url: docData.googleDocUrl,
              status: 'done', updated_at: new Date().toISOString(),
            }).eq('id', art.dbId).then();
          }
          return prev;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        updateArticle(i, { status: 'failed', error: message });
        setArticles((prev) => {
          const art = prev[i];
          if (art.dbId) {
            supabase.from('articles').update({
              status: 'failed', error_message: message, updated_at: new Date().toISOString(),
            }).eq('id', art.dbId).then();
          }
          return prev;
        });
      }
    }

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
    updateArticle(idx, { status: 'generating', error: undefined });
    try {
      const artPayload: Record<string, unknown> = {
        title: article.title,
        topic: topic.trim(),
        minWordCount,
        maxWordCount,
        language,
        anchors: validAnchors,
      };
      if (isCustomArticlePrompt) artPayload.articlePrompt = articlePrompt;

      const artData = await edgeFetch<{ html: string }>('generate-article', artPayload);
      updateArticle(idx, { status: 'uploading', bodyHtml: artData.html });
      const docData = await edgeFetch<{ googleDocId: string; googleDocUrl: string }>(
        'create-article-doc', { title: article.title, bodyHtml: artData.html, topic: topic.trim() },
      );
      updateArticle(idx, { status: 'done', googleDocId: docData.googleDocId, googleDocUrl: docData.googleDocUrl });
      if (article.dbId) {
        await supabase.from('articles').update({
          body_html: artData.html,
          google_doc_id: docData.googleDocId, google_doc_url: docData.googleDocUrl,
          status: 'done', error_message: null, updated_at: new Date().toISOString(),
        }).eq('id', article.dbId);
      }
    } catch (err) {
      updateArticle(idx, { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [articles, topic, updateArticle, minWordCount, maxWordCount, language, validAnchors, articlePrompt, isCustomArticlePrompt]);

  const doneArticles = useMemo(() => articles.filter((a) => a.status === 'done' && a.googleDocUrl), [articles]);

  const progressCounts = useMemo(() => ({
    pending: articles.filter((a) => a.status === 'pending').length,
    active: articles.filter((a) => a.status === 'generating' || a.status === 'uploading').length,
    done: articles.filter((a) => a.status === 'done').length,
    failed: articles.filter((a) => a.status === 'failed').length,
  }), [articles]);

  const resetAll = useCallback(() => {
    setStep('input'); setTitles([]); setArticles([]); setBatchId(null); setError(null);
    abortRef.current = true;
  }, []);

  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const toggleBatch = useCallback((id: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
          <a href="#/" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Converter
          </a>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Wand2 className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Article Generator</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl px-6">
          <button
            onClick={() => setActiveTab('generator')}
            className={`relative px-4 py-3 text-sm font-medium transition ${
              activeTab === 'generator'
                ? 'text-emerald-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5"><Wand2 className="h-4 w-4" /> Generator</span>
            {activeTab === 'generator' && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-600 rounded-full" />}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`relative px-4 py-3 text-sm font-medium transition ${
              activeTab === 'history'
                ? 'text-emerald-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> History</span>
            {activeTab === 'history' && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-600 rounded-full" />}
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-10">
        {/* ========== HISTORY TAB ========== */}
        {activeTab === 'history' && (
          <div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Article History</h1>
              <p className="mt-1 text-sm text-slate-500">All generated batches and their articles.</p>
            </div>

            {historyLoading ? (
              <div className="mt-12 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading history...
              </div>
            ) : historyBatches.length === 0 ? (
              <div className="mt-12 text-center">
                <Clock className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">No batches generated yet.</p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {historyBatches.map((batch) => {
                  const isOpen = expandedBatches.has(batch.id);
                  const doneCount = batch.articles.filter((a) => a.status === 'done').length;
                  return (
                    <div key={batch.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <button
                        onClick={() => toggleBatch(batch.id)}
                        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
                      >
                        <FileText className="h-5 w-5 text-emerald-600 flex-none" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">{batch.topic}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {new Date(batch.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {' -- '}{batch.language}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-none">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            {doneCount}/{batch.requested_count} articles
                          </span>
                          {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-100">
                          {batch.articles.length === 0 ? (
                            <p className="px-5 py-4 text-sm text-slate-400">No articles in this batch.</p>
                          ) : (
                            <>
                            {batch.articles.some((a) => a.google_doc_url) && (
                              <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
                                <CopyBtn
                                  text={batch.articles
                                    .filter((a) => a.google_doc_url)
                                    .map((a) => a.google_doc_url)
                                    .join('\n')}
                                  label="Copy all URLs"
                                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
                                />
                              </div>
                            )}
                            <ul className="divide-y divide-slate-100">
                              {batch.articles.map((article) => (
                                <li key={article.id} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-700">{article.title}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-none">
                                    {article.google_doc_url ? (
                                      <>
                                        <CopyBtn text={article.google_doc_url} label="Copy link" />
                                        <a href={article.google_doc_url} target="_blank" rel="noreferrer"
                                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition">
                                          <ExternalLink className="h-3.5 w-3.5" /> Open
                                        </a>
                                      </>
                                    ) : (
                                      <span className="text-xs text-slate-400">
                                        {article.status === 'failed' ? 'Failed' : 'Pending'}
                                      </span>
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

        {/* ========== GENERATOR TAB ========== */}
        {activeTab === 'generator' && (
          <>
            <div className="pt-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <Sparkles className="h-3 w-3" /> AI-powered bulk articles
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Generate articles with AI. Get Google Doc links in bulk.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
                Enter a topic and count, or paste your own titles. We generate full SEO articles using Claude AI
                and upload each one as a formatted Google Doc.
              </p>
            </div>

            {error && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                <div>{error}</div>
              </div>
            )}

            {/* Step 1 - Input */}
            {step === 'input' && (
              <section className="mt-8 space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Wand2 className="h-5 w-5" />
                    <h2 className="text-lg font-semibold">Configure your batch</h2>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Set your article parameters, then choose how to provide titles below.
                  </p>
                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Topic</label>
                      <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                        placeholder='e.g. "Online Slot", "Digital Marketing Tips"'
                        className="mt-1.5 w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700">Min word count</label>
                        <input type="number" min={300} max={10000} step={100} value={minWordCount}
                          onChange={(e) => {
                            const v = Math.max(300, Math.min(10000, +e.target.value || 1000));
                            setMinWordCount(v);
                            if (maxWordCount < v) setMaxWordCount(v);
                          }}
                          className="mt-1.5 w-32 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">Max word count</label>
                        <input type="number" min={300} max={10000} step={100} value={maxWordCount}
                          onChange={(e) => {
                            const v = Math.max(minWordCount, Math.min(10000, +e.target.value || 1300));
                            setMaxWordCount(v);
                          }}
                          className="mt-1.5 w-32 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">Language</label>
                        <LanguageSelect value={language} onChange={setLanguage} />
                      </div>
                    </div>
                  </div>

                  {/* Anchor Links */}
                  <div className="mt-6 border-t border-slate-100 pt-6">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-emerald-600" />
                      <label className="text-sm font-medium text-slate-700">Anchor Links</label>
                      {validAnchors.length > 0 && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          {validAnchors.length}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Add anchor text and URLs to be naturally embedded in every article.
                    </p>
                    <div className="mt-3 space-y-2.5">
                      {anchors.map((anchor, idx) => (
                        <div key={idx} className="flex items-start gap-2.5">
                          <div className="flex min-w-0 flex-1 gap-2.5">
                            <div className="flex-1">
                              {idx === 0 && <label className="mb-1 block text-xs font-medium text-slate-500">Anchor text</label>}
                              <input
                                type="text"
                                value={anchor.text}
                                onChange={(e) => updateAnchor(idx, 'text', e.target.value)}
                                placeholder="e.g. best online slots"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                              />
                            </div>
                            <div className="flex-1">
                              {idx === 0 && <label className="mb-1 block text-xs font-medium text-slate-500">URL</label>}
                              <input
                                type="url"
                                value={anchor.url}
                                onChange={(e) => updateAnchor(idx, 'url', e.target.value)}
                                placeholder="https://example.com"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                              />
                            </div>
                          </div>
                          <button onClick={() => removeAnchor(idx)}
                            className={`flex-none rounded-md p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 ${idx === 0 ? 'mt-5' : ''}`}
                            title="Remove anchor">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button onClick={addAnchor}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700">
                        <Plus className="h-3.5 w-3.5" /> Add Anchor
                      </button>
                    </div>
                  </div>

                  {/* Title source toggle */}
                  <div className="mt-6 border-t border-slate-100 pt-6">
                    <label className="block text-sm font-medium text-slate-700 mb-3">How do you want to provide titles?</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTitleSource('ai')}
                        className={`flex-1 rounded-lg border px-4 py-3 text-left text-sm transition ${
                          titleSource === 'ai'
                            ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500/30'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`font-medium ${titleSource === 'ai' ? 'text-emerald-800' : 'text-slate-700'}`}>
                          <Sparkles className="mb-1 inline h-4 w-4" /> AI-generated titles
                        </div>
                        <div className={`mt-0.5 text-xs ${titleSource === 'ai' ? 'text-emerald-600' : 'text-slate-400'}`}>
                          We generate title suggestions from your topic
                        </div>
                      </button>
                      <button
                        onClick={() => setTitleSource('custom')}
                        className={`flex-1 rounded-lg border px-4 py-3 text-left text-sm transition ${
                          titleSource === 'custom'
                            ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500/30'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`font-medium ${titleSource === 'custom' ? 'text-emerald-800' : 'text-slate-700'}`}>
                          <FileText className="mb-1 inline h-4 w-4" /> Your own titles
                        </div>
                        <div className={`mt-0.5 text-xs ${titleSource === 'custom' ? 'text-emerald-600' : 'text-slate-400'}`}>
                          Paste titles separated by commas or new lines
                        </div>
                      </button>
                    </div>

                    {titleSource === 'ai' && (
                      <div className="mt-4 flex items-end gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700">Number of titles</label>
                          <input type="number" min={1} max={200} value={count}
                            onChange={(e) => setCount(Math.max(1, Math.min(200, +e.target.value || 1)))}
                            className="mt-1.5 w-32 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          />
                        </div>
                        <button onClick={generateTitles} disabled={loadingTitles || !topic.trim()}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                          {loadingTitles
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                            : <><Sparkles className="h-4 w-4" /> Generate Titles</>}
                        </button>
                      </div>
                    )}

                    {titleSource === 'custom' && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700">Paste your titles</label>
                        <textarea
                          value={customTitlesText}
                          onChange={(e) => setCustomTitlesText(e.target.value)}
                          rows={6}
                          placeholder={"How to Win at Online Slots\nBest Strategies for Digital Marketing\nTop 10 SEO Tips for Beginners"}
                          className="mt-1.5 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm leading-relaxed text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-xs text-slate-400">
                            {parsedCustomTitles.length === 0
                              ? 'Separate titles with commas or new lines'
                              : `${parsedCustomTitles.length} title${parsedCustomTitles.length !== 1 ? 's' : ''} detected`}
                          </p>
                          <button onClick={useCustomTitles} disabled={parsedCustomTitles.length === 0}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                            <FileText className="h-4 w-4" /> Use These Titles
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Advanced: Prompt Editor */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex w-full items-center justify-between px-8 py-5 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2 text-slate-700">
                      <Settings2 className="h-5 w-5" />
                      <span className="text-lg font-semibold">Prompt Settings</span>
                      {(isCustomTitlePrompt || isCustomArticlePrompt) && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                          Customized
                        </span>
                      )}
                    </div>
                    {showAdvanced
                      ? <ChevronUp className="h-5 w-5 text-slate-400" />
                      : <ChevronDown className="h-5 w-5 text-slate-400" />}
                  </button>

                  {showAdvanced && (
                    <div className="border-t border-slate-100 px-8 pb-8 pt-5 space-y-6">
                      <p className="text-sm text-slate-500">
                        Customize the AI prompts. Use placeholders like <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-emerald-700">{'{topic}'}</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-emerald-700">{'{count}'}</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-emerald-700">{'{title}'}</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-emerald-700">{'{minWordCount}'}</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-emerald-700">{'{maxWordCount}'}</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-emerald-700">{'{language}'}</code>, and <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-emerald-700">{'{anchors}'}</code>.
                      </p>

                      <div>
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-slate-700">Title Generation Prompt</label>
                          {isCustomTitlePrompt && (
                            <button onClick={() => setTitlePrompt(DEFAULT_TITLE_PROMPT)}
                              className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
                              Reset to default
                            </button>
                          )}
                        </div>
                        <textarea
                          value={titlePrompt}
                          onChange={(e) => setTitlePrompt(e.target.value)}
                          rows={4}
                          className="mt-1.5 w-full rounded-lg border border-slate-200 px-4 py-3 font-mono text-xs leading-relaxed text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                        <p className="mt-1 text-xs text-slate-400">
                          Placeholders: {'{topic}'}, {'{count}'}. Output must be a JSON array of strings.
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-slate-700">Article Generation Prompt</label>
                          {isCustomArticlePrompt && (
                            <button onClick={() => setArticlePrompt(DEFAULT_ARTICLE_PROMPT)}
                              className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
                              Reset to default
                            </button>
                          )}
                        </div>
                        <textarea
                          value={articlePrompt}
                          onChange={(e) => setArticlePrompt(e.target.value)}
                          rows={14}
                          className="mt-1.5 w-full rounded-lg border border-slate-200 px-4 py-3 font-mono text-xs leading-relaxed text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                        <p className="mt-1 text-xs text-slate-400">
                          Placeholders: {'{title}'}, {'{minWordCount}'}, {'{maxWordCount}'}, {'{language}'}, {'{anchors}'}. Output must be valid HTML.
                        </p>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-5">
                        <p className="text-xs text-slate-400">
                          Prompts are shared across all users. Changes you save will apply for everyone.
                        </p>
                        <button onClick={savePromptsToDb} disabled={savingPrompts}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500">
                          {savingPrompts
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                            : <><Check className="h-4 w-4" /> Save Prompts</>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Step 2 - Titles review */}
            {step === 'titles' && (
              <section className="mt-8 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-semibold">Titles to Generate</h3>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{titles.length}</span>
                    </div>
                    <button onClick={() => { setStep('input'); setTitles([]); }}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
                      <ArrowLeft className="h-3.5 w-3.5" /> Back
                    </button>
                  </div>

                  {/* Summary of settings */}
                  <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {minWordCount}-{maxWordCount} words
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
                      <Globe className="h-3 w-3" /> {language}
                    </span>
                    {validAnchors.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        <Link2 className="h-3 w-3" /> {validAnchors.length} anchor{validAnchors.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {isCustomArticlePrompt && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                        <Settings2 className="h-3 w-3" /> Custom prompt
                      </span>
                    )}
                  </div>

                  <p className="px-5 pt-3 text-xs text-slate-500">Edit or remove titles, then click Generate Articles.</p>
                  <ul className="divide-y divide-slate-100 px-5 pb-2">
                    {titles.map((title, idx) => (
                      <li key={idx} className="group flex items-center gap-3 py-3">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">{idx + 1}</span>
                        {editingIndex === idx ? (
                          <input ref={editInputRef} type="text" value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditingIndex(null); setEditValue(''); } }}
                            className="min-w-0 flex-1 rounded-md border border-emerald-300 px-2.5 py-1 text-sm text-slate-900 outline-none ring-2 ring-emerald-100"
                          />
                        ) : (
                          <span className="min-w-0 flex-1 text-sm text-slate-800">{title}</span>
                        )}
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {editingIndex !== idx && (
                            <button onClick={() => startEditing(idx, title)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit title">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => removeTitle(idx)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove title">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                {titles.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
                    All titles removed. Go back to generate new ones.
                  </div>
                )}
                <button onClick={generateArticles} disabled={titles.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                  <Wand2 className="h-4 w-4" /> Generate Articles
                </button>
              </section>
            )}

            {/* Step 3 & 4 - Generating / Done */}
            {(step === 'generating' || step === 'done') && (
              <section className="mt-8 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {step === 'generating'
                        ? <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                        : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                      <h3 className="text-sm font-semibold">
                        {step === 'generating' ? 'Generating articles...' : 'Batch complete'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />{progressCounts.done} done</span>
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />{progressCounts.active} active</span>
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" />{progressCounts.pending} pending</span>
                      {progressCounts.failed > 0 && (
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />{progressCounts.failed} failed</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                      style={{ width: `${articles.length ? ((progressCounts.done + progressCounts.failed) / articles.length) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {progressCounts.done + progressCounts.failed} of {articles.length} complete
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <ul className="divide-y divide-slate-100">
                    {articles.map((article, idx) => (
                      <ArticleRow key={idx} index={idx} article={article}
                        onRetry={() => retryArticle(idx)} isProcessing={step === 'generating'} />
                    ))}
                  </ul>
                </div>

                {step === 'done' && (
                  <button onClick={resetAll}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
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

/* ---- Sub-components ---- */

function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return [...LANGUAGES];
    const q = search.toLowerCase();
    return LANGUAGES.filter((l) => l.toLowerCase().includes(q));
  }, [search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-52 items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition hover:border-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
      >
        <span className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-slate-400" />
          {value}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search languages..."
                className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none"
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-center text-sm text-slate-400">No languages found</li>
            )}
            {filtered.map((lang) => (
              <li key={lang}>
                <button
                  type="button"
                  onClick={() => { onChange(lang); setOpen(false); }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition hover:bg-emerald-50 ${
                    value === lang ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-slate-700'
                  }`}
                >
                  {lang}
                  {value === lang && <Check className="h-4 w-4 text-emerald-600" />}
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
  pending: { label: 'Pending', color: 'text-slate-500' },
  generating: { label: 'Generating content...', color: 'text-amber-600' },
  uploading: { label: 'Uploading to Google Docs...', color: 'text-teal-600' },
  done: { label: 'Done', color: 'text-emerald-700' },
  failed: { label: 'Failed', color: 'text-rose-700' },
};

function StatusIcon({ status }: { status: ArticleStatus }) {
  switch (status) {
    case 'done': return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'failed': return <AlertCircle className="h-4 w-4 text-rose-600" />;
    case 'generating': return <Loader2 className="h-4 w-4 animate-spin text-amber-500" />;
    case 'uploading': return <Loader2 className="h-4 w-4 animate-spin text-teal-500" />;
    default: return <FileText className="h-4 w-4 text-slate-400" />;
  }
}

function ArticleRow({ index, article, onRetry, isProcessing }: {
  index: number; article: ArticleEntry; onRetry: () => void; isProcessing: boolean;
}) {
  const cfg = STATUS_CFG[article.status];
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700">{index + 1}</span>
      <StatusIcon status={article.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800">{article.title}</div>
        <div className={`mt-0.5 text-xs ${cfg.color}`}>
          {article.status === 'failed' && article.error ? article.error : cfg.label}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {article.status === 'done' && article.googleDocUrl && (
          <>
            <CopyBtn text={article.googleDocUrl} label="Copy link" />
            <a href={article.googleDocUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
              <ExternalLink className="h-3.5 w-3.5" /> Open Doc
            </a>
          </>
        )}
        {article.status === 'failed' && !isProcessing && (
          <button onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
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
      className={className || "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"}>
      <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : label}
    </button>
  );
}

type CopyFormat = 'urls' | 'name-url' | 'numbered';
const FORMAT_OPTIONS: { key: CopyFormat; label: string; hint: string }[] = [
  { key: 'urls', label: 'URLs only', hint: 'One link per line' },
  { key: 'name-url', label: 'Name + URL', hint: 'Two columns in Sheets' },
  { key: 'numbered', label: 'Numbered list', hint: '1. Name \u2014 URL' },
];
const FORMAT_LABEL: Record<CopyFormat, string> = { urls: 'URLs', 'name-url': 'name + URL', numbered: 'numbered' };

function BulkLinksCard({ pairs }: { pairs: { name: string; url: string }[] }) {
  const [format, setFormat] = useState<CopyFormat>('urls');
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    if (format === 'urls') return pairs.map((p) => p.url).join('\n');
    if (format === 'name-url') return pairs.map((p) => `${p.name}\t${p.url}`).join('\n');
    return pairs.map((p, i) => `${i + 1}. ${p.name} \u2014 ${p.url}`).join('\n');
  }, [pairs, format]);

  const copy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-emerald-700" />
          <h3 className="text-sm font-semibold text-emerald-900">
            {pairs.length} {pairs.length === 1 ? 'link' : 'links'} ready to copy
          </h3>
        </div>
        <button onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600">
          <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : `Copy all (${FORMAT_LABEL[format]})`}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {FORMAT_OPTIONS.map((o) => (
          <button key={o.key} onClick={() => setFormat(o.key)}
            className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
              format === o.key
                ? 'border-emerald-500 bg-white shadow-sm ring-1 ring-emerald-500/30'
                : 'border-emerald-200 bg-white/60 hover:bg-white'
            }`}>
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
          <li key={p.url} className="flex items-center gap-3 rounded-md bg-white px-3 py-1.5 shadow-sm">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded bg-emerald-100 text-[10px] font-semibold text-emerald-700">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{p.name}</span>
            <a href={p.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 truncate text-[11px] font-medium text-emerald-700 hover:underline">
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

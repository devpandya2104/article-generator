import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import LocomotiveScroll from 'locomotive-scroll';
import 'locomotive-scroll/dist/locomotive-scroll.css';
import {
  Sparkles, Calendar, Globe, Search, Layers,
  ArrowRight, Zap, Sheet, FileText,
} from 'lucide-react';
import CustomCursor from '../components/CustomCursor';

gsap.registerPlugin(ScrollTrigger);

/* ── Tool definitions ──────────────────────────────────────────── */
const TOOLS = [
  {
    id: 'article-generator',
    title: 'Article Generator',
    tagline: 'SEO articles at scale',
    desc: 'Produce batches of long-form articles with anchors, custom prompts, and direct Google Docs upload.',
    Icon: Sparkles,
    num: '01',
    accent: '#8b5cf6',
    accentRgb: '139,92,246',
    grad: 'from-violet-600 to-purple-700',
    status: 'live' as const,
    href: '/article-generator',
    tags: ['Batch', 'Google Docs', 'SEO'],
  },
  {
    id: 'sheet-generator',
    title: 'Sheet Generator',
    tagline: 'Generate from Google Sheets',
    desc: 'Read orders from a Google Sheet, auto-generate articles, and write back status, doc URL, and word count.',
    Icon: Sheet,
    num: '02',
    accent: '#10b981',
    accentRgb: '16,185,129',
    grad: 'from-emerald-500 to-teal-600',
    status: 'live' as const,
    href: '/sheet-generator',
    tags: ['Google Sheets', 'Batch', 'Auto'],
  },
  {
    id: 'doc-converter',
    title: 'Doc Converter',
    tagline: 'Word → Google Docs instantly',
    desc: 'Upload multiple .docx files and get Google Doc URLs back in seconds. Batch convert with one click.',
    Icon: FileText,
    num: '03',
    accent: '#3b82f6',
    accentRgb: '59,130,246',
    grad: 'from-blue-500 to-cyan-600',
    status: 'live' as const,
    href: '/doc-converter',
    tags: ['DOCX', 'Google Docs', 'Batch'],
  },
  {
    id: 'content-calendar',
    title: 'Content Calendar',
    tagline: 'Plan your publishing flow',
    desc: 'Visual calendar with AI-suggested cadence, deadline tracking, and team collaboration built in.',
    Icon: Calendar,
    num: '04',
    accent: '#0ea5e9',
    accentRgb: '14,165,233',
    grad: 'from-sky-400 to-cyan-600',
    status: 'soon' as const,
    href: null,
    tags: ['Planning', 'Team', 'Schedule'],
  },
  {
    id: 'wp-publisher',
    title: 'WP Publisher',
    tagline: 'Deploy directly to WordPress',
    desc: 'Push article batches straight to WordPress as drafts or live posts via the WP REST API.',
    Icon: Globe,
    num: '05',
    accent: '#f97316',
    accentRgb: '249,115,22',
    grad: 'from-orange-400 to-amber-600',
    status: 'soon' as const,
    href: null,
    tags: ['WordPress', 'REST', 'Deploy'],
  },
  {
    id: 'ai-researcher',
    title: 'AI Researcher',
    tagline: 'Deep keyword & topic research',
    desc: 'Uncover high-opportunity keywords, competitor gaps, and trending topics across any niche.',
    Icon: Search,
    num: '06',
    accent: '#f43f5e',
    accentRgb: '244,63,94',
    grad: 'from-rose-400 to-pink-600',
    status: 'soon' as const,
    href: null,
    tags: ['Keywords', 'Competitors', 'Trends'],
  },
  {
    id: 'bulk-repurposer',
    title: 'Bulk Repurposer',
    tagline: 'One article, many formats',
    desc: 'Transform any article into Twitter threads, LinkedIn posts, emails, and YouTube scripts instantly.',
    Icon: Layers,
    num: '07',
    accent: '#6366f1',
    accentRgb: '99,102,241',
    grad: 'from-indigo-400 to-blue-600',
    status: 'soon' as const,
    href: null,
    tags: ['Social', 'Email', 'Video'],
  },
] as const;

type Tool = (typeof TOOLS)[number];

const MARQUEE_WORDS = [
  'ARTICLE GENERATOR', '✦', 'SHEET GENERATOR', '✦', 'DOC CONVERTER', '✦',
  'CONTENT CALENDAR', '✦', 'WP PUBLISHER', '✦', 'AI RESEARCHER', '✦', 'BULK REPURPOSER', '✦',
];

/* ── Background blobs with blur — the actual visible glow effect ── */
function BackgroundScene() {
  useEffect(() => {
    gsap.to('.bg-blob-1', { x: 80, y: -70, scale: 1.1, duration: 9,  repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('.bg-blob-2', { x: -60, y: 50, scale: 0.9, duration: 13, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 2.5 });
    gsap.to('.bg-blob-3', { x: 50, y: -40, scale: 1.12, duration: 11, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 5 });
    gsap.to('.bg-blob-4', { x: -50, y: 60, scale: 0.88, duration: 15, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1 });
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>

      {/* Subtle radial lift at top — adds purple tint to the "sky" */}
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 120% 55% at 50% -10%, rgba(88,28,220,0.28) 0%, transparent 65%)' }} />

      {/* Grid lines — opacity on the div, solid colors on the lines */}
      <div className="absolute inset-0 opacity-[0.09]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(139,92,246,1) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />

      {/* Blob 1 — large violet, top-left */}
      <div className="bg-blob-1 absolute"
        style={{
          top: '-20%', left: '-10%',
          width: '75vw', height: '75vw',
          borderRadius: '50%',
          background: '#5b21b6',
          filter: 'blur(160px)',
          opacity: 0.42,
        }} />

      {/* Blob 2 — fuchsia, top-right */}
      <div className="bg-blob-2 absolute"
        style={{
          top: '-15%', right: '-15%',
          width: '55vw', height: '55vw',
          borderRadius: '50%',
          background: '#7e22ce',
          filter: 'blur(140px)',
          opacity: 0.28,
        }} />

      {/* Blob 3 — indigo, bottom-left */}
      <div className="bg-blob-3 absolute"
        style={{
          bottom: '-20%', left: '5%',
          width: '60vw', height: '60vw',
          borderRadius: '50%',
          background: '#3730a3',
          filter: 'blur(150px)',
          opacity: 0.3,
        }} />

      {/* Blob 4 — cyan accent, bottom-right */}
      <div className="bg-blob-4 absolute"
        style={{
          bottom: '5%', right: '-10%',
          width: '40vw', height: '40vw',
          borderRadius: '50%',
          background: '#0e7490',
          filter: 'blur(130px)',
          opacity: 0.2,
        }} />

      {/* Film grain noise */}
      <div className="absolute inset-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px',
          opacity: 0.07,
          mixBlendMode: 'overlay',
        }} />

      {/* Bottom fade so footer stays dark */}
      <div className="absolute inset-x-0 bottom-0 h-[35vh]"
        style={{ background: 'linear-gradient(to top, #050508 0%, transparent 100%)' }} />
    </div>
  );
}

/* ── Mouse spotlight ──────────────────────────────────────────────── */
function MouseSpotlight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!ref.current) return;
      gsap.to(ref.current, { x: e.clientX - 350, y: e.clientY - 350, duration: 1.8, ease: 'power2.out' });
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);
  return (
    <div ref={ref} className="pointer-events-none fixed z-[1] h-[700px] w-[700px] rounded-full"
      style={{
        background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 65%)',
        willChange: 'transform',
      }} />
  );
}

/* ── ToolCard ─────────────────────────────────────────────────────── */
function ToolCard({ tool }: { tool: Tool }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const onMove = (e: MouseEvent) => {
      const r = card.getBoundingClientRect();
      const dx = e.clientX - r.left - r.width  / 2;
      const dy = e.clientY - r.top  - r.height / 2;
      gsap.to(card, { rotateX: (-dy / r.height) * 12, rotateY: (dx / r.width) * 12, ease: 'power2.out', duration: 0.35 });
      if (glowRef.current) {
        const gx = ((e.clientX - r.left) / r.width)  * 100;
        const gy = ((e.clientY - r.top)  / r.height) * 100;
        glowRef.current.style.background =
          `radial-gradient(320px circle at ${gx}% ${gy}%, rgba(${tool.accentRgb},0.18), transparent 60%)`;
      }
    };
    const onLeave = () => {
      gsap.to(card, { rotateX: 0, rotateY: 0, ease: 'elastic.out(1,0.55)', duration: 0.9 });
      if (glowRef.current) glowRef.current.style.background = 'none';
    };
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
    return () => { card.removeEventListener('mousemove', onMove); card.removeEventListener('mouseleave', onLeave); };
  }, [tool.accentRgb]);

  return (
    <div
      ref={cardRef}
      className="d-tool-card group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#050508]/80 backdrop-blur-md transition-colors duration-300 hover:border-white/[0.15]"
      style={{ perspective: '900px', transformStyle: 'preserve-3d', cursor: tool.href ? 'pointer' : 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => tool.href && navigate(tool.href)}
    >
      {/* Glow overlay */}
      <div ref={glowRef} className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.3s' }} />

      {/* Top accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity duration-500"
        style={{
          background: `linear-gradient(90deg, transparent, ${tool.accent}cc 50%, transparent)`,
          opacity: hovered ? 1 : 0,
        }} />

      {/* Tool number watermark */}
      <div className="absolute right-5 top-4 select-none font-black tracking-widest text-white/[0.05]"
        style={{ fontSize: '3rem', lineHeight: 1 }}>{tool.num}</div>

      <div className="relative flex flex-1 flex-col p-6">
        {/* Icon + badge */}
        <div className="mb-6 flex items-center justify-between">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${tool.grad}`}
            style={{ boxShadow: `0 4px 28px rgba(${tool.accentRgb},0.55)` }}>
            <tool.Icon className="h-5 w-5 text-white" strokeWidth={1.75} />
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black tracking-widest uppercase ${
            tool.status === 'live'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-white/[0.06] bg-white/[0.02] text-slate-600'
          }`}>
            {tool.status === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            {tool.status === 'live' ? 'Live' : 'Soon'}
          </span>
        </div>

        {/* Text */}
        <div className="mb-4 flex-1">
          <h3 className="mb-1 text-[15px] font-black tracking-tight text-white">{tool.title}</h3>
          <p className="mb-3 text-[13px] font-semibold" style={{ color: tool.accent }}>{tool.tagline}</p>
          <p className="text-[12px] leading-relaxed text-slate-600">{tool.desc}</p>
        </div>

        {/* Tags */}
        <div className="mb-5 flex flex-wrap gap-1.5">
          {tool.tags.map(tag => (
            <span key={tag} className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
              {tag}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-1.5 text-[13px] font-black"
          style={{ color: tool.href ? tool.accent : '#334155' }}>
          {tool.href
            ? <><span>Open Tool</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1.5 duration-200" /></>
            : <><span>Coming Soon</span><Zap className="h-3.5 w-3.5" /></>
          }
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────── */
export default function Dashboard() {
  const locoRef  = useRef<LocomotiveScroll | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loco = new LocomotiveScroll({
      lenisOptions: { lerp: 0.075, smoothWheel: true, syncTouch: false },
      initCustomTicker:    (r) => { gsap.ticker.add(r); gsap.ticker.lagSmoothing(0); },
      destroyCustomTicker: (r) => { gsap.ticker.remove(r); },
    });
    locoRef.current = loco;
    loco.lenisInstance?.on('scroll', () => ScrollTrigger.update());
    ScrollTrigger.addEventListener('refresh', () => loco.resize());

    const ctx = gsap.context(() => {
      gsap.from('.d-nav', { y: -40, opacity: 0, duration: 1, ease: 'power3.out', delay: 0.05 });
      gsap.from('.d-badge', { y: 22, opacity: 0, scale: 0.85, duration: 0.75, ease: 'back.out(2.5)', delay: 0.3 });

      gsap.from('.d-hero-line', { y: '105%', duration: 1, stagger: 0.1, ease: 'power4.out', delay: 0.5 });
      gsap.from('.d-hero-sub',  { y: 28, opacity: 0, duration: 0.8, ease: 'power3.out', delay: 1.05 });
      gsap.from('.d-hero-cta',  { y: 24, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out', delay: 1.18 });

      /* Scroll pill appears then fades as user scrolls */
      gsap.from('.d-scroll-hint', { opacity: 0, y: 10, duration: 0.6, delay: 1.9 });
      gsap.to('.d-scroll-dot', { y: 12, repeat: -1, yoyo: true, duration: 1.1, ease: 'sine.inOut', delay: 2.3 });
      gsap.to('.d-scroll-hint', {
        opacity: 0, y: 10,
        scrollTrigger: { start: '120px top', end: '280px top', scrub: 0.6 },
      });

      /* Section reveals */
      gsap.set('.d-reveal', { autoAlpha: 0, y: 40 });
      ScrollTrigger.batch('.d-reveal', {
        onEnter: b => gsap.to(b, { autoAlpha: 1, y: 0, stagger: 0.1, duration: 0.85, ease: 'power3.out' }),
        start: 'top 87%', once: true,
      });

      /* Cards */
      gsap.set('.d-tool-card', { autoAlpha: 0, y: 55, scale: 0.96 });
      ScrollTrigger.batch('.d-tool-card', {
        onEnter: b => gsap.to(b, { autoAlpha: 1, y: 0, scale: 1, stagger: 0.07, duration: 0.7, ease: 'back.out(1.4)' }),
        start: 'top 89%', once: true,
      });

      /* Stats */
      gsap.set('.d-stat', { autoAlpha: 0, y: 50 });
      ScrollTrigger.batch('.d-stat', {
        onEnter: b => gsap.to(b, { autoAlpha: 1, y: 0, stagger: 0.15, duration: 0.8, ease: 'power3.out' }),
        start: 'top 84%', once: true,
      });
    });

    ScrollTrigger.refresh();
    return () => {
      ctx.revert();
      loco.destroy();
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  const scrollToTools = () => locoRef.current?.scrollTo('#d-tools', { duration: 1.4 });

  return (
    <div className="relative bg-[#050508] text-slate-100 selection:bg-violet-700/40">
      <CustomCursor />
      <BackgroundScene />
      <MouseSpotlight />

      {/* ── Navbar ────────────────────────────────────────────────── */}
      <header className="d-nav fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-8 py-5">
        <div className="absolute inset-0 border-b border-white/[0.06] bg-[#050508]/55 backdrop-blur-2xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-700"
            style={{ boxShadow: '0 0 20px rgba(124,58,237,0.55)' }}>
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2} />
          </div>
          <span className="text-[15px] font-black tracking-tight text-white">ContentForge</span>
        </div>
        <nav className="relative flex items-center gap-7">
          <button onClick={scrollToTools} className="text-[13px] font-semibold text-slate-500 hover:text-slate-200 transition-colors">Tools</button>
          <button onClick={() => navigate('/article-generator')} className="text-[13px] font-semibold text-slate-500 hover:text-slate-200 transition-colors">Generator</button>
          <button onClick={() => navigate('/article-generator')}
            className="rounded-xl bg-violet-600 px-5 py-2 text-[13px] font-black text-white hover:bg-violet-500 transition-all hover:-translate-y-px"
            style={{ boxShadow: '0 0 24px rgba(124,58,237,0.45)' }}>
            Get Started
          </button>
        </nav>
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════ */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pt-24 pb-28">

        <div className="d-badge mb-10 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/[0.09] px-4 py-1.5 text-[10px] font-black tracking-[0.2em] uppercase text-violet-400">
          <Sparkles className="h-3 w-3" />Content Creation Suite
        </div>

        {/* Each word is isolated in overflow-hidden — cannot ever mid-word break */}
        <h1 className="mb-10 select-none text-center font-black leading-[0.88] tracking-tighter"
          style={{ fontSize: 'clamp(3rem, 9vw, 9rem)' }}>

          <span className="block overflow-hidden py-1">
            <span className="d-hero-line inline-block text-white">ALL YOUR</span>
          </span>
          <span className="block overflow-hidden py-1">
            <span className="d-hero-line inline-block text-white">CONTENT</span>
          </span>
          <span className="block overflow-hidden py-1">
            <span className="d-hero-line inline-block whitespace-nowrap"
              style={{
                backgroundImage: 'linear-gradient(90deg, #a78bfa, #e879f9, #67e8f9, #a78bfa)',
                backgroundSize: '300% 100%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'gradient-flow 6s linear infinite',
                filter: 'drop-shadow(0 0 50px rgba(139,92,246,0.5))',
              }}>
              TOOLS.
            </span>
          </span>
          <span className="block overflow-hidden py-1" style={{ fontSize: 'clamp(1.4rem, 3.8vw, 3.5rem)' }}>
            <span className="d-hero-line inline-block text-slate-700">ONE PLACE.</span>
          </span>
        </h1>

        <p className="d-hero-sub mx-auto mb-10 max-w-md text-center text-[15px] leading-relaxed text-slate-500">
          AI-powered tools to create, optimize, and publish content at scale. One dashboard. Unlimited potential.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            className="d-hero-cta group flex items-center gap-2.5 rounded-2xl bg-violet-600 px-9 py-3.5 text-[14px] font-black text-white transition-all hover:bg-violet-500 hover:-translate-y-0.5"
            style={{ boxShadow: '0 0 38px rgba(124,58,237,0.6), 0 4px 24px rgba(0,0,0,0.5)' }}
            onClick={() => navigate('/article-generator')}
          >
            Start Creating <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button
            className="d-hero-cta rounded-2xl border border-white/[0.1] bg-white/[0.04] px-9 py-3.5 text-[14px] font-black text-slate-300 backdrop-blur-sm transition-all hover:bg-white/[0.08] hover:text-white hover:-translate-y-0.5"
            onClick={scrollToTools}
          >
            Explore Tools
          </button>
        </div>
      </section>

      {/* Scroll pill — fixed so it never overlaps hero text */}
      <div className="d-scroll-hint pointer-events-none fixed bottom-8 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-3">
        <span className="text-[9px] font-black tracking-[0.3em] uppercase text-slate-700">Scroll</span>
        <div className="relative h-10 w-5 rounded-full border border-white/[0.12]">
          <div className="d-scroll-dot absolute left-1/2 top-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-violet-500" />
        </div>
      </div>

      {/* ══ MARQUEE ══════════════════════════════════════════════════ */}
      <div className="relative z-10 overflow-hidden border-y border-white/[0.05] py-[18px]">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28"
          style={{ background: 'linear-gradient(90deg, #050508, transparent)' }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28"
          style={{ background: 'linear-gradient(270deg, #050508, transparent)' }} />
        <div className="d-marquee-outer flex whitespace-nowrap">
          <div className="d-marquee-track flex shrink-0 items-center gap-12 pr-12">
            {[...MARQUEE_WORDS, ...MARQUEE_WORDS].map((w, i) => (
              <span key={i} className={`select-none text-[10px] font-black tracking-[0.22em] uppercase ${w === '✦' ? 'text-violet-600' : 'text-slate-700'}`}>{w}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ══ TOOLS GRID ═══════════════════════════════════════════════ */}
      <section id="d-tools" className="relative z-10 mx-auto max-w-7xl px-6 py-32">
        <div className="mb-20 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="d-reveal mb-3 text-[10px] font-black tracking-[0.28em] uppercase text-violet-500">— The Toolkit</p>
            <h2 className="d-reveal font-black leading-none tracking-tight text-white"
              style={{ fontSize: 'clamp(2.2rem, 5vw, 4.2rem)' }}>
              Everything you need<br />
              <span className="text-slate-700">to create at scale.</span>
            </h2>
          </div>
          <p className="d-reveal hidden max-w-xs text-right text-[13px] leading-relaxed text-slate-600 lg:block">
            From ideation to publication — every step covered by a dedicated AI tool.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5" style={{ perspective: '1400px' }}>
          {TOOLS.map(tool => <ToolCard key={tool.id} tool={tool} />)}
        </div>
      </section>

      {/* ══ STATS ════════════════════════════════════════════════════ */}
      <div className="relative z-10 border-y border-white/[0.05]">
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 100% at 50% 50%, rgba(124,58,237,0.07), transparent)' }} />
        <div className="relative mx-auto grid max-w-4xl grid-cols-1 divide-y divide-white/[0.05] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { value: '1.2M+', label: 'Words Generated',    sub: 'and counting'      },
            { value: '48K+',  label: 'Articles Published', sub: 'across all niches' },
            { value: '7',     label: 'Tools & Growing',    sub: 'new tools monthly' },
          ].map(stat => (
            <div key={stat.value} className="d-stat px-10 py-14 text-center">
              <div className="mb-2 font-black leading-none"
                style={{
                  fontSize: 'clamp(2.6rem, 5vw, 3.8rem)',
                  background: 'linear-gradient(135deg, #fff 25%, #8b5cf6 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                {stat.value}
              </div>
              <div className="mb-1 text-[13px] font-black text-slate-300">{stat.label}</div>
              <div className="text-[11px] text-slate-600">{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ BOTTOM CTA ═══════════════════════════════════════════════ */}
      <section className="relative z-10 px-6 py-36 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 65%)' }} />
        <div className="relative d-reveal mx-auto max-w-2xl">
          <p className="mb-4 text-[10px] font-black tracking-[0.28em] uppercase text-violet-500">Get Started Today</p>
          <h2 className="mb-5 font-black tracking-tight text-white"
            style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4.2rem)', lineHeight: 1.05 }}>
            Ready to build<br />faster content?
          </h2>
          <p className="mb-10 text-[15px] text-slate-500">Start with the Article Generator — more tools unlock soon.</p>
          <button onClick={() => navigate('/article-generator')}
            className="group inline-flex items-center gap-3 rounded-2xl bg-violet-600 px-10 py-4 text-[15px] font-black text-white transition-all hover:bg-violet-500 hover:-translate-y-0.5"
            style={{ boxShadow: '0 0 55px rgba(124,58,237,0.6), 0 4px 32px rgba(0,0,0,0.5)' }}>
            Open Article Generator
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════ */}
      <footer className="relative z-10 border-t border-white/[0.05] px-8 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-700">
              <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2} />
            </div>
            <span className="text-[13px] font-black text-slate-600">ContentForge</span>
          </div>
          <p className="text-[11px] text-slate-700">© 2026 ContentForge · All tools, one place.</p>
          <div className="flex items-center gap-5">
            {[['Article Generator', '/article-generator'], ['Sheet Generator', '/sheet-generator'], ['Doc Converter', '/doc-converter']].map(([label, path]) => (
              <button key={path} onClick={() => navigate(path)}
                className="text-[11px] text-slate-700 hover:text-slate-400 transition-colors">{label}</button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

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

/* ── Tools ─────────────────────────────────────────────────────── */
const TOOLS = [
  {
    id: 'article-generator', title: 'Article Generator', tagline: 'SEO articles at scale',
    desc: 'Produce batches of long-form articles with anchors, custom prompts, and direct Google Docs upload.',
    Icon: Sparkles, num: '01', accent: '#8b5cf6', accentRgb: '139,92,246',
    grad: 'from-violet-600 to-purple-700', status: 'live' as const, href: '/article-generator',
    tags: ['Batch', 'Google Docs', 'SEO'],
  },
  {
    id: 'sheet-generator', title: 'Sheet Generator', tagline: 'Generate from Google Sheets',
    desc: 'Read orders from a Google Sheet, auto-generate articles, and write back status, doc URL, and word count.',
    Icon: Sheet, num: '02', accent: '#10b981', accentRgb: '16,185,129',
    grad: 'from-emerald-500 to-teal-600', status: 'live' as const, href: '/sheet-generator',
    tags: ['Google Sheets', 'Batch', 'Auto'],
  },
  {
    id: 'doc-converter', title: 'Doc Converter', tagline: 'Word → Google Docs instantly',
    desc: 'Upload multiple .docx files and get Google Doc URLs back in seconds. Batch convert with one click.',
    Icon: FileText, num: '03', accent: '#a78bfa', accentRgb: '167,139,250',
    grad: 'from-violet-400 to-indigo-600', status: 'live' as const, href: '/doc-converter',
    tags: ['DOCX', 'Google Docs', 'Batch'],
  },
  {
    id: 'content-calendar', title: 'Content Calendar', tagline: 'Plan your publishing flow',
    desc: 'Visual calendar with AI-suggested cadence, deadline tracking, and team collaboration built in.',
    Icon: Calendar, num: '04', accent: '#f59e0b', accentRgb: '245,158,11',
    grad: 'from-amber-400 to-orange-500', status: 'soon' as const, href: null,
    tags: ['Planning', 'Team', 'Schedule'],
  },
  {
    id: 'wp-publisher', title: 'WP Publisher', tagline: 'Deploy directly to WordPress',
    desc: 'Push article batches straight to WordPress as drafts or live posts via the WP REST API.',
    Icon: Globe, num: '05', accent: '#f43f5e', accentRgb: '244,63,94',
    grad: 'from-rose-500 to-pink-600', status: 'soon' as const, href: null,
    tags: ['WordPress', 'REST', 'Deploy'],
  },
  {
    id: 'ai-researcher', title: 'AI Researcher', tagline: 'Deep keyword & topic research',
    desc: 'Uncover high-opportunity keywords, competitor gaps, and trending topics across any niche.',
    Icon: Search, num: '06', accent: '#06b6d4', accentRgb: '6,182,212',
    grad: 'from-cyan-400 to-sky-600', status: 'soon' as const, href: null,
    tags: ['Keywords', 'Competitors', 'Trends'],
  },
  {
    id: 'bulk-repurposer', title: 'Bulk Repurposer', tagline: 'One article, many formats',
    desc: 'Transform any article into Twitter threads, LinkedIn posts, emails, and YouTube scripts instantly.',
    Icon: Layers, num: '07', accent: '#ec4899', accentRgb: '236,72,153',
    grad: 'from-pink-500 to-fuchsia-600', status: 'soon' as const, href: null,
    tags: ['Social', 'Email', 'Video'],
  },
] as const;

type Tool = (typeof TOOLS)[number];

const MARQUEE_WORDS = [
  'ARTICLE GENERATOR', '✦', 'SHEET GENERATOR', '✦', 'DOC CONVERTER', '✦',
  'CONTENT CALENDAR', '✦', 'WP PUBLISHER', '✦', 'AI RESEARCHER', '✦', 'BULK REPURPOSER', '✦',
];

/* ── ToolCard — unchanged ───────────────────────────────────────── */
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
      <div ref={glowRef} className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.3s' }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${tool.accent}cc 50%, transparent)`, opacity: hovered ? 1 : 0 }} />
      <div className="absolute right-5 top-4 select-none font-black tracking-widest text-white/[0.05]"
        style={{ fontSize: '3rem', lineHeight: 1 }}>{tool.num}</div>
      <div className="relative flex flex-1 flex-col p-6">
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
        <div className="mb-4 flex-1">
          <h3 className="mb-1 text-[15px] font-black tracking-tight text-white">{tool.title}</h3>
          <p className="mb-3 text-[13px] font-semibold" style={{ color: tool.accent }}>{tool.tagline}</p>
          <p className="text-[12px] leading-relaxed text-slate-600">{tool.desc}</p>
        </div>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {tool.tags.map(tag => (
            <span key={tag} className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
              {tag}
            </span>
          ))}
        </div>
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

/* ── Dashboard ─────────────────────────────────────────────────── */
export default function Dashboard() {
  const locoRef  = useRef<LocomotiveScroll | null>(null);
  const navigate = useNavigate();
  const heroRef  = useRef<HTMLElement>(null);

  useEffect(() => {
    const loco = new LocomotiveScroll({
      lenisOptions: { lerp: 0.06, smoothWheel: true, syncTouch: false },
      initCustomTicker:    (r) => { gsap.ticker.add(r); gsap.ticker.lagSmoothing(0); },
      destroyCustomTicker: (r) => { gsap.ticker.remove(r); },
    });
    locoRef.current = loco;
    loco.lenisInstance?.on('scroll', () => ScrollTrigger.update());
    ScrollTrigger.addEventListener('refresh', () => loco.resize());

    const ctx = gsap.context(() => {

      /* ── Blob parallax on scroll ── */
      gsap.to('.bg-blob-1', { y: -200, ease: 'none', scrollTrigger: { start: 'top top', end: 'bottom top', scrub: 1.5 } });
      gsap.to('.bg-blob-2', { y: -120, ease: 'none', scrollTrigger: { start: 'top top', end: 'bottom top', scrub: 2 } });
      gsap.to('.bg-blob-3', { y:  100, ease: 'none', scrollTrigger: { start: 'top top', end: 'bottom top', scrub: 1 } });
      gsap.to('.bg-blob-4', { y:  80,  ease: 'none', scrollTrigger: { start: 'top top', end: 'bottom top', scrub: 2.5 } });

      /* ── Blob float animations ── */
      gsap.to('.bg-blob-1', { x: 70, y: '-=60', scale: 1.08, duration: 10, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.bg-blob-2', { x: -50, y: '+=50', scale: 0.92, duration: 14, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 2 });
      gsap.to('.bg-blob-3', { x: 60, y: '-=40', scale: 1.1, duration: 11, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 5 });
      gsap.to('.bg-blob-4', { x: -40, y: '+=55', scale: 0.9, duration: 13, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1 });

      /* ── Floating accent dots ── */
      gsap.to('.fdot', {
        y: -25, duration: 2.5, stagger: { each: 0.5, from: 'random' },
        repeat: -1, yoyo: true, ease: 'sine.inOut',
      });

      /* ── Navbar ── */
      gsap.from('.d-nav', { y: -50, opacity: 0, duration: 1, ease: 'power3.out' });

      /* ── Hero lines slide up ── */
      gsap.from('.d-hero-line', { y: '110%', duration: 1.1, stagger: 0.1, ease: 'power4.out', delay: 0.35 });

      /* ── Hero sub-elements ── */
      gsap.from('.d-hero-chips', { y: 20, opacity: 0, duration: 0.7, ease: 'power3.out', delay: 1.1 });
      gsap.from('.d-hero-sub',   { y: 20, opacity: 0, duration: 0.7, ease: 'power3.out', delay: 1.2 });
      gsap.from('.d-hero-cta',   { y: 20, opacity: 0, stagger: 0.1, duration: 0.7, ease: 'power3.out', delay: 1.3 });

      /* ── Scroll indicator fade in + bounce + fade out ── */
      gsap.from('.d-scroll', { opacity: 0, y: 8, duration: 0.6, delay: 2 });
      gsap.to('.d-scroll-dot', { y: 12, repeat: -1, yoyo: true, duration: 1.1, ease: 'sine.inOut', delay: 2.4 });
      gsap.to('.d-scroll', {
        opacity: 0,
        scrollTrigger: { start: '100px top', end: '260px top', scrub: 0.5 },
      });

      /* ── Edge labels slide in ── */
      gsap.from('.d-edge-label', { opacity: 0, x: -12, duration: 1, stagger: 0.15, ease: 'power3.out', delay: 1.5 });

      /* ── Marquee ── */
      gsap.from('.d-marquee-wrap', { opacity: 0, duration: 0.8, delay: 0.2 });

      /* ── Section reveals ── */
      gsap.set('.d-reveal', { autoAlpha: 0, y: 48 });
      ScrollTrigger.batch('.d-reveal', {
        onEnter: b => gsap.to(b, { autoAlpha: 1, y: 0, stagger: 0.1, duration: 0.9, ease: 'power3.out' }),
        start: 'top 87%', once: true,
      });

      /* ── Cards ── */
      gsap.set('.d-tool-card', { autoAlpha: 0, y: 60, scale: 0.95 });
      ScrollTrigger.batch('.d-tool-card', {
        onEnter: b => gsap.to(b, { autoAlpha: 1, y: 0, scale: 1, stagger: 0.07, duration: 0.8, ease: 'back.out(1.3)' }),
        start: 'top 89%', once: true,
      });

      /* ── Stats ── */
      gsap.set('.d-stat', { autoAlpha: 0, y: 50 });
      ScrollTrigger.batch('.d-stat', {
        onEnter: b => gsap.to(b, { autoAlpha: 1, y: 0, stagger: 0.14, duration: 0.85, ease: 'power3.out' }),
        start: 'top 84%', once: true,
      });

      /* ── CTA section ── */
      gsap.set('.d-cta-section > *', { autoAlpha: 0, y: 40 });
      ScrollTrigger.batch('.d-cta-section > *', {
        onEnter: b => gsap.to(b, { autoAlpha: 1, y: 0, stagger: 0.12, duration: 0.9, ease: 'power3.out' }),
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

  const scrollToTools = () => locoRef.current?.scrollTo('#d-tools', { duration: 1.5 });

  return (
    <div className="relative bg-[#020205] text-slate-100 selection:bg-fuchsia-700/30">
      <CustomCursor />

      {/* ══ BACKGROUND ══════════════════════════════════════════════ */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>

        {/* Blobs — multicolor for "colorful dark" feel */}
        <div className="bg-blob-1 absolute rounded-full"
          style={{ top: '-25%', left: '-5%', width: '85vw', height: '85vw', background: '#5b21b6', filter: 'blur(170px)', opacity: 0.38 }} />
        <div className="bg-blob-2 absolute rounded-full"
          style={{ top: '-20%', right: '-15%', width: '55vw', height: '55vw', background: '#a21caf', filter: 'blur(140px)', opacity: 0.28 }} />
        <div className="bg-blob-3 absolute rounded-full"
          style={{ bottom: '-25%', left: '-5%', width: '55vw', height: '55vw', background: '#065f46', filter: 'blur(150px)', opacity: 0.28 }} />
        <div className="bg-blob-4 absolute rounded-full"
          style={{ bottom: '-10%', right: '-10%', width: '45vw', height: '45vw', background: '#9f1239', filter: 'blur(140px)', opacity: 0.22 }} />

        {/* White dot grid */}
        <div className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.35,
          }} />

        {/* Film grain */}
        <div className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '180px 180px', opacity: 0.055, mixBlendMode: 'overlay',
          }} />

        {/* Bottom fade */}
        <div className="absolute inset-x-0 bottom-0 h-[40vh]"
          style={{ background: 'linear-gradient(to top, #020205, transparent)' }} />
      </div>

      {/* ══ NAVBAR ══════════════════════════════════════════════════ */}
      <header className="d-nav fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-8 py-5">
        <div className="absolute inset-0 border-b border-white/[0.06] bg-[#020205]/50 backdrop-blur-2xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #c026d3)', boxShadow: '0 0 20px rgba(192,38,211,0.5)' }}>
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2} />
          </div>
          <span className="text-[15px] font-black tracking-tight text-white">ContentForge</span>
        </div>
        <nav className="relative flex items-center gap-7">
          <button onClick={scrollToTools} className="text-[13px] font-semibold text-slate-500 hover:text-slate-200 transition-colors">Tools</button>
          <button onClick={() => navigate('/article-generator')} className="text-[13px] font-semibold text-slate-500 hover:text-slate-200 transition-colors">Generator</button>
          <button onClick={() => navigate('/article-generator')}
            className="rounded-xl px-5 py-2 text-[13px] font-black text-white transition-all hover:-translate-y-px"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #c026d3)', boxShadow: '0 0 24px rgba(124,58,237,0.5)' }}>
            Get Started
          </button>
        </nav>
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative z-10 flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-28">

        {/* Floating accent dots */}
        {[
          { x: '6%',  y: '18%', color: '#a855f7', s: 7  },
          { x: '91%', y: '22%', color: '#ec4899', s: 5  },
          { x: '4%',  y: '72%', color: '#10b981', s: 6  },
          { x: '93%', y: '68%', color: '#f59e0b', s: 5  },
          { x: '14%', y: '88%', color: '#06b6d4', s: 4  },
          { x: '82%', y: '85%', color: '#f43f5e', s: 4  },
          { x: '50%', y: '8%',  color: '#818cf8', s: 5  },
        ].map((d, i) => (
          <div key={i} className="fdot pointer-events-none absolute rounded-full"
            style={{
              left: d.x, top: d.y,
              width: d.s, height: d.s,
              background: d.color,
              boxShadow: `0 0 ${d.s * 5}px ${d.color}aa`,
            }} />
        ))}

        {/* Left edge label */}
        <div className="d-edge-label pointer-events-none absolute left-6 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3" style={{ writingMode: 'vertical-rl' }}>
          <div className="h-16 w-px bg-gradient-to-b from-transparent to-violet-500/40" />
          <span className="text-[10px] font-black tracking-[0.25em] uppercase text-slate-700">ContentForge</span>
          <div className="h-16 w-px bg-gradient-to-b from-violet-500/40 to-transparent" />
        </div>

        {/* Right edge label */}
        <div className="d-edge-label pointer-events-none absolute right-6 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3" style={{ writingMode: 'vertical-rl' }}>
          <div className="h-16 w-px bg-gradient-to-b from-transparent to-fuchsia-500/40" />
          <span className="text-[10px] font-black tracking-[0.25em] uppercase text-slate-700">Est. 2026</span>
          <div className="h-16 w-px bg-gradient-to-b from-fuchsia-500/40 to-transparent" />
        </div>

        {/* Badge */}
        <div className="d-hero-line mb-8 inline-flex items-center gap-2 rounded-full border border-fuchsia-500/25 bg-fuchsia-500/[0.08] px-4 py-1.5 text-[10px] font-black tracking-[0.22em] uppercase"
          style={{ color: '#e879f9' }}>
          <Sparkles className="h-3 w-3" />Content Creation Suite
        </div>

        {/* Headline */}
        <h1 className="mb-8 select-none text-center font-black leading-[0.88] tracking-tighter"
          style={{ fontSize: 'clamp(3rem, 9vw, 9.5rem)' }}>
          <span className="block overflow-hidden py-1">
            <span className="d-hero-line inline-block text-white">ALL YOUR</span>
          </span>
          <span className="block overflow-hidden py-1">
            <span className="d-hero-line inline-block text-white">CONTENT</span>
          </span>
          <span className="block overflow-hidden py-1">
            <span className="d-hero-line inline-block whitespace-nowrap"
              style={{
                backgroundImage: 'linear-gradient(90deg, #a855f7, #ec4899, #10b981, #a855f7)',
                backgroundSize: '300% 100%',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                animation: 'gradient-flow 5s linear infinite',
                filter: 'drop-shadow(0 0 60px rgba(168,85,247,0.5))',
              }}>
              TOOLS.
            </span>
          </span>
          <span className="block overflow-hidden py-1" style={{ fontSize: 'clamp(1.4rem, 3.5vw, 3.5rem)' }}>
            <span className="d-hero-line inline-block text-white/20">ONE PLACE.</span>
          </span>
        </h1>

        {/* Feature chips */}
        <div className="d-hero-chips mb-7 flex flex-wrap items-center justify-center gap-3">
          {[
            { label: '3 Live Tools',    color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)' },
            { label: 'AI-Powered',      color: '#a855f7', bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.25)' },
            { label: 'Google Docs API', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)' },
            { label: 'Instant Output',  color: '#ec4899', bg: 'rgba(236,72,153,0.1)',  border: 'rgba(236,72,153,0.25)' },
          ].map(c => (
            <span key={c.label}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-black"
              style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </div>

        {/* Subtitle */}
        <p className="d-hero-sub mx-auto mb-10 max-w-md text-center text-[15px] leading-relaxed text-slate-500">
          AI-powered tools to create, optimize, and publish content at scale.
          One dashboard. Unlimited potential.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button className="d-hero-cta group flex items-center gap-2.5 rounded-2xl px-9 py-3.5 text-[14px] font-black text-white transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #c026d3)', boxShadow: '0 0 40px rgba(124,58,237,0.55), 0 4px 24px rgba(0,0,0,0.5)' }}
            onClick={() => navigate('/article-generator')}>
            Start Creating <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button className="d-hero-cta rounded-2xl border border-white/[0.1] bg-white/[0.04] px-9 py-3.5 text-[14px] font-black text-slate-300 backdrop-blur-sm transition-all hover:bg-white/[0.08] hover:text-white hover:-translate-y-0.5"
            onClick={scrollToTools}>
            Explore Tools
          </button>
        </div>
      </section>

      {/* Scroll pill — fixed */}
      <div className="d-scroll pointer-events-none fixed bottom-8 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-3">
        <span className="text-[9px] font-black tracking-[0.3em] uppercase text-white/20">Scroll</span>
        <div className="relative h-10 w-5 rounded-full border border-white/[0.12]">
          <div className="d-scroll-dot absolute left-1/2 top-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
            style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }} />
        </div>
      </div>

      {/* ══ MARQUEE ══════════════════════════════════════════════════ */}
      <div className="d-marquee-wrap relative z-10 overflow-hidden border-y border-white/[0.06] py-5"
        style={{ background: 'rgba(255,255,255,0.015)' }}>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28"
          style={{ background: 'linear-gradient(90deg, #020205, transparent)' }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28"
          style={{ background: 'linear-gradient(270deg, #020205, transparent)' }} />
        <div className="d-marquee-outer flex whitespace-nowrap">
          <div className="d-marquee-track flex shrink-0 items-center gap-14 pr-14">
            {[...MARQUEE_WORDS, ...MARQUEE_WORDS].map((w, i) => (
              <span key={i}
                className="select-none text-[10px] font-black tracking-[0.24em] uppercase"
                style={{ color: w === '✦' ? '#a855f7' : 'rgba(255,255,255,0.2)' }}>
                {w}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══ LIVE TOOLS SPOTLIGHT ════════════════════════════════════ */}
      <section className="relative z-10 border-b border-white/[0.05] px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="d-reveal mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-emerald-500/40" />
            <span className="text-[10px] font-black tracking-[0.28em] uppercase text-emerald-400">Live Now</span>
            <div className="h-px w-12 bg-emerald-500/40" />
          </div>
          <div className="d-reveal mb-10">
            <h2 className="font-black leading-none tracking-tight text-white"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 3rem)' }}>
              Ready to use today
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {TOOLS.filter(t => t.status === 'live').map(tool => (
              <div key={tool.id} className="d-tool-card">
                <ToolCard tool={tool} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FULL TOOLKIT ════════════════════════════════════════════ */}
      <section id="d-tools" className="relative z-10 px-6 py-28">
        <div className="mx-auto max-w-7xl">
          <div className="d-reveal mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-fuchsia-500/40" />
            <span className="text-[10px] font-black tracking-[0.28em] uppercase" style={{ color: '#e879f9' }}>The Full Toolkit</span>
            <div className="h-px w-12 bg-fuchsia-500/40" />
          </div>
          <div className="d-reveal mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="font-black leading-none tracking-tight text-white"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 3.5rem)' }}>
              Everything you need<br />
              <span className="text-white/25">to create at scale.</span>
            </h2>
            <p className="d-reveal hidden max-w-xs text-right text-[13px] leading-relaxed text-slate-600 lg:block">
              From ideation to publication — every step covered by a dedicated AI tool.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5" style={{ perspective: '1400px' }}>
            {TOOLS.map(tool => (
              <div key={tool.id} className="d-tool-card">
                <ToolCard tool={tool} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ STATS ═══════════════════════════════════════════════════ */}
      <div className="relative z-10 border-y border-white/[0.05]"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.04), rgba(192,38,211,0.04), rgba(5,150,105,0.04))' }}>
        <div className="mx-auto grid max-w-4xl grid-cols-1 divide-y divide-white/[0.05] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { value: '1.2M+', label: 'Words Generated',    sub: 'and counting',       color: '#a855f7' },
            { value: '48K+',  label: 'Articles Published', sub: 'across all niches',  color: '#ec4899' },
            { value: '7',     label: 'Tools & Growing',    sub: 'new tools monthly',  color: '#10b981' },
          ].map(stat => (
            <div key={stat.value} className="d-stat px-10 py-14 text-center">
              <div className="mb-2 font-black leading-none"
                style={{
                  fontSize: 'clamp(2.6rem, 5vw, 4rem)',
                  background: `linear-gradient(135deg, #fff 30%, ${stat.color} 100%)`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  filter: `drop-shadow(0 0 30px ${stat.color}55)`,
                }}>
                {stat.value}
              </div>
              <div className="mb-1 text-[13px] font-black text-slate-300">{stat.label}</div>
              <div className="text-[11px] text-slate-600">{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ CTA SECTION ═════════════════════════════════════════════ */}
      <section className="relative z-10 overflow-hidden px-6 py-36 text-center">
        {/* Colorful glow behind */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: '70vw', height: '70vw', background: 'radial-gradient(circle, rgba(124,58,237,0.14) 0%, rgba(192,38,211,0.07) 40%, transparent 65%)' }} />
        <div className="d-cta-section relative mx-auto max-w-2xl">
          <div className="mb-3 flex items-center justify-center gap-3">
            <div className="h-px w-10 bg-fuchsia-500/40" />
            <span className="text-[10px] font-black tracking-[0.28em] uppercase" style={{ color: '#e879f9' }}>Get Started Today</span>
            <div className="h-px w-10 bg-fuchsia-500/40" />
          </div>
          <h2 className="mb-5 font-black tracking-tight text-white"
            style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4.5rem)', lineHeight: 1.02 }}>
            Ready to build<br />faster content?
          </h2>
          <p className="mb-10 text-[15px] text-slate-500">
            Start with the Article Generator — more tools unlock soon.
          </p>
          <button onClick={() => navigate('/article-generator')}
            className="group inline-flex items-center gap-3 rounded-2xl px-10 py-4 text-[15px] font-black text-white transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #c026d3)', boxShadow: '0 0 60px rgba(124,58,237,0.55), 0 4px 32px rgba(0,0,0,0.5)' }}>
            Open Article Generator
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════ */}
      <footer className="relative z-10 border-t border-white/[0.05] px-8 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #c026d3)' }}>
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

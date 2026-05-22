import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import LocomotiveScroll from 'locomotive-scroll';
import 'locomotive-scroll/dist/locomotive-scroll.css';
import {
  Sparkles, BarChart2, Calendar, Globe, Search, Layers,
  ArrowRight, Zap, ChevronDown, Sheet,
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
    grad: 'from-violet-600 to-purple-700',
    accent: 'rgba(139,92,246,',
    accentHex: '#7c3aed',
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
    grad: 'from-emerald-500 to-teal-600',
    accent: 'rgba(16,185,129,',
    accentHex: '#10b981',
    status: 'live' as const,
    href: '/sheet-generator',
    tags: ['Google Sheets', 'Batch', 'Auto'],
  },
  {
    id: 'content-calendar',
    title: 'Content Calendar',
    tagline: 'Plan your publishing flow',
    desc: 'Visual calendar with AI-suggested cadence, deadline tracking, and team collaboration built in.',
    Icon: Calendar,
    grad: 'from-sky-400 to-cyan-600',
    accent: 'rgba(14,165,233,',
    accentHex: '#0ea5e9',
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
    grad: 'from-orange-400 to-amber-600',
    accent: 'rgba(249,115,22,',
    accentHex: '#f97316',
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
    grad: 'from-rose-400 to-pink-600',
    accent: 'rgba(244,63,94,',
    accentHex: '#f43f5e',
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
    grad: 'from-indigo-400 to-blue-600',
    accent: 'rgba(99,102,241,',
    accentHex: '#6366f1',
    status: 'soon' as const,
    href: null,
    tags: ['Social', 'Email', 'Video'],
  },
] as const;

type Tool = (typeof TOOLS)[number];

const MARQUEE_WORDS = [
  'ARTICLE GENERATOR', '✦', 'SEO AUDITOR', '✦',
  'CONTENT CALENDAR', '✦', 'WP PUBLISHER', '✦',
  'AI RESEARCHER', '✦', 'BULK REPURPOSER', '✦',
];

/* ── ToolCard ──────────────────────────────────────────────────── */
function ToolCard({ tool }: { tool: Tool }) {
  const cardRef  = useRef<HTMLDivElement>(null);
  const glowRef  = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const onMove = (e: MouseEvent) => {
      const r = card.getBoundingClientRect();
      const dx = e.clientX - r.left - r.width  / 2;
      const dy = e.clientY - r.top  - r.height / 2;
      gsap.to(card, {
        rotateX: (-dy / r.height) * 10,
        rotateY: ( dx / r.width)  * 10,
        ease: 'power2.out',
        duration: 0.4,
      });
      if (glowRef.current) {
        const gx = ((e.clientX - r.left) / r.width)  * 100;
        const gy = ((e.clientY - r.top)  / r.height) * 100;
        glowRef.current.style.background =
          `radial-gradient(280px circle at ${gx}% ${gy}%, ${tool.accent}0.18), transparent 65%)`;
      }
    };
    const onLeave = () => {
      gsap.to(card, { rotateX: 0, rotateY: 0, ease: 'elastic.out(1,0.5)', duration: 0.8 });
    };
    card.addEventListener('mousemove',  onMove);
    card.addEventListener('mouseleave', onLeave);
    return () => {
      card.removeEventListener('mousemove',  onMove);
      card.removeEventListener('mouseleave', onLeave);
    };
  }, [tool.accent]);

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => tool.href && navigate(tool.href)}
      style={{ perspective: '800px', transformStyle: 'preserve-3d' }}
      className={`group relative overflow-hidden rounded-2xl border bg-[#0a0a14] p-6 transition-colors duration-300 ${hovered ? 'border-white/[0.14]' : 'border-white/[0.06]'} ${tool.href ? 'cursor-pointer' : ''}`}
    >
      {/* Mouse-tracked glow */}
      <div
        ref={glowRef}
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-400"
        style={{ opacity: hovered ? 1 : 0 }}
      />

      {/* Top-edge accent line */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg, transparent, ${tool.accentHex}90, transparent)`,
          opacity: hovered ? 1 : 0,
        }}
      />

      {/* Header row */}
      <div className="relative mb-5 flex items-start justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black tracking-[0.14em] uppercase ${tool.status === 'live' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-white/[0.08] bg-white/[0.03] text-slate-600'}`}>
          {tool.status === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          {tool.status === 'live' ? 'Live' : 'Coming Soon'}
        </span>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tool.grad}`}
          style={{ boxShadow: `0 4px 24px ${tool.accent}0.45)` }}
        >
          <tool.Icon className="h-5 w-5 text-white" strokeWidth={2} />
        </div>
      </div>

      {/* Text */}
      <div className="relative space-y-1.5 mb-4">
        <h3 className="text-[15px] font-black tracking-tight text-white">{tool.title}</h3>
        <p className="text-sm font-semibold text-slate-400">{tool.tagline}</p>
        <p className="pt-1 text-xs leading-relaxed text-slate-600">{tool.desc}</p>
      </div>

      {/* Tags */}
      <div className="relative mb-5 flex flex-wrap gap-1.5">
        {tool.tags.map(tag => (
          <span key={tag} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            {tag}
          </span>
        ))}
      </div>

      {/* CTA */}
      <div className="relative flex items-center gap-1.5 text-sm font-black" style={{ color: tool.href ? tool.accentHex : '#475569' }}>
        {tool.href
          ? <><span>Open Tool</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 duration-200" /></>
          : <><span>Notify Me</span><Zap className="h-4 w-4" /></>
        }
      </div>
    </div>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────── */
export default function Dashboard() {
  const locoRef  = useRef<LocomotiveScroll | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loco = new LocomotiveScroll({
      lenisOptions: {
        lerp: 0.07,
        smoothWheel: true,
        syncTouch: false,
      },
      initCustomTicker: (render) => {
        gsap.ticker.add(render);
        gsap.ticker.lagSmoothing(0);
      },
      destroyCustomTicker: (render) => {
        gsap.ticker.remove(render);
      },
    });
    locoRef.current = loco;

    loco.lenisInstance?.on('scroll', () => ScrollTrigger.update());
    ScrollTrigger.addEventListener('refresh', () => loco.resize());

    const ctx = gsap.context(() => {
      /* Navbar slide in */
      gsap.from('.d-nav', { y: -28, opacity: 0, duration: 0.8, ease: 'power3.out', delay: 0.1 });

      /* Badge */
      gsap.from('.d-badge', { scale: 0.7, opacity: 0, duration: 0.6, ease: 'back.out(2)', delay: 0.35 });

      /* Hero chars reveal — overflow-hidden on parent clips the y-slide */
      gsap.from('.d-char', {
        y: '110%',
        duration: 0.78,
        stagger: 0.016,
        ease: 'power4.out',
        delay: 0.5,
      });

      /* Hero sub + CTAs */
      gsap.from(['.d-sub', '.d-cta'], {
        y: 32, opacity: 0, duration: 0.7,
        stagger: 0.12, ease: 'power3.out', delay: 1.15,
      });

      /* Scroll indicator */
      gsap.from('.d-scroll-hint', { opacity: 0, duration: 0.6, delay: 1.85 });
      gsap.to('.d-scroll-arrow', { y: 7, repeat: -1, yoyo: true, duration: 0.9, ease: 'sine.inOut' });

      /* Orb floats */
      gsap.to('.d-orb-a', { y: -35, scale: 1.06, duration: 8,  repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.d-orb-b', { y:  30, scale: 0.94, duration: 11, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 2.5 });
      gsap.to('.d-orb-c', { y: -22, scale: 1.09, duration: 13, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 5 });

      /* Marquee pause on hover handled by CSS */

      /* Section labels scroll reveal */
      gsap.set('.d-reveal', { autoAlpha: 0, y: 38 });
      ScrollTrigger.batch('.d-reveal', {
        onEnter: batch => gsap.to(batch, {
          autoAlpha: 1, y: 0,
          stagger: 0.1, duration: 0.75, ease: 'power3.out',
        }),
        start: 'top 88%',
        once: true,
      });

      /* Tool cards cascade */
      gsap.set('.d-tool-card', { autoAlpha: 0, y: 55, scale: 0.96 });
      ScrollTrigger.batch('.d-tool-card', {
        onEnter: batch => gsap.to(batch, {
          autoAlpha: 1, y: 0, scale: 1,
          stagger: 0.075, duration: 0.7, ease: 'back.out(1.4)',
        }),
        start: 'top 88%',
        once: true,
      });

      /* Stats slide up */
      gsap.set('.d-stat', { autoAlpha: 0, y: 45 });
      ScrollTrigger.batch('.d-stat', {
        onEnter: batch => gsap.to(batch, {
          autoAlpha: 1, y: 0,
          stagger: 0.13, duration: 0.7, ease: 'power3.out',
        }),
        start: 'top 85%',
        once: true,
      });
    });

    ScrollTrigger.refresh();

    return () => {
      ctx.revert();
      loco.destroy();
      ScrollTrigger.getAll().forEach(t => t.kill());
      ScrollTrigger.removeEventListener('refresh', () => loco.resize());
    };
  }, []);

  const scrollToTools = () =>
    locoRef.current?.scrollTo('#d-tools', { duration: 1.3 });

  /* ─ Hero heading split helper ─ */
  const chars = (text: string, cls = 'text-white') =>
    text.split('').map((c, i) => (
      <span key={i} className={`d-char inline-block ${cls}`}>
        {c === ' ' ? ' ' : c}
      </span>
    ));

  return (
    <div className="bg-[#04040a] text-slate-100">
      <CustomCursor />

      {/* ── Navbar ────────────────────────────────────────────── */}
      <header className="d-nav fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-8 py-4">
        <div className="absolute inset-0 border-b border-white/[0.05] bg-[#04040a]/70 backdrop-blur-xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-700">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-[15px] font-black tracking-tight text-white">ContentForge</span>
        </div>
        <nav className="relative flex items-center gap-7">
          <button onClick={scrollToTools} className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-200">
            Tools
          </button>
          <button onClick={() => navigate('/article-generator')} className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-200">
            Generator
          </button>
          <button
            onClick={() => navigate('/article-generator')}
            className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-black text-white transition-colors hover:bg-violet-500"
            style={{ boxShadow: '0 0 22px rgba(124,58,237,0.4), 0 2px 12px rgba(0,0,0,0.4)' }}
          >
            Get Started
          </button>
        </nav>
      </header>

      {/* ══ HERO ══════════════════════════════════════════════════ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20">

        {/* ── Background ── */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {/* Grid */}
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
          }} />
          {/* Orbs */}
          <div className="d-orb-a absolute -top-80 left-1/2 h-[780px] w-[780px] -translate-x-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)' }} />
          <div className="d-orb-b absolute -bottom-40 -left-72 h-[560px] w-[560px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 70%)' }} />
          <div className="d-orb-c absolute right-[-15%] top-[15%] h-[420px] w-[420px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.11) 0%, transparent 70%)' }} />
          {/* Vignette */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, transparent 0%, #04040a 100%)' }} />
        </div>

        {/* ── Content ── */}
        <div className="relative z-10 mx-auto max-w-5xl text-center">

          {/* Badge */}
          <div className="d-badge mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/[0.07] px-4 py-1.5 text-[11px] font-black tracking-[0.18em] uppercase text-violet-400">
            <Sparkles className="h-3 w-3" />
            Content Creation Suite
          </div>

          {/* H1 */}
          <h1
            className="mb-6 select-none font-black leading-[0.9] tracking-tighter"
            style={{ fontSize: 'clamp(3.2rem, 9.5vw, 8.5rem)' }}
          >
            <span className="block overflow-hidden pb-2">
              {chars('ALL YOUR')}
            </span>
            <span className="block overflow-hidden pb-2">
              {chars('CONTENT ')}
              {'TOOLS'.split('').map((c, i) => (
                <span key={i} className="d-char inline-block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                  {c}
                </span>
              ))}
            </span>
            <span className="block overflow-hidden">
              {chars('ONE PLACE.', 'text-slate-700')}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="d-sub mx-auto mb-10 max-w-lg text-base leading-relaxed text-slate-500">
            AI-powered tools to create, optimize, and publish content at scale.
            One dashboard. Unlimited potential.
          </p>

          {/* CTAs */}
          <div className="d-cta flex items-center justify-center gap-4">
            <button
              onClick={() => navigate('/article-generator')}
              className="group flex items-center gap-2 rounded-2xl bg-violet-600 px-8 py-3.5 text-sm font-black text-white transition-all hover:bg-violet-500 hover:-translate-y-0.5"
              style={{ boxShadow: '0 0 30px rgba(124,58,237,0.5), 0 4px 24px rgba(0,0,0,0.4)' }}
            >
              Start Creating
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              onClick={scrollToTools}
              className="rounded-2xl border border-white/[0.1] bg-white/[0.04] px-8 py-3.5 text-sm font-black text-slate-300 transition-all hover:bg-white/[0.08] hover:text-white"
            >
              Explore Tools
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="d-scroll-hint absolute bottom-10 flex flex-col items-center gap-2 text-slate-700">
          <span className="text-[10px] font-black tracking-[0.22em] uppercase">Scroll</span>
          <ChevronDown className="d-scroll-arrow h-4 w-4" />
        </div>
      </section>

      {/* ══ MARQUEE ═══════════════════════════════════════════════ */}
      <div className="relative overflow-hidden border-y border-white/[0.05] py-5">
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32"
          style={{ background: 'linear-gradient(90deg, #04040a, transparent)' }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32"
          style={{ background: 'linear-gradient(270deg, #04040a, transparent)' }} />

        <div className="d-marquee-outer flex whitespace-nowrap">
          <div className="d-marquee-track flex shrink-0 items-center gap-10 pr-10">
            {[...MARQUEE_WORDS, ...MARQUEE_WORDS].map((w, i) => (
              <span key={i} className={`text-[11px] font-black tracking-[0.2em] uppercase ${w === '✦' ? 'text-violet-600 text-base' : 'text-slate-700'}`}>
                {w}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══ TOOLS GRID ════════════════════════════════════════════ */}
      <section id="d-tools" className="mx-auto max-w-7xl px-6 py-32">
        <div className="mb-16 text-center">
          <p className="d-reveal mb-3 text-[11px] font-black tracking-[0.22em] uppercase text-violet-500">
            The Toolkit
          </p>
          <h2 className="d-reveal text-4xl font-black tracking-tight text-white sm:text-5xl">
            Everything you need
          </h2>
          <p className="d-reveal mx-auto mt-4 max-w-md text-base text-slate-500">
            From ideation to publication — every step covered.
          </p>
        </div>

        {/* Card grid — perspective applied to grid so cards share vanishing point */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" style={{ perspective: '1200px' }}>
          {TOOLS.map(tool => (
            <div key={tool.id} className="d-tool-card">
              <ToolCard tool={tool} />
            </div>
          ))}
        </div>
      </section>

      {/* ══ STATS ═════════════════════════════════════════════════ */}
      <section className="border-y border-white/[0.05] px-6 py-24">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-12 text-center sm:grid-cols-3">
          {[
            { value: '1.2M+', label: 'Words Generated',    sub: 'and counting'      },
            { value: '48K+',  label: 'Articles Published', sub: 'across all niches' },
            { value: '6',     label: 'Tools & Growing',    sub: 'new tools monthly' },
          ].map(stat => (
            <div key={stat.value} className="d-stat">
              <div
                className="mb-1 text-5xl font-black tracking-tight"
                style={{ background: 'linear-gradient(135deg, #fff 30%, #7c3aed 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                {stat.value}
              </div>
              <div className="mb-0.5 text-sm font-black text-slate-300">{stat.label}</div>
              <div className="text-xs text-slate-600">{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ CTA BANNER ════════════════════════════════════════════ */}
      <section className="px-6 py-28 text-center">
        <div className="d-reveal mx-auto max-w-2xl">
          <h2 className="mb-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Ready to build<br />
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              faster content?
            </span>
          </h2>
          <p className="mb-8 text-base text-slate-500">
            Start with the Article Generator today — more tools unlock soon.
          </p>
          <button
            onClick={() => navigate('/article-generator')}
            className="group inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-9 py-4 text-base font-black text-white transition-all hover:bg-violet-500 hover:-translate-y-0.5"
            style={{ boxShadow: '0 0 40px rgba(124,58,237,0.5), 0 4px 30px rgba(0,0,0,0.5)' }}
          >
            Open Article Generator
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.05] px-8 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-700">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-black text-slate-600">ContentForge</span>
          </div>
          <p className="text-xs text-slate-700">© 2026 ContentForge · All tools, one place.</p>
          <div className="flex items-center gap-5">
            <button onClick={() => navigate('/article-generator')} className="text-xs text-slate-600 transition-colors hover:text-slate-400">
              Article Generator
            </button>
            <span className="text-slate-800">·</span>
            <span className="text-xs text-slate-700">More coming soon</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

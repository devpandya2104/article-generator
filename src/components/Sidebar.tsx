import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, Sheet, Home, Zap } from 'lucide-react';

const NAV = [
  { label: 'Dashboard',         href: '/',                       Icon: Home,     accent: '#a855f7' },
  { label: 'Article Generator', href: '/article-generator',      Icon: Sparkles, accent: '#8b5cf6' },
  { label: 'Sheet Gen (GPT)',   href: '/sheet-generator-openai', Icon: Sheet,    accent: '#0ea5e9' },
] as const;

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-50 flex w-48 flex-col border-r border-white/[0.06] bg-[#04040a]">
      {/* Logo — also a home button */}
      <button
        onClick={() => navigate('/')}
        className="flex h-[61px] shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4 transition-opacity hover:opacity-80"
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#c026d3)', boxShadow: '0 0 14px rgba(124,58,237,0.45)' }}
        >
          <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-sm font-black tracking-tight text-white">ContentForge</span>
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 pt-3">
        <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.2em] text-slate-700">Navigation</p>
        <div className="space-y-0.5">
          {NAV.map(({ label, href, Icon, accent }) => {
            const active = href === '/' ? pathname === '/' : pathname === href;
            return (
              <button
                key={href}
                onClick={() => navigate(href)}
                className={`relative w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-all ${
                  active
                    ? 'bg-white/[0.07] text-white'
                    : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                }`}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r"
                    style={{ background: accent }}
                  />
                )}
                <Icon
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: active ? accent : undefined }}
                />
                <span className="leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

import { useState } from 'react';
import { LogIn, Loader2, AlertCircle, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ProfileWidget from './ProfileWidget';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, signIn } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  if (isLoggedIn) return (
    <>
      {children}
      <ProfileWidget />
    </>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true); setError('');
    const err = await signIn(email.trim(), password);
    if (err) { setError(err); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#04040a] flex items-center justify-center px-4">
      {/* Subtle background */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-96 -left-96 w-[900px] h-[900px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-96 -right-96 w-[800px] h-[800px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(14,116,144,0.08) 0%, transparent 70%)' }} />
        <div className="absolute inset-0"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 32px rgba(124,58,237,0.5)' }}>
            <Zap className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">ContentForge</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to access your tools</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.1] bg-[#0e0e1a] p-7 shadow-2xl">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Email
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Password
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="mt-1 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-white disabled:opacity-40 transition-all"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: loading ? 'none' : '0 0 24px rgba(124,58,237,0.4)' }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</>
                : <><LogIn className="h-4 w-4" />Sign In</>
              }
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          Access is limited to authorised team members.
        </p>
      </div>
    </div>
  );
}

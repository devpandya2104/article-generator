import { useState } from 'react';
import { User, X, Lock, Eye, EyeOff, Loader2, Check, LogOut, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type View = 'menu' | 'password';

export default function ProfileWidget() {
  const { session, signOut } = useAuth();
  const [open, setOpen]           = useState(false);
  const [view, setView]           = useState<View>('menu');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');

  const email    = session?.user?.email ?? '';
  const initials = email ? email[0].toUpperCase() : '?';

  const close = () => {
    setOpen(false);
    setTimeout(() => {
      setView('menu');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setError(''); setSuccess(false);
    }, 200);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(false);

    if (newPw.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      // Re-authenticate first to verify current password
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: currentPw });
      if (signInErr) { setError('Current password is incorrect.'); setLoading(false); return; }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw updateErr;

      setSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Floating trigger button ── */}
      <button
        onClick={() => setOpen(true)}
        title={email}
        className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.15] bg-[#0e0e1a] text-sm font-black text-slate-300 shadow-lg backdrop-blur transition-all hover:border-violet-500/40 hover:text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]"
        style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.5)' }}
      >
        {initials}
      </button>

      {/* ── Modal ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6 sm:items-center sm:justify-end"
          onClick={e => { if (e.target === e.currentTarget) close(); }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />

          <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[#0e0e1a] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-sm font-black text-violet-300">
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-black text-white leading-none">{email}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Signed in</p>
                </div>
              </div>
              <button onClick={close} className="text-slate-600 hover:text-slate-300 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Menu view ── */}
            {view === 'menu' && (
              <div className="p-3 space-y-1">
                <button
                  onClick={() => setView('password')}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors text-left"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05]">
                    <Lock className="h-4 w-4 text-violet-400" />
                  </div>
                  Change Password
                </button>
                <div className="mx-1 border-t border-white/[0.05]" />
                <button
                  onClick={() => { close(); signOut(); }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-500/[0.07] transition-colors text-left"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05]">
                    <LogOut className="h-4 w-4 text-red-400" />
                  </div>
                  Sign Out
                </button>
              </div>
            )}

            {/* ── Change password view ── */}
            {view === 'password' && (
              <div className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <button onClick={() => { setView('menu'); setError(''); setSuccess(false); }}
                    className="text-[10px] font-bold text-slate-600 hover:text-slate-400 transition-colors">
                    ← Back
                  </button>
                  <span className="text-slate-700">/</span>
                  <span className="text-xs font-black text-slate-300">Change Password</span>
                </div>

                {success ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
                      <Check className="h-6 w-6 text-emerald-400" />
                    </div>
                    <p className="text-sm font-black text-white">Password updated!</p>
                    <p className="text-xs text-slate-500">Your new password is active.</p>
                    <button onClick={() => setView('menu')}
                      className="mt-2 rounded-xl border border-white/[0.08] px-5 py-2 text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors">
                      Done
                    </button>
                  </div>
                ) : (
                  <form onSubmit={changePassword} className="space-y-4">
                    {/* Current password */}
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrent ? 'text' : 'password'}
                          value={currentPw}
                          onChange={e => setCurrentPw(e.target.value)}
                          required autoFocus
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 pr-10 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-violet-500/50 transition-colors"
                        />
                        <button type="button" tabIndex={-1}
                          onClick={() => setShowCurrent(p => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                          {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* New password */}
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showNew ? 'text' : 'password'}
                          value={newPw}
                          onChange={e => setNewPw(e.target.value)}
                          required minLength={6}
                          placeholder="Min. 6 characters"
                          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 pr-10 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-violet-500/50 transition-colors"
                        />
                        <button type="button" tabIndex={-1}
                          onClick={() => setShowNew(p => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                          {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm password */}
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirm ? 'text' : 'password'}
                          value={confirmPw}
                          onChange={e => setConfirmPw(e.target.value)}
                          required
                          placeholder="••••••••"
                          className={`w-full rounded-xl border px-4 py-3 pr-10 text-sm placeholder-slate-700 outline-none transition-colors ${
                            confirmPw && newPw !== confirmPw
                              ? 'border-red-500/40 bg-red-500/[0.05] text-red-300'
                              : 'border-white/[0.08] bg-white/[0.04] text-slate-200 focus:border-violet-500/50'
                          }`}
                        />
                        <button type="button" tabIndex={-1}
                          onClick={() => setShowConfirm(p => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-xs text-red-400">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !currentPw || !newPw || !confirmPw || newPw !== confirmPw}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-white disabled:opacity-40 transition-all"
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: loading ? 'none' : '0 0 20px rgba(124,58,237,0.35)' }}
                    >
                      {loading
                        ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</>
                        : <><Lock className="h-4 w-4" />Update Password</>
                      }
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

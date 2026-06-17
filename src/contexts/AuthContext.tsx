import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export const ADMIN_UIDS = new Set([
  '62088ba7-48d4-42dc-9796-194f7a0bc528', // dev.p@amrytt.com
  'e7a39152-5c7b-4046-8fc1-40adf330bd75', // shreya.s@amrytt.com
]);

interface AuthContextValue {
  session: Session | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null, isLoggedIn: false, isAdmin: false,
  signIn: async () => null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  const isLoggedIn = !!session;
  const isAdmin    = isLoggedIn && ADMIN_UIDS.has(session?.user?.id ?? '');

  return (
    <AuthContext.Provider value={{ session, isLoggedIn, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

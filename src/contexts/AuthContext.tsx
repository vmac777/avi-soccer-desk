import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

export type Role = 'admin' | 'intern' | 'super_admin';

interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isIntern: boolean;
  loading: boolean;
  displayName: string;
  userName: string;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; profile?: Profile | null }>;
  signOut: () => Promise<void>;
  /**
   * Re-read the profile after it changes.
   *
   * It is fetched once when the session appears and then held, so setting your
   * own name updated the row and left the greeting saying the old one until a
   * reload. Nothing else can invalidate it — this is not react-query.
   */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
      if (sess?.user) {
        // Defer profile fetch to avoid deadlock per Supabase guidance
        setTimeout(async () => {
          const p = await fetchProfile(sess.user.id);
          if (mounted) {
            setProfile(p);
            setLoading(false);
          }
        }, 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: sess } }) => {
      if (!mounted) return;
      setSession(sess);
      if (sess?.user) {
        const p = await fetchProfile(sess.user.id);
        if (mounted) {
          setProfile(p);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    let p: Profile | null = null;
    if (data.user) {
      p = await fetchProfile(data.user.id);
      setProfile(p);
    }
    return { error: null, profile: p };
  }, []);

  const refreshProfile = useCallback(async () => {
    const id = session?.user?.id;
    if (!id) return;
    const p = await fetchProfile(id);
    setProfile(p);
  }, [session?.user?.id]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    queryClient.clear();
  }, [queryClient]);

  const role = profile?.role ?? null;
  const user = session?.user ?? null;

  const userName = user?.email?.split('@')[0] || 'User';
  // profiles.full_name when set, otherwise the email local-part. This used to
  // carry a hardcoded email -> first-name map for one specific desk.
  const displayName = profile?.full_name?.trim() || userName;

  const value: AuthContextValue = {
    session,
    user,
    profile,
    role,
    isAdmin: role === 'admin' || role === 'super_admin',
    isSuperAdmin: role === 'super_admin',
    isIntern: role === 'intern',
    loading,
    displayName,
    userName,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

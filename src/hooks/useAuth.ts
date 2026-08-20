import { useAuthContext } from '@/contexts/AuthContext';

export function useAuth() {
  const ctx = useAuthContext();
  return {
    session: ctx.session,
    loading: ctx.loading,
    signIn: async (email: string, password: string) => {
      const res = await ctx.signIn(email, password);
      return { error: res.error };
    },
    signOut: ctx.signOut,
    userName: ctx.userName,
    displayName: ctx.displayName,
    isAdmin: ctx.isAdmin,
    isSuperAdmin: ctx.isSuperAdmin,
    isIntern: ctx.isIntern,
    role: ctx.role,
    profile: ctx.profile,
  };
}

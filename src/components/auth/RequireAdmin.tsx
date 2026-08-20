import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';

const Spinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <span className="text-muted-foreground font-mono text-sm">Loading...</span>
  </div>
);

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuthContext();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  // Wait for profile to resolve before deciding (avoid flicker/loop)
  if (!profile) return <Spinner />;
  if (profile.role !== 'admin' && profile.role !== 'super_admin') return <Navigate to="/news" replace />;
  return <>{children}</>;
}

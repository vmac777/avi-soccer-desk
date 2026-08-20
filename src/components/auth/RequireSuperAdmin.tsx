import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';

const Spinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <span className="text-muted-foreground font-mono text-sm">Loading...</span>
  </div>
);

export default function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuthContext();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <Spinner />;
  if (profile.role !== 'super_admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { CLIENT } from '@/config/client';
import BrandMark from '@/components/BrandMark';

const LoginPage = () => {
  const { signIn, session, profile, loading } = useAuthContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // If already signed in, route by role
  if (!loading && session && profile) {
    return <Navigate to={profile.role === 'intern' ? '/news' : '/'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: signInError, profile: p } = await signIn(email, password);
    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }
    if (!p) {
      await supabase.auth.signOut();
      setError('Account profile not found. Contact an admin.');
      setSubmitting(false);
      return;
    }
    if (p.role === 'admin' || p.role === 'super_admin') {
      navigate('/', { replace: true });
    } else if (p.role === 'intern') {
      navigate('/news', { replace: true });
    } else {
      await supabase.auth.signOut();
      setError('Account role is not configured. Contact an admin.');
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm p-8 bg-card rounded-lg border border-border">
        <div className="flex flex-col items-center text-center mb-8">
          <BrandMark height={56} className="mb-4" />
          <h1 className="text-xl font-medium text-foreground tracking-tight">
            {CLIENT.deskName}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-background border-border text-foreground placeholder:text-muted-foreground"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-background border-border text-foreground placeholder:text-muted-foreground"
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;

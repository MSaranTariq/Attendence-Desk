'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fn = mode === 'login'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });

    const { data, error } = await fn;
    setLoading(false);

    if (error) {
      setError(error.message === 'Email not confirmed'
        ? 'Please confirm your email address before logging in.'
        : error.message);
      return;
    }

    if (mode === 'signup' && !data.session) {
      setError('Account created. Check your email to confirm your address, then log in.');
      setMode('login');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div className="card">
        <h1 style={{ fontSize: 20, marginTop: 0 }}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </h1>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" required value={email}
              onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" required value={password}
              onChange={e => setPassword(e.target.value)} minLength={6} />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 16 }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'signup' : 'login'); }}>
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </a>
        </p>
      </div>
    </div>
  );
}

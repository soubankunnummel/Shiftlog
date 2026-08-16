'use client';

import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';

const ACCENT = '#3B5BDB';
const BG = '#F6F5F2';
const BORDER = '#E4E1D8';
const INK = '#1C1C1E';
const MUTED = '#6B7280';

export default function AuthScreen() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      if (isAdmin) {
        await signIn('admin', formData);
      } else {
        formData.set('flow', mode);
        await signIn('password', formData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{ background: BG, color: INK, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border p-6" style={{ background: 'white', borderColor: BORDER }}>
        <h1 className="text-xl font-semibold tracking-tight">Shiftlog</h1>
        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
          Part-time hours &amp; timesheet tracker
        </p>

        <div className="flex gap-2 mt-5 mb-4">
          <button
            type="button"
            onClick={() => { setIsAdmin(false); setError(null); }}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium border"
            style={{ borderColor: isAdmin ? BORDER : ACCENT, background: isAdmin ? 'white' : '#EFF3FC', color: isAdmin ? MUTED : ACCENT }}
          >
            User
          </button>
          <button
            type="button"
            onClick={() => { setIsAdmin(true); setError(null); }}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium border"
            style={{ borderColor: isAdmin ? ACCENT : BORDER, background: isAdmin ? '#EFF3FC' : 'white', color: isAdmin ? ACCENT : MUTED }}
          >
            Admin
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs" style={{ color: MUTED }}>Email</label>
            <input
              name="email" type="email" required autoComplete="email"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: BORDER }}
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: MUTED }}>Password</label>
            <input
              name="password" type={showPassword ? "text" : "password"} required
              autoComplete={isAdmin || mode === 'signIn' ? 'current-password' : 'new-password'}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: BORDER }}
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="showPassword"
              checked={showPassword}
              onChange={() => setShowPassword(!showPassword)}
              className="mr-2"
            />
            <label htmlFor="showPassword" className="text-xs" style={{ color: MUTED }}>
              Show password
            </label>
          </div>
          {!isAdmin && (
            <button
              type="button"
              onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
              className="text-xs underline" style={{ color: MUTED }}
            >
              {mode === 'signIn' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </button>
          )}
          {error && <p className="text-xs" style={{ color: '#B5342F' }}>{error}</p>}
          <button
            type="submit" disabled={busy}
            className="w-full px-4 py-2.5 rounded-lg font-medium text-white text-sm disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {busy ? 'Please wait…' : isAdmin ? 'Admin sign in' : mode === 'signIn' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

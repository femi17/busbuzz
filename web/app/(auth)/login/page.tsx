'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError('Incorrect email or password. Please try again.');
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email) {
      setError('Enter your email address first.');
      return;
    }
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      // Supabase sends a recovery link; it lands on /reset-password where the
      // admin sets a new password. This URL must be in Supabase Auth →
      // URL Configuration → Redirect URLs.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setResetSent(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="overflow-hidden rounded-[20px] bg-white shadow-[0_30px_70px_-24px_rgba(0,0,0,0.65)]"
    >
      <div aria-hidden className="h-1.5 hazard-stripe" />
      <div className="p-8">
      {mode === 'reset' ? (
        <>
          <h1 className="mb-1 font-heading text-[22px] font-bold tracking-tight text-ink">
            Reset your password
          </h1>
          <p className="mb-6 text-sm text-sub">
            {resetSent
              ? 'If an account exists for that email, a reset link is on its way. Check your inbox.'
              : 'Enter your email and we’ll send you a link to set a new password.'}
          </p>

          {!resetSent && (
            <form onSubmit={handleReset} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="reset-email" className="text-sm font-medium text-navy">
                  Email
                </label>
                <div className="relative">
                  <Mail size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35" />
                  <input
                    id="reset-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-navy/15 py-2 pl-9 pr-3 text-sm text-navy outline-none focus:border-amber focus:ring-2 focus:ring-amber/40"
                  />
                </div>
              </div>

              {error && (
                <p className="flex items-center gap-2 rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop">
                  <AlertCircle size={16} strokeWidth={1.75} className="shrink-0" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 flex items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-amber px-4 py-3 text-sm font-bold text-night transition-all hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 shadow-[0_12px_28px_-12px_rgba(255,201,0,0.55)]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} strokeWidth={2} className="animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    Send reset link
                    <ArrowRight size={16} strokeWidth={2} />
                  </>
                )}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setResetSent(false);
              setError(null);
            }}
            className="mt-5 text-sm font-medium text-navy/60 transition-colors hover:text-amber-dark"
          >
            ← Back to sign in
          </button>
        </>
      ) : (
      <>
      <h1 className="mb-1 font-heading text-[22px] font-bold tracking-tight text-ink">
        Sign in to your school
      </h1>
      <p className="mb-6 text-sm text-sub">
        Manage your buses, routes, and students from one dashboard.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-navy">
            Email
          </label>
          <div className="relative">
            <Mail
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35"
            />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-navy/15 py-2 pl-9 pr-3 text-sm text-navy outline-none focus:border-amber focus:ring-2 focus:ring-amber/40"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-navy">
              Password
            </label>
            <button
              type="button"
              onClick={() => {
                setMode('reset');
                setError(null);
              }}
              className="text-[13px] font-medium text-navy/55 transition-colors hover:text-amber-dark"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35"
            />
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-navy/15 py-2 pl-9 pr-3 text-sm text-navy outline-none focus:border-amber focus:ring-2 focus:ring-amber/40"
            />
          </div>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop"
          >
            <AlertCircle size={16} strokeWidth={1.75} className="shrink-0" />
            {error}
          </motion.p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 flex items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-amber px-4 py-3 text-sm font-bold text-night transition-all hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 shadow-[0_12px_28px_-12px_rgba(255,201,0,0.55)]"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} strokeWidth={2} className="animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight size={16} strokeWidth={2} />
            </>
          )}
        </button>
      </form>
      </>
      )}
      </div>
    </motion.div>
  );
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, AlertCircle, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

// The recovery link from the password-reset email lands here. Supabase's client
// picks up the recovery token from the URL and establishes a temporary session,
// which lets updateUser({ password }) set the new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // A PASSWORD_RECOVERY event fires when the recovery link is opened; a plain
    // existing session (already signed in) also lets the user set a password.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidLink(true);
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValidLink(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/dashboard'), 1500);
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
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={40} className="text-green" />
            <h1 className="font-heading text-[20px] font-bold text-ink">Password updated</h1>
            <p className="text-sm text-sub">Taking you to your dashboard…</p>
          </div>
        ) : !ready ? (
          <div className="flex items-center justify-center py-10 text-sub">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : !validLink ? (
          <div className="flex flex-col gap-3 text-center">
            <h1 className="font-heading text-[20px] font-bold text-ink">Link expired</h1>
            <p className="text-sm text-sub">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <a
              href="/login"
              className="mt-2 inline-flex items-center justify-center rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-bold text-night"
            >
              Back to sign in
            </a>
          </div>
        ) : (
          <>
            <h1 className="mb-1 font-heading text-[22px] font-bold tracking-tight text-ink">
              Set a new password
            </h1>
            <p className="mb-6 text-sm text-sub">Choose a password you’ll remember.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-password" className="text-sm font-medium text-navy">New password</label>
                <div className="relative">
                  <Lock size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35" />
                  <input
                    id="new-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-navy/15 py-2 pl-9 pr-3 text-sm text-navy outline-none focus:border-amber focus:ring-2 focus:ring-amber/40"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirm-password" className="text-sm font-medium text-navy">Confirm password</label>
                <div className="relative">
                  <Lock size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35" />
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
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
                    Updating…
                  </>
                ) : (
                  <>
                    Update password
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

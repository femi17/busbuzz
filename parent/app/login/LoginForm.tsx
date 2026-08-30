"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./onboarding.module.css";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_S = 30;

/**
 * Two-step email OTP sign-in, mirroring the native parent app's flow:
 * signInWithOtp (shouldCreateUser: false — parents are pre-registered by
 * their school) followed by a 6-digit verifyOtp. No magic links: an
 * installed PWA opens links in the browser tab, not the standalone app,
 * so a typed code is the only flow that keeps the parent inside the app.
 */
export default function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCooldown() {
    setResendIn(RESEND_COOLDOWN_S);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1 && cooldownRef.current) clearInterval(cooldownRef.current);
        return Math.max(0, s - 1);
      });
    }, 1000);
  }

  async function sendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        setError(
          otpError.message.toLowerCase().includes("signups")
            ? "That email isn't registered with a school yet. Ask your school admin to add you."
            : "Couldn't send the code. Check the email and try again.",
        );
        return;
      }

      setEmail(trimmed);
      setStep("code");
      setCode("");
      startCooldown();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (code.trim().length < 6) return;

    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });

      if (verifyError || !data.user) {
        setError("That code didn't work. Check it and try again.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendCode();
        }}
      >
        <div className={styles.field}>
          <label htmlFor="email">YOUR EMAIL</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@email.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.cta} type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send me a code"}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <p className={styles.fine}>No password. We email you a 6-digit code.</p>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        verifyCode();
      }}
    >
      <div className={styles.field}>
        <label htmlFor="code">CODE SENT TO {email.toUpperCase()}</label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          className={styles.codeInput}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
          required
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <button className={styles.cta} type="submit" disabled={busy || code.length < 6}>
        {busy ? "Checking…" : "Sign in"}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
      <p className={styles.fine}>
        {resendIn > 0 ? (
          <>Didn&apos;t get it? Resend in {resendIn}s</>
        ) : (
          <button type="button" className={styles.linkBtn} onClick={sendCode} disabled={busy}>
            Resend code
          </button>
        )}
        {" · "}
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => {
            setStep("email");
            setError(null);
          }}
        >
          Change email
        </button>
      </p>
    </form>
  );
}

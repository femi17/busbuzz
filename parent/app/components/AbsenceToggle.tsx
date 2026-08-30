"use client";

import { useEffect, useState } from "react";
import styles from "../track.module.css";
import { createClient } from "@/lib/supabase/client";

type Step = "loading" | "idle" | "confirm" | "busy" | "absent" | "confirmCancel";

/**
 * "Not going today" — parent-reported absence for the selected child.
 * Mirrors the native toggle: both directions require an explicit confirm
 * (reporting tells the driver to skip a real pickup if tapped by mistake;
 * cancelling right before a trip means the bus WILL stop again), and it
 * only renders while no trip is running. Backed by the report-absence
 * edge function + the student_absences table.
 */
export default function AbsenceToggle({
  studentId,
  firstName,
}: {
  studentId: string;
  firstName: string;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStep("loading");
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    createClient()
      .from("student_absences")
      .select("id")
      .eq("student_id", studentId)
      .eq("absence_date", today)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setStep(data ? "absent" : "idle");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function submit(action: "report" | "cancel") {
    setStep("busy");
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("no session");

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report-absence`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ studentId, action }),
        },
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error ?? "failed");
      }
      setStep(action === "report" ? "absent" : "idle");
    } catch (e) {
      setError(
        e instanceof Error && e.message !== "failed" && e.message !== "no session"
          ? e.message
          : "Couldn't update. Please try again.",
      );
      setStep(action === "report" ? "idle" : "absent");
    }
  }

  if (step === "loading") return null;

  if (step === "confirm" || step === "confirmCancel") {
    const reporting = step === "confirm";
    return (
      <div className={`${styles.absence} ${styles.absenceConfirm}`}>
        <div className={styles.absenceText}>
          {reporting ? (
            <>
              <b>{firstName} isn&apos;t going today?</b> The school and driver will be
              told not to stop for them. You can undo this before the trip.
            </>
          ) : (
            <>
              <b>{firstName} is going after all?</b> The driver will be told to stop
              for them again today.
            </>
          )}
        </div>
        <div className={styles.absenceActions}>
          <button
            type="button"
            className={styles.absenceGhost}
            onClick={() => setStep(reporting ? "idle" : "absent")}
          >
            Cancel
          </button>
          <button
            type="button"
            className={reporting ? styles.absenceDanger : styles.absencePrimary}
            onClick={() => submit(reporting ? "report" : "cancel")}
          >
            {reporting ? "Yes, not going" : "Yes, going today"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "absent") {
    return (
      <div className={`${styles.absence} ${styles.absenceOn}`}>
        <div className={styles.absenceText}>
          <b>Not going today</b> — the driver won&apos;t stop for {firstName}.
          {error ? ` ${error}` : ""}
        </div>
        <button
          type="button"
          className={styles.absenceGhost}
          onClick={() => setStep("confirmCancel")}
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className={styles.absence}>
      <div className={styles.absenceText}>
        {error ? (
          <b>{error}</b>
        ) : (
          <>Sick day or staying home? Tell the driver not to stop.</>
        )}
      </div>
      <button
        type="button"
        className={styles.absenceGhost}
        disabled={step === "busy"}
        onClick={() => setStep("confirm")}
      >
        {step === "busy" ? "Saving…" : "Not going?"}
      </button>
    </div>
  );
}

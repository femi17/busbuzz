"use client";

import { useEffect, useState } from "react";
import styles from "../track.module.css";

function fmt(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * The bus-stop countdown board. Ticks down to arrival every second.
 * `etaSeconds` is the live estimate; when real data is wired it will be
 * recomputed from GPS + route on each location broadcast.
 */
export default function CountdownBoard({
  etaSeconds,
  stopName,
  studentName,
}: {
  etaSeconds: number;
  stopName: string;
  studentName: string;
}) {
  const [remaining, setRemaining] = useState(etaSeconds);

  useEffect(() => {
    setRemaining(etaSeconds);
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [etaSeconds]);

  const arriving = remaining <= 30;

  return (
    <section className={styles.board} aria-live="polite">
      <div className={styles.eyebrow}>
        <span className={styles.livedot} />
        {arriving ? "ARRIVING NOW" : "ARRIVES IN"}
      </div>
      <div className={styles.time}>
        {fmt(remaining)}
        <small>min</small>
      </div>
      <div className={styles.where}>
        at <b>{stopName}</b> · {studentName}&apos;s stop
      </div>
    </section>
  );
}

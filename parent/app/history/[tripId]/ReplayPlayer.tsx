"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import styles from "./replay.module.css";
import type { ReplayData } from "./page";

// Whole replay plays back in ~45 seconds regardless of trip length; the
// slider scrubs to any moment.
const PLAYBACK_SECONDS = 45;

function fmtClock(ms: number, startedAt: string): string {
  return new Date(new Date(startedAt).getTime() + ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Bus position at time t: linear interpolation between breadcrumbs. */
function positionAt(points: ReplayData["points"], t: number): [number, number] | null {
  if (points.length === 0) return null;
  if (t <= points[0].t) return [points[0].lng, points[0].lat];
  const last = points[points.length - 1];
  if (t >= last.t) return [last.lng, last.lat];
  // Points are ordered by t; find the segment containing t.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return [a.lng + (b.lng - a.lng) * f, a.lat + (b.lat - a.lat) * f];
}

export default function ReplayPlayer({
  data,
  myStopIds,
}: {
  data: ReplayData;
  myStopIds: string[];
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const busMarkerRef = useRef<Marker | null>(null);
  const stopElsRef = useRef<Record<string, HTMLElement>>({});
  const [ready, setReady] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  const duration = Math.max(data.durationMs, 1);
  const mineSet = useMemo(() => new Set(myStopIds), [myStopIds]);

  // ── Map setup (once) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !containerRef.current || data.points.length === 0) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = token;

      const lngs = data.points.map((p) => p.lng);
      const lats = data.points.map((p) => p.lat);
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        bounds: [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        fitBoundsOptions: { padding: 44 },
        attributionControl: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        // Full route trace, muted — the yellow progress line grows over it.
        map.addSource("full-path", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: data.points.map((p) => [p.lng, p.lat]),
            },
          },
        });
        map.addLayer({
          id: "full-path-line",
          type: "line",
          source: "full-path",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#1A1712", "line-width": 3, "line-opacity": 0.18 },
        });
        map.addSource("progress-path", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
        });
        map.addLayer({
          id: "progress-path-line",
          type: "line",
          source: "progress-path",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#F4B01A", "line-width": 4 },
        });

        for (const stop of data.stops) {
          const el = document.createElement("div");
          el.className = mineSet.has(stop.id)
            ? `${styles.stopDot} ${styles.stopMine}`
            : styles.stopDot;
          el.title = stop.name;
          stopElsRef.current[stop.id] = el;
          new mapboxgl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map);
        }

        const busEl = document.createElement("div");
        busEl.className = styles.busDot;
        busMarkerRef.current = new mapboxgl.Marker({ element: busEl })
          .setLngLat([data.points[0].lng, data.points[0].lat])
          .addTo(map);

        setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      busMarkerRef.current = null;
      stopElsRef.current = {};
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Playback clock ───────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const delta = now - last;
      last = now;
      setT((prev) => {
        const next = prev + (delta / (PLAYBACK_SECONDS * 1000)) * duration;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  // ── Apply t to the map ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const pos = positionAt(data.points, t);
    if (pos) busMarkerRef.current?.setLngLat(pos);

    const done = data.points.filter((p) => p.t <= t).map((p) => [p.lng, p.lat]);
    if (pos) done.push(pos);
    const source = map.getSource("progress-path") as GeoJSONSource | undefined;
    source?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: done },
    });

    for (const stop of data.stops) {
      const el = stopElsRef.current[stop.id];
      if (!el) continue;
      el.classList.toggle(styles.stopReached, stop.arrivedT != null && stop.arrivedT <= t);
    }
  }, [t, ready, data]);

  if (data.points.length === 0) {
    return (
      <div className={styles.noData}>
        No GPS was recorded for this trip, so there&apos;s nothing to replay.
      </div>
    );
  }

  // Timeline mixes stop arrivals and the child's own events, in time order.
  const moments = [
    ...data.stops
      .filter((s) => s.arrivedT != null)
      .map((s) => ({
        t: s.arrivedT!,
        label: `Reached ${s.name}`,
        mine: mineSet.has(s.id),
      })),
    ...data.events.map((e) => ({
      t: e.t,
      label:
        e.status === "BOARDED"
          ? `${e.studentName} boarded`
          : e.status === "DROPPED_OFF"
            ? `${e.studentName} dropped off`
            : `${e.studentName} marked absent`,
      mine: true,
    })),
  ].sort((a, b) => a.t - b.t);

  return (
    <>
      <div className={styles.map}>
        {token ? (
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        ) : (
          <div className={styles.noToken}>Map unavailable — missing Mapbox token.</div>
        )}
        <div className={styles.clock}>{fmtClock(t, data.startedAt)}</div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={() => {
            if (!playing && t >= duration) setT(0);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "Pause replay" : "Play replay"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6a1 1 0 011.5-.87l10 5.9a1 1 0 010 1.73l-10 5.9A1 1 0 018 17.4z" /></svg>
          )}
        </button>
        <input
          type="range"
          className={styles.scrubber}
          min={0}
          max={duration}
          step={1000}
          value={Math.round(t)}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          aria-label="Scrub through the trip"
        />
        <span className={styles.elapsed}>
          {fmtElapsed(t)}<small> / {fmtElapsed(duration)}</small>
        </span>
      </div>

      <div className={styles.summary}>
        <div><b>{data.busPlateNumber}</b> · started {fmtClock(0, data.startedAt)}
          {data.endedAt ? ` · ended ${fmtClock(duration, data.startedAt)}` : ""}</div>
      </div>

      {moments.length > 0 && (
        <div className={styles.moments}>
          {moments.map((m, i) => {
            const passed = m.t <= t;
            return (
              <button
                key={i}
                type="button"
                className={`${styles.moment} ${passed ? styles.momentPassed : ""} ${m.mine ? styles.momentMine : ""}`}
                onClick={() => {
                  setPlaying(false);
                  setT(m.t);
                }}
              >
                <span className={styles.momentTime}>{fmtClock(m.t, data.startedAt)}</span>
                <span className={styles.momentLabel}>{m.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

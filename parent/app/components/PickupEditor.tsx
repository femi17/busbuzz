"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { OSM_STYLE } from "../../lib/osm";
import styles from "../track.module.css";
import { createClient } from "@/lib/supabase/client";

type LngLat = [number, number];

/**
 * "Fix your pickup spot" — a small map with a draggable pin, shown while
 * no trip is running. The pin starts at the saved pickup location (or the
 * assigned stop / school until one is saved) and persists through the
 * update-pickup-location edge function, which is what the driver app
 * navigates to. Mirrors the native Track screen's drag-to-fix pin.
 */
export default function PickupEditor({
  studentId,
  initial,
  hasSaved,
}: {
  studentId: string;
  /** [lng, lat] — saved pickup, else assigned stop, else school. */
  initial: LngLat;
  /** Whether `initial` is an already-saved pickup spot (vs a default). */
  hasSaved: boolean;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_STYLE,
        center: initial,
        zoom: 15,
        attributionControl: false,
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      mapRef.current = map;

      const el = document.createElement("div");
      el.className = styles.pickupPin;
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(initial)
        .addTo(map);
      markerRef.current = marker;

      marker.on("dragend", () => {
        setDirty(true);
        setSaved(false);
        setError(null);
      });
    })();

    return () => {
      cancelled = true;
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The editor is keyed by student in TrackLive — initial never changes
    // within one mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    markerRef.current?.setLngLat(initial);
    mapRef.current?.easeTo({ center: initial, duration: 500 });
    setDirty(false);
    setError(null);
  }

  async function save() {
    const pos = markerRef.current?.getLngLat();
    if (!pos) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired. Log in again.");

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-pickup-location`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ studentId, lat: pos.lat, lng: pos.lng }),
        },
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(
          typeof err?.error === "string"
            ? err.error
            : "Couldn't save — check your connection and try again.",
        );
      }

      setDirty(false);
      setSaved(true);
      // Refresh the server-fetched student so the new spot sticks on nav.
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.pickup}>
      <div className={styles.pickupMap}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      </div>
      <div className={styles.pickupBar}>
        {saved ? (
          <span className={styles.pickupSaved}>Pickup spot saved</span>
        ) : dirty ? (
          <>
            <span className={styles.pickupHint}>
              {error ?? "Save this as the new pickup spot?"}
            </span>
            <button type="button" className={styles.absenceGhost} onClick={reset} disabled={saving}>
              Reset
            </button>
            <button type="button" className={styles.absencePrimary} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <span className={styles.pickupHint}>
            {hasSaved
              ? "Drag the pin if your pickup spot moved."
              : "Drag the pin to exactly where the bus should stop for you."}
          </span>
        )}
      </div>
    </div>
  );
}

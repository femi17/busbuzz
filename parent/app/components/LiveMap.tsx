"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { OSM_STYLE } from "../../lib/osm";
import styles from "../track.module.css";

type LngLat = [number, number];

const LAGOS: LngLat = [3.3792, 6.5244];
const BREADCRUMB_SOURCE = "trip-breadcrumb";

/**
 * Live bus map. Renders free OpenStreetMap raster tiles through MapLibre GL —
 * no token, no per-load cost. The stylised fallback shows until the first
 * tiles load so the screen never flashes blank.
 *
 * Coordinate order is [lng, lat] — same as the mobile app.
 * `bus` may start null (trip active but no ping yet); the marker appears
 * and the camera flies to it on the first fix, then eases on later ones.
 */
export default function LiveMap({
  bus,
  destination,
  speedKmh,
  breadcrumb = [],
  updatedAt = null,
}: {
  bus: LngLat | null;
  destination: LngLat | null;
  speedKmh: number | null;
  breadcrumb?: LngLat[];
  updatedAt?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const busMarkerRef = useRef<Marker | null>(null);
  const hasFlownRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [agoText, setAgoText] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_STYLE,
        center: bus ?? destination ?? LAGOS,
        zoom: 13,
        attributionControl: false,
      });
      // OSM tiles require visible attribution — compact so it stays out of the way.
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      mapRef.current = map;

      if (destination) {
        new maplibregl.Marker({ color: "#1A1712" }).setLngLat(destination).addTo(map);
      }

      map.on("load", () => {
        if (cancelled) return;
        map.addSource(BREADCRUMB_SOURCE, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
        });
        map.addLayer({
          id: `${BREADCRUMB_SOURCE}-line`,
          type: "line",
          source: BREADCRUMB_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#F4B01A", "line-width": 4 },
        });
        setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      busMarkerRef.current = null;
      hasFlownRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // The map instance is created once; live updates flow through the
    // effects below rather than re-instantiating it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move (or create) the bus marker on each GPS fix.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !bus) return;

    (async () => {
      if (!busMarkerRef.current) {
        const maplibregl = (await import("maplibre-gl")).default;
        if (!mapRef.current) return;
        const el = document.createElement("div");
        el.style.cssText =
          "width:26px;height:26px;border-radius:50%;background:#F4B01A;border:3px solid #fff;box-shadow:0 0 0 6px rgba(244,176,26,.22)";
        busMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(bus).addTo(map);
      } else {
        busMarkerRef.current.setLngLat(bus);
      }

      if (!hasFlownRef.current) {
        hasFlownRef.current = true;
        map.flyTo({ center: bus, zoom: 14, duration: 1200 });
      } else {
        map.easeTo({ center: bus, duration: 900 });
      }
    })();
  }, [bus, ready]);

  // Keep the traveled-path line in sync.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(BREADCRUMB_SOURCE);
    if (source && "setData" in source) {
      (source as import("maplibre-gl").GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: breadcrumb },
      });
    }
  }, [breadcrumb, ready]);

  // "updated Xs ago" — ticks every second off the last ping time.
  useEffect(() => {
    if (updatedAt == null) {
      setAgoText(null);
      return;
    }
    const tick = () => {
      const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
      setAgoText(s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [updatedAt]);

  return (
    <div className={styles.map}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {!ready && <FallbackMap />}

      {speedKmh != null && <div className={styles.speed}>{Math.round(speedKmh)} km/h</div>}
      <div className={styles.maptag}>
        <span className={styles.livedot} />
        {agoText ? `LIVE · updated ${agoText}` : "LIVE · waiting for GPS"}
      </div>
    </div>
  );
}

/** Stylised route render shown until the first OSM tiles load. */
function FallbackMap() {
  return (
    <svg viewBox="0 0 390 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="390" height="240" fill="#EDE7D7" />
      <g stroke="#DDD3BE" strokeWidth="7" fill="none" strokeLinecap="round">
        <path d="M-10 60 H400" />
        <path d="M-10 150 H400" />
        <path d="M70 -10 V250" />
        <path d="M260 -10 V250" />
      </g>
      <g stroke="#CFC4AC" strokeWidth="3" fill="none">
        <path d="M-10 105 H400" />
        <path d="M160 -10 V250" />
      </g>
      <path
        d="M40 30 C 120 60, 90 130, 180 140 S 300 200, 350 210"
        fill="none"
        stroke="#1A1712"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="1 12"
      />
      <path
        d="M40 30 C 120 60, 90 130, 155 138"
        fill="none"
        stroke="#F4B01A"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="40" cy="30" r="6" fill="#1A1712" />
      <circle cx="350" cy="210" r="7" fill="#fff" stroke="#1A1712" strokeWidth="4" />
      <g transform="translate(155,138)">
        <circle r="17" fill="#F4B01A" opacity="0.25" />
        <circle r="11" fill="#F4B01A" stroke="#fff" strokeWidth="3" />
        <rect x="-5" y="-4" width="10" height="8" rx="1.5" fill="#1A1712" />
      </g>
    </svg>
  );
}

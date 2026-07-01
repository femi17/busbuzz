'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createClient } from '@/lib/supabase';
import { createRouteSchema } from '../../../../../shared/schemas';

const newRouteFormSchema = createRouteSchema.omit({ schoolId: true });

type StopDraft = {
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
  etaMinutes?: number;
};

type FormErrors = Partial<
  Record<'name' | 'type' | 'busId' | 'stops', string>
>;

type BusOption = {
  id: string;
  plate_number: string;
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const AMBER = '#F59E0B';

export default function NewRoutePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<'MORNING' | 'AFTERNOON'>('MORNING');
  const [busId, setBusId] = useState('');
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingClick, setPendingClick] = useState<
    { lat: number; lng: number } | null
  >(null);
  const [pendingStopName, setPendingStopName] = useState('');
  const [pendingStopEta, setPendingStopEta] = useState('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const draggedIndexRef = useRef<number | null>(null);

  useEffect(() => {
    async function loadBuses() {
      const supabase = createClient();
      const { data } = await supabase
        .from('buses')
        .select('id, plate_number')
        .eq('status', 'ACTIVE')
        .order('plate_number');
      setBuses((data ?? []) as BusOption[]);
    }
    loadBuses();
  }, []);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [3.3792, 6.5244],
      zoom: 12,
      accessToken: MAPBOX_TOKEN,
    });

    map.on('click', (e) => {
      setPendingClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      setPendingStopName('');
      setPendingStopEta('');
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function createMarkerElement(label: number): HTMLDivElement {
    const el = document.createElement('div');
    el.style.backgroundColor = AMBER;
    el.style.color = '#1E2A4A';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.fontSize = '12px';
    el.style.fontWeight = '700';
    el.style.border = '2px solid white';
    el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
    el.textContent = String(label);
    return el;
  }

  function rebuildMarkers(updatedStops: StopDraft[]) {
    if (!mapRef.current) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = updatedStops.map((stop, index) => {
      const marker = new mapboxgl.Marker({
        element: createMarkerElement(index + 1),
      })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(mapRef.current!);
      return marker;
    });
  }

  function handleAddStop() {
    if (!pendingClick || !pendingStopName.trim()) return;

    const newStop: StopDraft = {
      name: pendingStopName.trim(),
      latitude: pendingClick.lat,
      longitude: pendingClick.lng,
      sequence: stops.length,
      etaMinutes: pendingStopEta ? Number(pendingStopEta) : undefined,
    };

    const updatedStops = [...stops, newStop];
    setStops(updatedStops);
    rebuildMarkers(updatedStops);
    setPendingClick(null);
    setPendingStopName('');
    setPendingStopEta('');
  }

  function handleCancelStop() {
    setPendingClick(null);
    setPendingStopName('');
    setPendingStopEta('');
  }

  function handleRemoveStop(index: number) {
    const updatedStops = stops
      .filter((_, i) => i !== index)
      .map((stop, i) => ({ ...stop, sequence: i }));
    setStops(updatedStops);
    rebuildMarkers(updatedStops);
  }

  function handleDragStart(index: number) {
    draggedIndexRef.current = index;
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function handleDrop(index: number) {
    const draggedIndex = draggedIndexRef.current;
    draggedIndexRef.current = null;
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...stops];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, moved);
    const resequenced = updated.map((stop, i) => ({ ...stop, sequence: i }));
    setStops(resequenced);
    rebuildMarkers(resequenced);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setErrors({});

    const parseResult = newRouteFormSchema.safeParse({
      name,
      type,
      busId: busId || undefined,
      stops,
    });

    if (!parseResult.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parseResult.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      if (stops.length === 0 && !fieldErrors.stops) {
        fieldErrors.stops = 'At least one stop is required';
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-route`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            name: parseResult.data.name,
            type: parseResult.data.type,
            busId: parseResult.data.busId || undefined,
            stops: parseResult.data.stops,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        if (errorBody?.details && Array.isArray(errorBody.details)) {
          const fieldErrors: FormErrors = {};
          for (const issue of errorBody.details) {
            const field = issue.path?.[0] as keyof FormErrors;
            if (field && !fieldErrors[field]) {
              fieldErrors[field] = issue.message;
            }
          }
          setErrors(fieldErrors);
        } else {
          setFormError(errorBody?.error ?? 'Failed to create route');
        }
        return;
      }

      router.push('/dashboard/routes?created=1');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex w-[400px] flex-shrink-0 flex-col overflow-y-auto rounded-xl border border-navy/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-navy">Add New Route</h2>

        <form
          onSubmit={handleSubmit}
          className="mt-5 flex flex-1 flex-col gap-4"
        >
          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-navy mb-1.5">
              Route Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Ikoyi Morning Route"
              className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy placeholder:text-navy/40 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1.5">
              Type
            </label>
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as 'MORNING' | 'AFTERNOON')
              }
              className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
            >
              <option value="MORNING">Morning</option>
              <option value="AFTERNOON">Afternoon</option>
            </select>
            {errors.type && (
              <p className="text-xs text-red-500 mt-1">{errors.type}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1.5">
              Bus
            </label>
            <select
              value={busId}
              onChange={(e) => setBusId(e.target.value)}
              className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
            >
              <option value="">No bus assigned</option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  {bus.plate_number}
                </option>
              ))}
            </select>
            {errors.busId && (
              <p className="text-xs text-red-500 mt-1">{errors.busId}</p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="block text-sm font-medium text-navy">
                Stops
              </label>
              <span className="rounded-full bg-navy/5 px-2 py-0.5 text-xs font-medium text-navy/60">
                {stops.length}
              </span>
            </div>

            {stops.length === 0 ? (
              <p className="text-sm text-navy/50">
                Click on the map to add stops.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {stops.map((stop, index) => (
                  <div
                    key={`${stop.latitude}-${stop.longitude}-${index}`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    className="flex items-center gap-2 rounded-lg border border-navy/10 px-3 py-2 cursor-move"
                  >
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber/20 text-xs font-semibold text-navy">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-navy">
                        {stop.name}
                      </p>
                      {stop.etaMinutes !== undefined && (
                        <p className="text-xs text-navy/50">
                          ETA: {stop.etaMinutes} min
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStop(index)}
                      className="text-navy/40 hover:text-red-500"
                      aria-label="Remove stop"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
            {errors.stops && (
              <p className="text-xs text-red-500 mt-1">{errors.stops}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <Link
              href="/dashboard/routes"
              className="rounded-lg border border-navy/20 px-4 py-2.5 text-sm font-medium text-navy/70"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Creating...' : 'Create Route'}
            </button>
          </div>
        </form>
      </div>

      <div className="relative flex-1">
        {!MAPBOX_TOKEN ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-navy/10 bg-gray-100 p-8 text-center">
            <p className="text-sm text-navy/50">
              Mapbox token not configured. Add NEXT_PUBLIC_MAPBOX_TOKEN to
              your .env.local file to enable the map.
            </p>
          </div>
        ) : (
          <div
            ref={mapContainerRef}
            className="h-full w-full rounded-xl border border-navy/10"
          />
        )}

        {pendingClick && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-80 rounded-xl bg-white p-5 shadow-lg">
              <h3 className="text-sm font-bold text-navy mb-3">Add Stop</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-medium text-navy mb-1">
                    Stop Name
                  </label>
                  <input
                    type="text"
                    value={pendingStopName}
                    onChange={(e) => setPendingStopName(e.target.value)}
                    autoFocus
                    className="w-full rounded-lg border border-navy/20 px-3 py-2 text-sm text-navy focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-navy mb-1">
                    ETA (minutes from trip start)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pendingStopEta}
                    onChange={(e) => setPendingStopEta(e.target.value)}
                    className="w-full rounded-lg border border-navy/20 px-3 py-2 text-sm text-navy focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
                  />
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={handleCancelStop}
                    className="rounded-lg border border-navy/20 px-3 py-2 text-sm font-medium text-navy/70"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddStop}
                    disabled={!pendingStopName.trim()}
                    className="rounded-lg bg-amber px-3 py-2 text-sm font-semibold text-navy disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Add Stop
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

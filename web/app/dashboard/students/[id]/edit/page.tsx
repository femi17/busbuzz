'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { createPhotoSignedUrl } from '@/lib/photos';
import { PhotoUpload } from '@/components/dashboard/PhotoUpload';
import { AddressAutocompleteInput } from '@/components/dashboard/AddressAutocompleteInput';
import { geocodeAddress } from '@/lib/google-maps';

const inputClass = 'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-canvas disabled:opacity-60';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

type RouteOption = { id: string; name: string; type: string; stops: { id: string; name: string; sequence: number }[] };

export default function EditStudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routeId, setRouteId] = useState('');
  const [stopId, setStopId] = useState('');
  const [tripType, setTripType] = useState<'MORNING' | 'AFTERNOON' | 'BOTH'>('BOTH');
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: student }, { data: routeData }] = await Promise.all([
        supabase
          .from('students')
          .select('id, name, class_name, pickup_address, pickup_lat, pickup_lng, route_id, stop_id, trip_type, photo_url')
          .eq('id', id)
          .single(),
        supabase
          .from('routes')
          .select('id, name, type, stops(id, name, sequence)')
          .order('name'),
      ]);

      if (student) {
        setName(student.name ?? '');
        setClassName(student.class_name ?? '');
        setPickupAddress((student as Record<string, unknown>).pickup_address as string ?? '');
        const lat = (student as Record<string, unknown>).pickup_lat as number | null;
        const lng = (student as Record<string, unknown>).pickup_lng as number | null;
        if (lat != null && lng != null) setPickupCoords({ lat, lng });
        setRouteId(student.route_id ?? '');
        setStopId(student.stop_id ?? '');
        const tt = (student as Record<string, unknown>).trip_type as string;
        if (tt === 'MORNING' || tt === 'AFTERNOON' || tt === 'BOTH') setTripType(tt);
        setPhotoPreview((student as Record<string, unknown>).photo_url as string ?? null);
      }
      setRoutes((routeData ?? []) as RouteOption[]);
      setIsLoading(false);
    }
    load();
  }, [id]);

  const selectedRoute = routes.find((r) => r.id === routeId);
  const sortedStops = selectedRoute
    ? [...selectedRoute.stops].sort((a, b) => a.sequence - b.sequence)
    : [];
  // Direction only means something on a route that runs both legs — on a
  // dedicated MORNING/AFTERNOON route every rider is on its one leg no
  // matter what this value says, so don't offer a choice that could
  // silently exclude the student from their only run.
  const showDirectionPicker = selectedRoute?.type === 'BOTH';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setFormError('Name is required'); return; }
    if (!className.trim()) { setFormError('Class is required'); return; }

    setFormError(null);
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const body: Record<string, unknown> = {
        id,
        name: name.trim(),
        className: className.trim(),
      };
      if (pickupAddress.trim()) body.pickupAddress = pickupAddress.trim();
      if (routeId) {
        body.routeId = routeId;
        if (stopId) body.stopId = stopId;
        body.tripType = showDirectionPicker ? tripType : 'BOTH';
      } else {
        body.routeId = null;
        body.stopId = null;
      }

      if (photoFile) {
        const ext = photoFile.name.split('.').pop() ?? 'jpg';
        const path = `students/${id}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type });

        if (uploadError) {
          setFormError(`Photo upload failed: ${uploadError.message}`);
          setIsSubmitting(false);
          return;
        }
        body.photoUrl = await createPhotoSignedUrl(supabase, path);
      }

      let coords = pickupCoords;
      if (pickupAddress.trim() && !coords) {
        coords = await geocodeAddress(pickupAddress.trim());
      }

      const supabaseClient = createClient();
      await supabaseClient.from('students').update({
        pickup_address: pickupAddress.trim() || null,
        pickup_lat: pickupAddress.trim() ? coords?.lat ?? null : null,
        pickup_lng: pickupAddress.trim() ? coords?.lng ?? null : null,
        trip_type: showDirectionPicker ? tripType : 'BOTH',
      }).eq('id', id);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-student`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        setFormError(errorBody?.error ?? 'Failed to save changes');
        return;
      }

      router.push('/dashboard/students');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-[500px] mx-auto">
        <div className="h-8 w-40 rounded bg-canvas animate-pulse mb-6" />
        <div className="rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] p-6 flex flex-col gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded bg-canvas animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[500px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit Student</h1>
        <p className="text-sm text-sub mt-1">Update student details and route assignment.</p>
      </div>

      <div className="rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {formError && (
            <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/20 text-red text-sm px-4 py-3">
              {formError}
            </div>
          )}

          <div className="flex justify-center pb-1">
            <PhotoUpload
              previewUrl={photoPreview}
              name={name || 'S'}
              size={88}
              onChange={(file) => { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }}
            />
          </div>

          <div>
            <label className={labelClass}>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Chidi Okafor"
              className={inputClass}
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass}>Class</label>
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g., JSS1, SS2"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Pickup Address <span className="text-sub font-normal">(optional)</span></label>
            <AddressAutocompleteInput
              value={pickupAddress}
              onChange={(address, newCoords) => { setPickupAddress(address); setPickupCoords(newCoords); }}
              placeholder="e.g., 14 Awolowo Road, Ikoyi"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Route <span className="text-sub font-normal">(optional)</span></label>
            <select
              value={routeId}
              onChange={(e) => { setRouteId(e.target.value); setStopId(''); setTripType('BOTH'); }}
              className={inputClass}
            >
              <option value="">No route assigned</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {showDirectionPicker && (
            <div>
              <label className={labelClass}>Bus Direction</label>
              <select
                value={tripType}
                onChange={(e) => setTripType(e.target.value as 'MORNING' | 'AFTERNOON' | 'BOTH')}
                className={inputClass}
              >
                <option value="MORNING">Morning only</option>
                <option value="AFTERNOON">Afternoon only</option>
                <option value="BOTH">Morning &amp; Afternoon</option>
              </select>
            </div>
          )}

          {routeId && sortedStops.length > 0 && (
            <div>
              <label className={labelClass}>Stop <span className="text-sub font-normal">(optional)</span></label>
              <select
                value={stopId}
                onChange={(e) => setStopId(e.target.value)}
                className={inputClass}
              >
                <option value="">No stop assigned</option>
                {sortedStops.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Link
              href="/dashboard/students"
              className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-[var(--radius-btn)] bg-amber px-6 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
            >
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

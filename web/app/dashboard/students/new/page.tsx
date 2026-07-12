'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { createPhotoSignedUrl } from '@/lib/photos';
import { createStudentSchema } from '../../../../../shared/schemas';
import { PhotoUpload } from '@/components/dashboard/PhotoUpload';
import { ParentInviteForm } from '@/components/dashboard/ParentInviteForm';
import { AddressAutocompleteInput } from '@/components/dashboard/AddressAutocompleteInput';

const newStudentFormSchema = createStudentSchema.omit({ schoolId: true, photoUrl: true, stopId: true, medicalNotes: true });

type FormErrors = Partial<Record<'name' | 'className' | 'routeId', string>>;

type RouteOption = { id: string; name: string };

const inputClass = 'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-canvas disabled:opacity-60 disabled:cursor-not-allowed';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function NewStudentPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routeId, setRouteId] = useState('');
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);
  const [createdStudentName, setCreatedStudentName] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoutes() {
      const supabase = createClient();
      const { data } = await supabase.from('routes').select('id, name').order('name');
      setRoutes((data ?? []) as RouteOption[]);
    }
    loadRoutes();
  }, []);

  const studentCreated = createdStudentId !== null;
  const stepIndex = studentCreated ? 1 : 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setErrors({});
    const parseResult = newStudentFormSchema.safeParse({ name, className, routeId: routeId || undefined });
    if (!parseResult.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parseResult.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({
          action: 'create',
          name: parseResult.data.name,
          className: parseResult.data.className,
          routeId: parseResult.data.routeId || undefined,
          pickupAddress: pickupAddress.trim() || undefined,
          // Trusted coords from a Google Places selection — the server
          // geocodes server-side itself if these are absent.
          pickupLat: pickupCoords?.lat,
          pickupLng: pickupCoords?.lng,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        if (errorBody?.details && Array.isArray(errorBody.details)) {
          const fieldErrors: FormErrors = {};
          for (const issue of errorBody.details) {
            const field = issue.path?.[0] as keyof FormErrors;
            if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
          }
          setErrors(fieldErrors);
        } else {
          setFormError(errorBody?.error ?? 'Failed to create student');
        }
        return;
      }
      const successBody = await response.json();
      const studentId: string = successBody.data.id;

      const updates: Record<string, unknown> = {};

      // Upload photo if selected
      if (photoFile) {
        const supabase = createClient();
        const ext = photoFile.name.split('.').pop() ?? 'jpg';
        const path = `students/${studentId}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type });

        if (uploadError) {
          setFormError(`Photo upload failed: ${uploadError.message}`);
          setIsSubmitting(false);
          return;
        }
        updates.photo_url = await createPhotoSignedUrl(supabase, path);
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('students').update(updates).eq('id', studentId);
      }

      setCreatedStudentName(parseResult.data.name);
      setCreatedStudentId(studentId);
    } finally {
      setIsSubmitting(false);
    }
  }

  const stepTransition = {
    initial: { opacity: 0, x: prefersReducedMotion ? 0 : 16 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: prefersReducedMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] as const },
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Add New Student</h1>
        <p className="text-sm text-sub mt-1">Enrol a student and assign them to a route</p>
      </div>

      <div className="mx-auto max-w-lg bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
        {/* Route-line step indicator: two stops on the enrolment "route" */}
        <div className="mb-8 flex items-start" aria-hidden="true">
          <div className="flex w-28 shrink-0 flex-col items-center gap-2">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors duration-300 ${stepIndex > 0 ? 'border-amber bg-amber text-navy' : 'border-navy bg-navy text-amber-light'}`}>
              {stepIndex > 0 ? <Check size={16} strokeWidth={2.5} /> : <span className="board-figure text-[13px] font-semibold">01</span>}
            </div>
            <span className={`text-[12px] font-medium text-center ${stepIndex === 0 ? 'text-ink' : 'text-sub'}`}>Student details</span>
          </div>
          <div className={`mt-[18px] h-[2px] flex-1 rounded-full bg-rule overflow-hidden ${prefersReducedMotion ? '' : 'transition-all duration-500 ease-out'}`}>
            <div className="h-full bg-amber" style={{ width: stepIndex > 0 ? '100%' : '0%', transition: prefersReducedMotion ? 'none' : 'width 500ms ease-out' }} />
          </div>
          <div className="flex w-28 shrink-0 flex-col items-center gap-2">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors duration-300 ${stepIndex === 1 ? 'border-navy bg-navy text-amber-light' : 'border-rule bg-surface text-sub'}`}>
              <span className="board-figure text-[13px] font-semibold">02</span>
            </div>
            <span className={`text-[12px] font-medium text-center ${stepIndex === 1 ? 'text-ink' : 'text-sub'}`}>Invite parents</span>
          </div>
        </div>

        {stepIndex === 0 && (
          <motion.form key="details" onSubmit={handleSubmit} className="flex flex-col gap-4" {...stepTransition}>
            {formError && <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">{formError}</div>}

            <div className="flex justify-center pb-1">
              <PhotoUpload
                previewUrl={photoPreview}
                name={name || 'S'}
                size={88}
                onChange={(file) => { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }}
              />
            </div>

            <div>
              <label className={labelClass}>Student Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Chidi Okafor" className={inputClass} />
              {errors.name && <p className="text-xs text-red mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className={labelClass}>Class Name</label>
              <input type="text" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g., JSS1" className={inputClass} />
              {errors.className && <p className="text-xs text-red mt-1">{errors.className}</p>}
            </div>

            <div>
              <label className={labelClass}>Pickup Address <span className="text-sub font-normal">(optional)</span></label>
              <AddressAutocompleteInput
                value={pickupAddress}
                onChange={(address, coords) => { setPickupAddress(address); setPickupCoords(coords); }}
                placeholder="e.g., 14 Awolowo Road, Ikoyi"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Route</label>
              <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className={inputClass}>
                <option value="">No route assigned</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {errors.routeId && <p className="text-xs text-red mt-1">{errors.routeId}</p>}
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <Link href="/dashboard/students" className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95">
                Cancel
              </Link>
              <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150">
                {isSubmitting ? 'Saving...' : <>Continue <ArrowRight size={16} /></>}
              </button>
            </div>
          </motion.form>
        )}

        {stepIndex === 1 && (
          <motion.div key="invite" {...stepTransition}>
            <div className="mb-4 rounded-[var(--radius-btn)] bg-green-bg border border-green/20 text-green text-sm px-4 py-3">
              {createdStudentName} was added. Invite their parents to start tracking.
            </div>

            <h3 className="text-[16px] font-semibold text-ink">Invite Parents</h3>
            <p className="text-sm text-sub mt-1">Search for a parent already using BusBuzz, or invite a new one by email.</p>

            <div className="mt-4 flex flex-col gap-4">
              <ParentInviteForm studentId={createdStudentId!} />

              <div className="flex justify-end mt-2">
                <button type="button" onClick={() => router.push('/dashboard/students?created=1')} className="flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 active:scale-95 transition-all duration-150">
                  Finish <Check size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

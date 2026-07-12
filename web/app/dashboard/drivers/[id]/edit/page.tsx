'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { createPhotoSignedUrl } from '@/lib/photos';
import { PhotoUpload } from '@/components/dashboard/PhotoUpload';
import { normalizePhone } from '../../../../../../shared/schemas';

type BusOption = { id: string; plate_number: string };

const inputClass =
  'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:opacity-50';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function EditDriverPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [assignedBusId, setAssignedBusId] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from('profiles')
        .select('id, name, phone, assigned_bus_id, photo_url')
        .eq('id', id)
        .single(),
      supabase
        .from('buses')
        .select('id, plate_number')
        .eq('status', 'ACTIVE')
        .order('plate_number'),
    ]).then(([{ data: driver }, { data: busData }]) => {
      if (driver) {
        setName(driver.name ?? '');
        setPhone(driver.phone ?? '');
        setAssignedBusId(driver.assigned_bus_id ?? '');
        setPhotoUrl(driver.photo_url ?? null);
        setPhotoPreview(driver.photo_url ?? null);
      }
      setBuses((busData ?? []) as BusOption[]);
      setIsLoading(false);
    });
  }, [id]);

  function handlePhotoChange(file: File) {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!phone.trim()) newErrors.phone = 'Phone number is required';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setIsSaving(true);
    try {
      const supabase = createClient();

      // Upload new photo if selected
      let newPhotoUrl = photoUrl;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() ?? 'jpg';
        const path = `drivers/${id}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
        if (uploadError) {
          setFormError(`Photo upload failed: ${uploadError.message}`);
          return;
        }
        newPhotoUrl = await createPhotoSignedUrl(supabase, path);
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          phone: normalizePhone(phone),
          photo_url: newPhotoUrl,
        })
        .eq('id', id);

      if (error) {
        setFormError(error.message);
        return;
      }

      // Bus assignment lives on buses.driver_id (source of truth) —
      // profiles.assigned_bus_id mirrors it via a DB trigger.
      await supabase.from('buses').update({ driver_id: null }).eq('driver_id', id);
      if (assignedBusId) {
        await supabase.from('buses').update({ driver_id: id }).eq('id', assignedBusId);
      }

      router.push('/dashboard/drivers?updated=1');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-[500px] mx-auto">
        <div className="h-8 w-48 animate-pulse rounded bg-rule mb-6" />
        <div className="rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] p-6 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-rule" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[500px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit Driver</h1>
        <p className="text-sm text-sub mt-1">Update driver details and bus assignment.</p>
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
              name={name || 'D'}
              size={88}
              onChange={handlePhotoChange}
            />
          </div>

          <div>
            <label className={labelClass}>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            {errors.name && <p className="text-xs text-red mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className={labelClass}>Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
            {errors.phone && <p className="text-xs text-red mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className={labelClass}>Assigned Bus</label>
            <select
              value={assignedBusId}
              onChange={(e) => setAssignedBusId(e.target.value)}
              className={inputClass}
            >
              <option value="">No bus assigned</option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>{bus.plate_number}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Link
              href="/dashboard/drivers"
              className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-[var(--radius-btn)] bg-amber px-6 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

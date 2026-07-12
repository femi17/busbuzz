'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { createPhotoSignedUrl } from '@/lib/photos';
import { PhotoUpload } from '@/components/dashboard/PhotoUpload';

type BusOption = { id: string; plate_number: string };

const inputClass =
  'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function NewDriverPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [assignedBusId, setAssignedBusId] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('buses')
      .select('id, plate_number')
      .eq('status', 'ACTIVE')
      .order('plate_number')
      .then(({ data }) => setBuses((data ?? []) as BusOption[]));
  }, []);

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
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) newErrors.pin = 'PIN must be exactly 4 digits';
    if (pin !== confirmPin) newErrors.confirmPin = 'PINs do not match';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      };
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      // Step 1: Create driver account
      const createRes = await fetch(`${baseUrl}/functions/v1/create-driver`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });

      if (!createRes.ok) {
        const body = await createRes.json().catch(() => null);
        setFormError(body?.error ?? 'Failed to create driver');
        return;
      }

      const { data: newDriver } = await createRes.json();
      const driverId: string = newDriver.id;

      // Step 2: Set PIN
      const pinRes = await fetch(`${baseUrl}/functions/v1/set-driver-pin`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ driverId, pin }),
      });

      if (!pinRes.ok) {
        const body = await pinRes.json().catch(() => null);
        setFormError(body?.error ?? 'Driver created but failed to set PIN — reset it from the drivers list');
        return;
      }

      // Step 3: Upload photo if selected
      let photoUrl: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() ?? 'jpg';
        const path = `drivers/${driverId}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type });

        if (uploadError) {
          setFormError(`Photo upload failed: ${uploadError.message}`);
          return;
        }
        photoUrl = await createPhotoSignedUrl(supabase, path);
      }

      // Step 4: Update profile photo
      if (photoUrl) {
        await supabase.from('profiles').update({ photo_url: photoUrl }).eq('id', driverId);
      }

      // Step 5: Assign bus — buses.driver_id is the source of truth
      // (profiles.assigned_bus_id mirrors it via a DB trigger).
      if (assignedBusId) {
        await supabase.from('buses').update({ driver_id: driverId }).eq('id', assignedBusId);
      }

      router.push('/dashboard/drivers?created=1');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-[500px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Add Driver</h1>
        <p className="text-sm text-sub mt-1">
          The driver will use their phone number and PIN to log in on the kiosk device.
        </p>
      </div>

      <div className="rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {formError && (
            <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/20 text-red text-sm px-4 py-3">
              {formError}
            </div>
          )}

          {/* Photo */}
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
              placeholder="e.g., Emeka Nwosu"
              className={inputClass}
              autoFocus
            />
            {errors.name && <p className="text-xs text-red mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className={labelClass}>Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g., 08012345678"
              className={inputClass}
            />
            <p className="text-[11px] text-sub mt-1">This is the number the driver types on the kiosk phone to log in.</p>
            {errors.phone && <p className="text-xs text-red mt-1">{errors.phone}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>4-Digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className={`${inputClass} text-center text-[20px] tracking-[0.5em] font-mono placeholder:tracking-normal placeholder:text-[14px]`}
              />
              {errors.pin && <p className="text-xs text-red mt-1">{errors.pin}</p>}
            </div>
            <div>
              <label className={labelClass}>Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className={`${inputClass} text-center text-[20px] tracking-[0.5em] font-mono placeholder:tracking-normal placeholder:text-[14px]`}
              />
              {errors.confirmPin && <p className="text-xs text-red mt-1">{errors.confirmPin}</p>}
            </div>
          </div>

          <div>
            <label className={labelClass}>Assign Bus <span className="text-sub font-normal">(optional)</span></label>
            <select
              value={assignedBusId}
              onChange={(e) => setAssignedBusId(e.target.value)}
              className={inputClass}
            >
              <option value="">No bus assigned yet</option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>{bus.plate_number}</option>
              ))}
            </select>
            <p className="text-[11px] text-sub mt-1">You can assign or change this later from the drivers list.</p>
          </div>

          <div className="rounded-[var(--radius-btn)] border border-rule bg-canvas px-4 py-3">
            <p className="text-[12px] font-medium text-ink mb-1">How the driver logs in</p>
            <p className="text-[12px] text-sub leading-relaxed">
              On the kiosk phone, the driver opens BusBuzz Driver App, enters their phone number and this PIN. That&apos;s it — no email, no password.
            </p>
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
              disabled={isSubmitting}
              className="rounded-[var(--radius-btn)] bg-amber px-6 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
            >
              {isSubmitting ? 'Adding Driver…' : 'Add Driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

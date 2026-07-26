'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

type SchoolRow = {
  id: string;
  name: string;
  address: string;
  logo_url: string | null;
  is_active: boolean;
};

type AdminRow = {
  id: string;
  name: string;
  email: string | null;
};

const inputClass =
  'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function EditSchoolPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const schoolId = params.id;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [original, setOriginal] = useState<{
    name: string;
    address: string;
    logoUrl: string;
    isActive: boolean;
  } | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [admin, setAdmin] = useState<AdminRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordState, setPasswordState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const supabase = createClient();
      const [{ data: school, error }, { data: adminData }] = await Promise.all([
        supabase.from('schools').select('id, name, address, logo_url, is_active').eq('id', schoolId).single(),
        supabase
          .from('profiles')
          .select('id, name, email')
          .eq('school_id', schoolId)
          .eq('role', 'SCHOOL_ADMIN')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!isMounted) return;
      if (error || !school) {
        setLoadError('School not found.');
        setIsLoading(false);
        return;
      }
      const s = school as SchoolRow;
      const initial = { name: s.name, address: s.address, logoUrl: s.logo_url ?? '', isActive: s.is_active };
      setOriginal(initial);
      setName(initial.name);
      setAddress(initial.address);
      setLogoUrl(initial.logoUrl);
      setIsActive(initial.isActive);
      setAdmin((adminData as AdminRow) ?? null);
      setIsLoading(false);
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [schoolId]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('School name is required');
      return;
    }
    if (!address.trim()) {
      setFormError('School address is required');
      return;
    }

    const changed: Record<string, unknown> = { id: schoolId };
    if (original) {
      if (name.trim() !== original.name) changed.name = name.trim();
      if (address.trim() !== original.address) changed.address = address.trim();
      if (logoUrl.trim() !== original.logoUrl) changed.logoUrl = logoUrl.trim() || null;
      if (isActive !== original.isActive) changed.isActive = isActive;
    }
    if (Object.keys(changed).length === 1) {
      router.push('/dashboard/schools');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-school`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify(changed),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setFormError(errorBody?.error ?? 'Failed to update school');
        return;
      }

      router.push('/dashboard/schools');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      setPasswordState('error');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The two passwords do not match.');
      setPasswordState('error');
      return;
    }

    setPasswordState('saving');
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-school`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ action: 'reset-admin-password', schoolId, newPassword }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setPasswordError(errorBody?.error ?? 'Failed to reset password');
        setPasswordState('error');
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      setPasswordState('success');
    } catch {
      setPasswordError('An unexpected error occurred');
      setPasswordState('error');
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-[560px] mx-auto">
        <div className="mb-6">
          <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit School</h1>
        </div>
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
          <p className="text-sm text-sub">Loading school details...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-[560px] mx-auto">
        <div className="mb-6">
          <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit School</h1>
        </div>
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
          <p className="text-sm text-red">{loadError}</p>
          <Link href="/dashboard/schools" className="mt-3 inline-block text-sm font-medium text-sub hover:text-ink">
            Back to Schools
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[560px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit School</h1>
        <p className="text-sm text-sub mt-1">Update school details, status, and the admin account</p>
      </div>

      <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {formError && (
            <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">
              {formError}
            </div>
          )}

          <div>
            <label className={labelClass}>School Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
          </div>

          <div>
            <label className={labelClass}>Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-sub mt-1">Changing the address re-geocodes the school&apos;s map position.</p>
          </div>

          <div>
            <label className={labelClass}>Logo URL</label>
            <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <select
              value={isActive ? 'active' : 'inactive'}
              onChange={(e) => setIsActive(e.target.value === 'active')}
              className={inputClass}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <p className="text-[11px] text-sub mt-1">
              Shown as a status flag across the dashboard — it does not currently block admin or driver sign-in.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Link
              href="/dashboard/schools"
              className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
        <h2 className="font-heading font-bold text-[18px] tracking-tight text-ink">School Admin</h2>

        {admin ? (
          <>
            <p className="mt-1 text-sm text-sub">
              {admin.name}
              {admin.email ? ` · ${admin.email}` : ''}
            </p>
            <form onSubmit={handlePasswordReset} className="mt-5 flex flex-col gap-4">
              {passwordState === 'success' && (
                <div className="rounded-[var(--radius-btn)] border border-green/20 bg-green-bg px-4 py-3 text-sm text-green">
                  Password reset. Share the new password with {admin.name} directly — it won&apos;t be shown again.
                </div>
              )}
              {passwordState === 'error' && passwordError && (
                <div className="rounded-[var(--radius-btn)] border border-red/30 bg-red-bg px-4 py-3 text-sm text-red">
                  {passwordError}
                </div>
              )}
              <div>
                <label className={labelClass}>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={passwordState === 'saving'}
                  className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
                >
                  {passwordState === 'saving' ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <p className="mt-1 text-sm text-sub">No admin account found for this school.</p>
        )}
      </div>
    </div>
  );
}

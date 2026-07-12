'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onboardSchoolSchema } from '../../../../../shared/schemas';
import { createClient } from '@/lib/supabase';

type FormErrors = Partial<Record<'schoolName' | 'schoolAddress' | 'schoolLogoUrl' | 'adminName' | 'adminEmail' | 'adminPassword', string>>;

const inputClass = 'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function NewSchoolPage() {
  const router = useRouter();
  const [schoolName, setSchoolName] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [schoolLogoUrl, setSchoolLogoUrl] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setErrors({});

    const parseResult = onboardSchoolSchema.safeParse({
      schoolName, schoolAddress, schoolLogoUrl: schoolLogoUrl || undefined,
      adminName, adminEmail, adminPassword,
    });

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

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-school`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ schoolName, schoolAddress, schoolLogoUrl: schoolLogoUrl || undefined, adminName, adminEmail, adminPassword }),
        },
      );

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
          setFormError(errorBody?.error ?? 'Failed to onboard school');
        }
        return;
      }

      router.push('/dashboard/schools?created=1');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Onboard New School</h1>
        <p className="text-sm text-sub mt-1">Set up a new school and create its first admin account</p>
      </div>

      <div className="mx-auto max-w-lg bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && (
            <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">{formError}</div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-sub pb-2 border-b border-rule">School Details</p>
          </div>

          <div>
            <label className={labelClass}>School Name</label>
            <input type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="e.g., Greensprings School" className={inputClass} />
            {errors.schoolName && <p className="text-xs text-red mt-1">{errors.schoolName}</p>}
          </div>

          <div>
            <label className={labelClass}>School Address</label>
            <input type="text" value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} placeholder="e.g., 28 Admiralty Way, Lekki" className={inputClass} />
            {errors.schoolAddress && <p className="text-xs text-red mt-1">{errors.schoolAddress}</p>}
          </div>

          <div>
            <label className={labelClass}>Logo URL</label>
            <input type="text" value={schoolLogoUrl} onChange={(e) => setSchoolLogoUrl(e.target.value)} placeholder="https://..." className={inputClass} />
            <p className="text-xs text-sub mt-1">Optional. Direct URL to school logo image.</p>
            {errors.schoolLogoUrl && <p className="text-xs text-red mt-1">{errors.schoolLogoUrl}</p>}
          </div>

          <div className="mt-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-sub pb-2 border-b border-rule">First Admin Account</p>
          </div>

          <div>
            <label className={labelClass}>Admin Full Name</label>
            <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="e.g., Mrs. Adebayo" className={inputClass} />
            {errors.adminName && <p className="text-xs text-red mt-1">{errors.adminName}</p>}
          </div>

          <div>
            <label className={labelClass}>Admin Email</label>
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@school.com" className={inputClass} />
            {errors.adminEmail && <p className="text-xs text-red mt-1">{errors.adminEmail}</p>}
          </div>

          <div>
            <label className={labelClass}>Admin Password</label>
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Minimum 8 characters" className={inputClass} />
            {errors.adminPassword && <p className="text-xs text-red mt-1">{errors.adminPassword}</p>}
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <Link href="/dashboard/schools" className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95">
              Cancel
            </Link>
            <button type="submit" disabled={isSubmitting} className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150">
              {isSubmitting ? 'Onboarding...' : 'Onboard School'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

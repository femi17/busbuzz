'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

type ProfileData = {
  id: string;
  name: string;
  phone: string | null;
  school_id: string | null;
};

type SchoolData = {
  id: string;
  name: string;
  address: string;
  logo_url: string | null;
};

const inputClass = 'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';
const labelClass = 'mb-1.5 block text-sm font-medium text-ink';

export default function SettingsPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState('');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [school, setSchool] = useState<SchoolData | null>(null);

  const [schoolName, setSchoolName] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [schoolSaveState, setSchoolSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [schoolSaveError, setSchoolSaveError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [accountSaveState, setAccountSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [accountSaveError, setAccountSaveError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordState, setPasswordState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) { setLoadError('Failed to load user data. Please refresh the page.'); return; }
        const userId = userData.user.id;
        setUserEmail(userData.user.email ?? '');
        const { data: profileData, error: profileError } = await supabase.from('profiles').select('id, name, phone, school_id').eq('id', userId).single();
        if (profileError || !profileData) { setLoadError('Failed to load profile data. Please refresh the page.'); return; }
        setProfile(profileData as ProfileData);
        setDisplayName(profileData.name ?? '');
        setPhone(profileData.phone ?? '');
        if (!profileData.school_id) { setLoadError('No school is associated with this account.'); return; }
        const { data: schoolData, error: schoolError } = await supabase.from('schools').select('id, name, address, logo_url').eq('id', profileData.school_id).single();
        if (schoolError || !schoolData) { setLoadError('Failed to load school data. Please refresh the page.'); return; }
        setSchool(schoolData as SchoolData);
        setSchoolName(schoolData.name ?? '');
        setSchoolAddress(schoolData.address ?? '');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSchoolSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!school) return;
    setSchoolSaveState('saving');
    setSchoolSaveError(null);
    try {
      const supabase = createClient();
      let logoUrl = school.logo_url;
      if (logoFile) {
        const { data: uploadData, error: uploadError } = await supabase.storage.from('school-logos').upload(`${school.id}/${Date.now()}_${logoFile.name}`, logoFile);
        if (uploadError || !uploadData) { setSchoolSaveError(uploadError?.message ?? 'Failed to upload logo'); setSchoolSaveState('error'); return; }
        const { data: urlData } = supabase.storage.from('school-logos').getPublicUrl(uploadData.path);
        logoUrl = urlData.publicUrl;
      }
      const updatePayload: { name: string; address: string; logo_url?: string | null } = { name: schoolName, address: schoolAddress };
      if (logoFile) updatePayload.logo_url = logoUrl;
      const { error: updateError } = await supabase.from('schools').update(updatePayload).eq('id', school.id);
      if (updateError) { setSchoolSaveError(updateError.message); setSchoolSaveState('error'); return; }
      setSchool((prev) => prev ? { ...prev, name: schoolName, address: schoolAddress, logo_url: logoFile ? logoUrl : prev.logo_url } : prev);
      setLogoFile(null);
      setSchoolSaveState('success');
    } catch { setSchoolSaveError('An unexpected error occurred'); setSchoolSaveState('error'); }
  }

  async function handleAccountSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    setAccountSaveState('saving');
    setAccountSaveError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.from('profiles').update({ name: displayName, phone: phone || null }).eq('id', profile.id);
      if (updateError) { setAccountSaveError(updateError.message); setAccountSaveState('error'); return; }
      setProfile((prev) => prev ? { ...prev, name: displayName, phone: phone || null } : prev);
      setAccountSaveState('success');
    } catch { setAccountSaveError('An unexpected error occurred'); setAccountSaveState('error'); }
  }

  async function handlePasswordSave(e: FormEvent<HTMLFormElement>) {
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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(error.message);
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

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <DashboardHeader title="Settings" subtitle="School profile and account" />
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-rule" />
          <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-rule" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <DashboardHeader title="Settings" />
        <div className="rounded-[var(--radius-btn)] border border-red/30 bg-red-bg px-4 py-3 text-sm text-red">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <DashboardHeader title="Settings" subtitle="School profile and account" />

      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {/* School Profile */}
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
          <h2 className="font-heading font-bold text-[18px] tracking-tight text-ink">School Profile</h2>
          <form onSubmit={handleSchoolSave} className="mt-5 flex flex-col gap-4">
            {schoolSaveState === 'success' && (
              <div className="rounded-[var(--radius-btn)] border border-green/20 bg-green-bg px-4 py-3 text-sm text-green">
                School profile saved successfully.
              </div>
            )}
            {schoolSaveState === 'error' && schoolSaveError && (
              <div className="rounded-[var(--radius-btn)] border border-red/30 bg-red-bg px-4 py-3 text-sm text-red">
                {schoolSaveError}
              </div>
            )}
            <div>
              <label className={labelClass}>School Name</label>
              <input type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Address</label>
              <input type="text" value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Logo</label>
              {school?.logo_url && !logoFile && (
                <img src={school.logo_url} alt="School logo" width={80} height={80} className="mb-3 h-20 w-20 rounded-[var(--radius-btn)] border border-rule object-cover" />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setLogoFile(e.target.files?.[0] ?? null)}
                className="text-sm text-sub"
              />
              {logoFile && <p className="mt-1 text-xs text-sub">New file: {logoFile.name}</p>}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={schoolSaveState === 'saving'}
                className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
              >
                {schoolSaveState === 'saving' ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* My Account */}
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
          <h2 className="font-heading font-bold text-[18px] tracking-tight text-ink">My Account</h2>
          <form onSubmit={handleAccountSave} className="mt-5 flex flex-col gap-4">
            {accountSaveState === 'success' && (
              <div className="rounded-[var(--radius-btn)] border border-green/20 bg-green-bg px-4 py-3 text-sm text-green">
                Account details saved successfully.
              </div>
            )}
            {accountSaveState === 'error' && accountSaveError && (
              <div className="rounded-[var(--radius-btn)] border border-red/30 bg-red-bg px-4 py-3 text-sm text-red">
                {accountSaveError}
              </div>
            )}
            <div>
              <label className={labelClass}>Display Name</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={userEmail} readOnly disabled className={`${inputClass} cursor-not-allowed bg-canvas opacity-60`} />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={accountSaveState === 'saving'}
                className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
              >
                {accountSaveState === 'saving' ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
          <h2 className="font-heading font-bold text-[18px] tracking-tight text-ink">Change Password</h2>
          <p className="mt-1 text-sm text-sub">Set a new password for signing in.</p>
          <form onSubmit={handlePasswordSave} className="mt-5 flex flex-col gap-4">
            {passwordState === 'success' && (
              <div className="rounded-[var(--radius-btn)] border border-green/20 bg-green-bg px-4 py-3 text-sm text-green">
                Password updated successfully.
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
                {passwordState === 'saving' ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="rounded-[var(--radius-card)] border-2 border-red/20 bg-red-bg/30 p-6">
          <h2 className="font-heading font-bold text-[18px] tracking-tight text-red">Danger Zone</h2>
          <p className="mt-1 text-sm text-red/70">Sign out of your account on this device.</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-[var(--radius-btn)] bg-red px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 active:scale-95 transition-all duration-150"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

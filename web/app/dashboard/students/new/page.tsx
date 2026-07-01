'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';
import { createStudentSchema } from '../../../../../shared/schemas';

const newStudentFormSchema = createStudentSchema.omit({
  schoolId: true,
  photoUrl: true,
});

type FormErrors = Partial<
  Record<'name' | 'className' | 'routeId' | 'stopId' | 'medicalNotes', string>
>;

type RouteOption = {
  id: string;
  name: string;
  type: 'MORNING' | 'AFTERNOON';
  stops: { id: string; name: string; sequence: number }[];
};

type InvitedParent = {
  email: string;
};

const inviteEmailSchema = z.string().email('Enter a valid email address');

export default function NewStudentPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [routeId, setRouteId] = useState('');
  const [stopId, setStopId] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [createdStudentId, setCreatedStudentId] = useState<string | null>(
    null,
  );

  const [parentEmail, setParentEmail] = useState('');
  const [parentName, setParentName] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [invitedParents, setInvitedParents] = useState<InvitedParent[]>([]);

  useEffect(() => {
    async function loadRoutes() {
      const supabase = createClient();
      const { data } = await supabase
        .from('routes')
        .select('id, name, type, stops(id, name, sequence)')
        .order('name');
      setRoutes((data ?? []) as RouteOption[]);
    }
    loadRoutes();
  }, []);

  const selectedRoute = routes.find((route) => route.id === routeId);
  const sortedStops = selectedRoute
    ? [...selectedRoute.stops].sort((a, b) => a.sequence - b.sequence)
    : [];

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setErrors({});

    const parseResult = newStudentFormSchema.safeParse({
      name,
      className,
      routeId: routeId || undefined,
      stopId: stopId || undefined,
      medicalNotes: medicalNotes || undefined,
    });

    if (!parseResult.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parseResult.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
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
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-student`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            action: 'create',
            name: parseResult.data.name,
            className: parseResult.data.className,
            routeId: parseResult.data.routeId || undefined,
            stopId: parseResult.data.stopId || undefined,
            medicalNotes: parseResult.data.medicalNotes || undefined,
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
          setFormError(errorBody?.error ?? 'Failed to create student');
        }
        return;
      }

      const successBody = await response.json();
      setCreatedStudentId(successBody.data.id);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError(null);

    const emailParse = inviteEmailSchema.safeParse(parentEmail);
    if (!emailParse.success) {
      setInviteError(emailParse.error.issues[0]?.message ?? 'Invalid email');
      return;
    }

    if (!createdStudentId) return;

    setIsInviting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-student`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            action: 'invite-parent',
            studentId: createdStudentId,
            parentEmail: emailParse.data,
            parentName: parentName || undefined,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setInviteError(errorBody?.error ?? 'Failed to invite parent');
        return;
      }

      setInvitedParents((prev) => [...prev, { email: emailParse.data }]);
      setParentEmail('');
      setParentName('');
    } finally {
      setIsInviting(false);
    }
  }

  const studentCreated = createdStudentId !== null;

  return (
    <div className="mx-auto mt-4 max-w-lg rounded-xl border border-navy/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-navy">Add New Student</h2>

      {studentCreated && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3">
          Student created successfully. You can now invite parents below.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
        {formError && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {formError}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-navy mb-1.5">
            Student Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={studentCreated}
            placeholder="e.g., Chidi Okafor"
            className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy placeholder:text-navy/40 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-gray-50 disabled:text-navy/50"
          />
          {errors.name && (
            <p className="text-xs text-red-500 mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-navy mb-1.5">
            Class Name
          </label>
          <input
            type="text"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            disabled={studentCreated}
            placeholder="e.g., JSS1"
            className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy placeholder:text-navy/40 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-gray-50 disabled:text-navy/50"
          />
          {errors.className && (
            <p className="text-xs text-red-500 mt-1">{errors.className}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-navy mb-1.5">
            Route
          </label>
          <select
            value={routeId}
            onChange={(e) => {
              setRouteId(e.target.value);
              setStopId('');
            }}
            disabled={studentCreated}
            className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-gray-50 disabled:text-navy/50"
          >
            <option value="">No route assigned</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name} ({route.type})
              </option>
            ))}
          </select>
          {errors.routeId && (
            <p className="text-xs text-red-500 mt-1">{errors.routeId}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-navy mb-1.5">
            Stop
          </label>
          <select
            value={stopId}
            onChange={(e) => setStopId(e.target.value)}
            disabled={studentCreated || !routeId}
            className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-gray-50 disabled:text-navy/50"
          >
            <option value="">No stop assigned</option>
            {sortedStops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.sequence}. {stop.name}
              </option>
            ))}
          </select>
          {errors.stopId && (
            <p className="text-xs text-red-500 mt-1">{errors.stopId}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-navy mb-1.5">
            Medical Notes
          </label>
          <textarea
            value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            disabled={studentCreated}
            placeholder="Allergies, conditions, etc."
            rows={3}
            className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy placeholder:text-navy/40 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-gray-50 disabled:text-navy/50"
          />
          {errors.medicalNotes && (
            <p className="text-xs text-red-500 mt-1">{errors.medicalNotes}</p>
          )}
        </div>

        {!studentCreated && (
          <div className="flex justify-end gap-3 mt-2">
            <Link
              href="/dashboard/students"
              className="rounded-lg border border-navy/20 px-4 py-2.5 text-sm font-medium text-navy/70"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Adding...' : 'Add Student'}
            </button>
          </div>
        )}
      </form>

      <hr className="my-6 border-navy/10" />

      <div>
        <h3 className="text-base font-semibold text-navy">Invite Parents</h3>
        <p className="text-sm text-navy/60 mt-1">
          Parents will receive an email invitation to download the app and
          track this student&apos;s bus.
        </p>

        {!studentCreated ? (
          <p className="mt-4 text-sm italic text-navy/40">
            Save the student first to invite parents.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <form onSubmit={handleInvite} className="flex flex-col gap-3">
              {inviteError && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                  {inviteError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-navy mb-1.5">
                  Parent Email
                </label>
                <input
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@example.com"
                  className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy placeholder:text-navy/40 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy mb-1.5">
                  Parent Name (optional)
                </label>
                <input
                  type="text"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="e.g., Mrs. Okafor"
                  className="w-full rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy placeholder:text-navy/40 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
                />
              </div>

              <button
                type="submit"
                disabled={isInviting || !parentEmail}
                className="self-start rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isInviting ? 'Sending...' : 'Send Invite'}
              </button>
            </form>

            {invitedParents.length > 0 && (
              <div className="flex flex-col gap-2">
                {invitedParents.map((parent) => (
                  <div
                    key={parent.email}
                    className="flex items-center gap-2 rounded-lg border border-navy/10 px-3 py-2 text-sm text-navy"
                  >
                    <span className="text-green-600">&#10003;</span>
                    {parent.email}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard/students?created=1')}
                className="rounded-lg border border-navy/20 px-4 py-2.5 text-sm font-medium text-navy"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, GraduationCap, Route, MapPin, Users, BookOpen, CalendarDays } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { RetireStudentButton } from '@/components/dashboard/RetireStudentButton';
import { AddParentButton } from '@/components/dashboard/AddParentButton';

type StudentDetail = {
  id: string;
  name: string;
  class_name: string;
  is_active: boolean;
  photo_url: string | null;
  medical_notes: string | null;
  created_at: string;
  route: { id: string; name: string; type: string } | { id: string; name: string; type: string }[] | null;
  stop: { name: string; latitude: number; longitude: number } | { name: string; latitude: number; longitude: number }[] | null;
  student_parents: { parent: { id: string; name: string; phone: string | null } | { id: string; name: string; phone: string | null }[] | null }[];
};

function getRoute(r: StudentDetail['route']) {
  if (!r) return null;
  return Array.isArray(r) ? r[0] ?? null : r;
}

function getStop(s: StudentDetail['stop']) {
  if (!s) return null;
  return Array.isArray(s) ? s[0] ?? null : s;
}

function getParent(p: StudentDetail['student_parents'][number]['parent']) {
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

function Avatar({ name, photoUrl, size = 'lg' }: { name: string; photoUrl: string | null; size?: 'lg' | 'sm' }) {
  const dim = size === 'lg' ? 'h-16 w-16 text-lg' : 'h-8 w-8 text-[11px]';
  return (
    <div className={`${dim} shrink-0 flex items-center justify-center rounded-full bg-navy-light overflow-hidden`}>
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold text-navy">
          {name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
        </span>
      )}
    </div>
  );
}

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: raw } = await supabase
    .from('students')
    .select('*, route:routes(id, name, type), stop:stops(name, latitude, longitude), student_parents(parent:profiles(id, name, phone))')
    .eq('id', id)
    .single();

  if (!raw) notFound();

  const student = raw as unknown as StudentDetail;
  const route = getRoute(student.route);
  const stop = getStop(student.stop);
  const parents = student.student_parents
    .map((sp) => getParent(sp.parent))
    .filter(Boolean) as { id: string; name: string; phone: string | null }[];

  const routeTypeLabel = route?.type === 'MORNING' ? 'AM' : route?.type === 'AFTERNOON' ? 'PM' : route?.type === 'BOTH' ? 'AM + PM' : null;
  const createdDate = new Date(student.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="max-w-[800px] mx-auto">
      {/* Back nav */}
      <Link
        href="/dashboard/students"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-sub hover:text-ink transition-colors duration-100 mb-6"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Students
      </Link>

      {/* Header card */}
      <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={student.name} photoUrl={student.photo_url} size="lg" />
            <div>
              <h1 className="font-heading font-bold text-[24px] tracking-tight text-ink leading-tight">{student.name}</h1>
              <p className="text-[14px] text-sub mt-0.5">{student.class_name}</p>
              <span className={`mt-2 inline-flex rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold ${student.is_active ? 'bg-green-bg text-green' : 'bg-canvas text-sub'}`}>
                {student.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href={`/dashboard/students/${id}/edit`}
              className="border border-rule text-ink rounded-[var(--radius-btn)] px-4 py-2 text-[13px] font-medium hover:bg-canvas transition-colors duration-150"
            >
              Edit
            </Link>
            {student.is_active && (
              <RetireStudentButton studentId={id} studentName={student.name} />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Route & stop */}
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-canvas">
              <Route size={14} strokeWidth={1.75} className="text-sub" />
            </span>
            <p className="text-[12px] font-semibold uppercase tracking-widest text-sub">Route</p>
          </div>
          {route ? (
            <div className="flex flex-col gap-1">
              <p className="text-[15px] font-semibold text-ink">{route.name}</p>
              {routeTypeLabel && (
                <span className={`self-start inline-flex rounded-[var(--radius-chip)] px-2.5 py-0.5 text-[11px] font-semibold ${route.type === 'MORNING' ? 'bg-amber-light text-amber-dark' : route.type === 'AFTERNOON' ? 'bg-navy-light text-navy' : 'bg-canvas text-ink'}`}>
                  {routeTypeLabel}
                </span>
              )}
            </div>
          ) : (
            <p className="text-[14px] italic text-sub">Not assigned</p>
          )}
        </div>

        {/* Stop / pickup point */}
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-canvas">
              <MapPin size={14} strokeWidth={1.75} className="text-sub" />
            </span>
            <p className="text-[12px] font-semibold uppercase tracking-widest text-sub">Pickup Stop</p>
          </div>
          {stop ? (
            <div className="flex flex-col gap-1">
              <p className="text-[15px] font-semibold text-ink">{stop.name}</p>
              <p className="text-[12px] text-sub font-mono">
                {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}
              </p>
            </div>
          ) : (
            <p className="text-[14px] italic text-sub">Not assigned</p>
          )}
        </div>

        {/* Parents */}
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-canvas">
                <Users size={14} strokeWidth={1.75} className="text-sub" />
              </span>
              <p className="text-[12px] font-semibold uppercase tracking-widest text-sub">
                Parents / Guardians
              </p>
            </div>
            <AddParentButton studentId={id} studentName={student.name} />
          </div>
          {parents.length === 0 ? (
            <p className="text-[14px] italic text-sub">No parents linked</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {parents.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5">
                  <Avatar name={p.name} photoUrl={null} size="sm" />
                  <div>
                    <p className="text-[13px] font-medium text-ink">{p.name}</p>
                    {p.phone && <p className="text-[12px] text-sub">{p.phone}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Medical notes */}
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-canvas">
              <BookOpen size={14} strokeWidth={1.75} className="text-sub" />
            </span>
            <p className="text-[12px] font-semibold uppercase tracking-widest text-sub">Medical Notes</p>
          </div>
          {student.medical_notes ? (
            <p className="text-[14px] text-ink leading-relaxed">{student.medical_notes}</p>
          ) : (
            <p className="text-[14px] italic text-sub">None recorded</p>
          )}
        </div>
      </div>

      {/* Enrolled date */}
      <div className="mt-4 flex items-center gap-1.5 text-[12px] text-sub">
        <CalendarDays size={13} strokeWidth={1.75} />
        Enrolled {createdDate}
      </div>
    </div>
  );
}

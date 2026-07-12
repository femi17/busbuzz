'use client';

import Link from 'next/link';
import { Eye, Pencil } from 'lucide-react';
import { RetireStudentButton } from './RetireStudentButton';

export type StudentRow = {
  id: string;
  name: string;
  className: string;
  routeName: string | null;
  tripType: string;
  parentCount: number;
  isActive: boolean;
  photoUrl: string | null;
};

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-light overflow-hidden">
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-semibold text-navy">
          {name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function StudentTable({ students }: { students: StudentRow[] }) {
  const filtered = students;

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-canvas border-b border-rule">
              {['', 'Name', 'Class', 'Route', 'Parents', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-sub">
                  No students match your search.
                </td>
              </tr>
            ) : (
              filtered.map((student) => (
                <tr key={student.id} className="border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100">
                  <td className="pl-5 pr-2 py-3">
                    <Avatar name={student.name} photoUrl={student.photoUrl} />
                  </td>
                  <td className="px-5 py-3 text-[14px] font-medium text-ink whitespace-nowrap">{student.name}</td>
                  <td className="px-5 py-3 text-[14px] text-ink">{student.className}</td>
                  <td className="px-5 py-3 text-[14px] text-ink">
                    {student.routeName ? (
                      <>
                        {student.routeName}{' '}
                        <span className="text-sub text-[12px]">
                          ({student.tripType === 'MORNING' ? 'Morning' : student.tripType === 'AFTERNOON' ? 'Afternoon' : 'Both'})
                        </span>
                      </>
                    ) : (
                      <span className="italic text-sub">Not assigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-sub">{student.parentCount}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-[var(--radius-chip)] px-2.5 py-1 text-xs font-semibold ${student.isActive ? 'bg-green-bg text-green' : 'bg-canvas text-sub'}`}>
                      {student.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-4">
                      <Link
                        href={`/dashboard/students/${student.id}`}
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-ink transition-colors duration-100"
                      >
                        <Eye size={13} strokeWidth={2} />
                        View
                      </Link>
                      <Link
                        href={`/dashboard/students/${student.id}/edit`}
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-ink transition-colors duration-100"
                      >
                        <Pencil size={13} strokeWidth={2} />
                        Edit
                      </Link>
                      {student.isActive && (
                        <RetireStudentButton studentId={student.id} studentName={student.name} />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

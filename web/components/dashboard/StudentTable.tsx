'use client';

import { useState } from 'react';

export type StudentRow = {
  id: string;
  name: string;
  className: string;
  routeName: string | null;
  routeType: string | null;
  stopName: string | null;
  parentCount: number;
  isActive: boolean;
};

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

export function StudentTable({ students }: { students: StudentRow[] }) {
  const [search, setSearch] = useState('');

  const filtered = students.filter((student) =>
    student.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name..."
        className="w-full max-w-sm rounded-lg border border-navy/20 px-3 py-2.5 text-sm text-navy placeholder:text-navy/40 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
      />

      <div className="rounded-xl border border-navy/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-navy/10 text-navy/50">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Class</th>
              <th className="px-5 py-3 font-medium">Route</th>
              <th className="px-5 py-3 font-medium">Stop</th>
              <th className="px-5 py-3 font-medium">Parents</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((student) => (
              <tr key={student.id} className="border-b border-navy/5 last:border-0">
                <td className="px-5 py-3 font-medium text-navy">{student.name}</td>
                <td className="px-5 py-3 text-navy/80">{student.className}</td>
                <td className="px-5 py-3 text-navy/80">
                  {student.routeName ? (
                    `${student.routeName} (${student.routeType})`
                  ) : (
                    <span className="italic text-navy/40">Not assigned</span>
                  )}
                </td>
                <td className="px-5 py-3 text-navy/80">
                  {student.stopName ? (
                    student.stopName
                  ) : (
                    <span className="italic text-navy/40">Not assigned</span>
                  )}
                </td>
                <td className="px-5 py-3 text-navy/80">{student.parentCount}</td>
                <td className="px-5 py-3">
                  <StatusBadge isActive={student.isActive} />
                </td>
                <td className="px-5 py-3">
                  <span className="text-sm font-medium text-navy/30 cursor-not-allowed">
                    Edit
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

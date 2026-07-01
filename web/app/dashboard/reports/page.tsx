'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Navigation,
  Clock,
  GraduationCap,
  Route as RouteIcon,
  CircleDot,
  CircleCheck,
  CircleX,
  ArrowUpDown,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { StatCard } from '@/components/dashboard/StatCard';
import type {
  TripReportRow,
  AttendanceReportRow,
  ReportSummary,
  ApiResponse,
} from '../../../../shared/types';

const statusConfig = {
  ACTIVE: { className: 'bg-amber/20 text-amber-dark', icon: CircleDot },
  COMPLETED: { className: 'bg-route/10 text-route', icon: CircleCheck },
  CANCELLED: { className: 'bg-stop/10 text-stop', icon: CircleX },
} as const;

function StatusBadge({ status }: { status: TripReportRow['status'] }) {
  const { className, icon: Icon } = statusConfig[status];
  return (
    <span
      className={`board-figure inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${className}`}
    >
      <Icon size={12} strokeWidth={2.5} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function attendanceColor(pct: number): string {
  if (pct >= 90) return 'text-route';
  if (pct >= 70) return 'text-amber-dark';
  return 'text-stop';
}

function firstDayOfMonthISODate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-xl bg-navy/5 h-24" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="px-5 py-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="my-1 h-10 animate-pulse rounded bg-navy/5" />
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(firstDayOfMonthISODate());
  const [endDate, setEndDate] = useState(todayISODate());
  const [appliedStartDate, setAppliedStartDate] = useState(firstDayOfMonthISODate());
  const [appliedEndDate, setAppliedEndDate] = useState(todayISODate());
  const [dateError, setDateError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [trips, setTrips] = useState<TripReportRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const fetchReports = useCallback(
    async (rangeStart: string, rangeEnd: string) => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-reports`;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        async function fetchType<T>(type: 'trips' | 'attendance' | 'summary') {
          const params = new URLSearchParams({
            type,
            startDate: rangeStart,
            endDate: rangeEnd,
          });
          const response = await fetch(`${baseUrl}?${params.toString()}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              apikey: anonKey,
            },
          });
          if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            throw new Error(errorBody?.error ?? `Failed to fetch ${type} report`);
          }
          const body = (await response.json()) as ApiResponse<T>;
          return body.data;
        }

        const [summaryData, tripsData, attendanceData] = await Promise.all([
          fetchType<ReportSummary>('summary'),
          fetchType<{ trips: TripReportRow[] }>('trips'),
          fetchType<{ students: AttendanceReportRow[] }>('attendance'),
        ]);

        setSummary(summaryData);
        setTrips(tripsData.trips);
        setAttendance(attendanceData.students);
      } catch (err) {
        setFetchError(
          err instanceof Error ? err.message : 'Failed to load reports',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchReports(appliedStartDate, appliedEndDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApply() {
    setDateError(null);

    if (!startDate || !endDate) {
      setDateError('Both start and end dates are required.');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setDateError('Please enter valid dates.');
      return;
    }

    if (start > end) {
      setDateError('Start date must be before end date.');
      return;
    }

    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    fetchReports(startDate, endDate);
  }

  function handleExportCsv() {
    const headers = ['Date', 'Time', 'Bus', 'Route', 'Duration (min)', 'Status'];
    const rows = trips.map((trip) => {
      const date = new Date(trip.startedAt);
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        trip.busPlateNumber,
        trip.routeName,
        trip.durationMinutes !== null ? String(trip.durationMinutes) : 'In progress',
        trip.status,
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `busbuzz-trips-${appliedStartDate}-to-${appliedEndDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function toggleSort() {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }

  const sortedAttendance = [...attendance].sort((a, b) =>
    sortDirection === 'asc'
      ? a.attendancePercentage - b.attendancePercentage
      : b.attendancePercentage - a.attendancePercentage,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl font-bold text-navy">Reports</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy/50">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-navy/10 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy/50">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-navy/10 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
        {dateError && (
          <p className="text-xs text-stop">{dateError}</p>
        )}
      </div>

      {fetchError && (
        <div className="rounded-lg border border-stop/30 bg-stop/5 px-4 py-3 text-sm text-stop">
          {fetchError}
        </div>
      )}

      {isLoading ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Trips"
            value={summary?.totalTrips ?? 0}
            icon={Navigation}
            index={0}
          />
          <StatCard
            label="On-Time %"
            value={summary?.onTimePercentage ?? 0}
            icon={Clock}
            index={1}
          />
          <StatCard
            label="Students Transported"
            value={summary?.totalStudentsTransported ?? 0}
            icon={GraduationCap}
            index={2}
          />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.18, ease: 'easeOut' }}
            className="flex items-start justify-between rounded-xl border border-navy/10 bg-white p-5 shadow-sm"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-navy/50">
                Most Active Route
              </p>
              <p className="board-figure mt-2 text-3xl font-semibold text-navy">
                {summary?.mostActiveRoute?.tripCount ?? 0}
              </p>
              {summary?.mostActiveRoute && (
                <p className="mt-1 text-xs text-navy/50">
                  {summary.mostActiveRoute.name}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-amber/15 p-2 text-amber-dark">
              <RouteIcon size={20} strokeWidth={1.75} />
            </div>
          </motion.div>
        </div>
      )}

      <div className="rounded-xl border border-navy/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-navy/10 px-5 py-4">
          <h2 className="font-display text-base font-bold text-navy">
            Trip History
          </h2>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isLoading || trips.length === 0}
            className="rounded-lg border border-navy/10 px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : trips.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-navy/50">
            No trips found for this date range.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-navy/10 text-xs uppercase tracking-wide text-navy/40">
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Time</th>
                <th className="px-5 py-3 font-semibold">Bus</th>
                <th className="px-5 py-3 font-semibold">Route</th>
                <th className="px-5 py-3 font-semibold">Duration</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip, index) => (
                <motion.tr
                  key={trip.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.04 }}
                  className="border-b border-navy/5 last:border-0"
                >
                  <td className="board-figure px-5 py-3 text-navy/80">
                    {new Date(trip.startedAt).toLocaleDateString()}
                  </td>
                  <td className="board-figure px-5 py-3 text-navy/80">
                    {new Date(trip.startedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="board-figure px-5 py-3 font-semibold text-navy">
                    {trip.busPlateNumber}
                  </td>
                  <td className="px-5 py-3 text-navy/80">{trip.routeName}</td>
                  <td className="board-figure px-5 py-3 text-navy/80">
                    {trip.durationMinutes !== null
                      ? `${trip.durationMinutes} min`
                      : 'In progress'}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={trip.status} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-navy/10 bg-white shadow-sm">
        <div className="border-b border-navy/10 px-5 py-4">
          <h2 className="font-display text-base font-bold text-navy">
            Student Attendance
          </h2>
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : sortedAttendance.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-navy/50">
            No attendance found for this date range.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-navy/10 text-xs uppercase tracking-wide text-navy/40">
                <th className="px-5 py-3 font-semibold">Student Name</th>
                <th className="px-5 py-3 font-semibold">Class</th>
                <th className="px-5 py-3 font-semibold">Total Trips</th>
                <th className="px-5 py-3 font-semibold">Boarded</th>
                <th className="px-5 py-3 font-semibold">Absent</th>
                <th className="px-5 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={toggleSort}
                    className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-navy/40 hover:text-navy"
                  >
                    Attendance %
                    <ArrowUpDown size={12} strokeWidth={2.5} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAttendance.map((student, index) => (
                <motion.tr
                  key={student.studentId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.04 }}
                  className="border-b border-navy/5 last:border-0"
                >
                  <td className="px-5 py-3 font-semibold text-navy">
                    {student.studentName}
                  </td>
                  <td className="px-5 py-3 text-navy/80">{student.className}</td>
                  <td className="board-figure px-5 py-3 text-navy/80">
                    {student.totalTrips}
                  </td>
                  <td className="board-figure px-5 py-3 text-navy/80">
                    {student.boardedCount}
                  </td>
                  <td className="board-figure px-5 py-3 text-navy/80">
                    {student.absentCount}
                  </td>
                  <td
                    className={`board-figure px-5 py-3 font-semibold ${attendanceColor(student.attendancePercentage)}`}
                  >
                    {student.attendancePercentage.toFixed(1)}%
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

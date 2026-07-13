'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Navigation,
  Clock,
  GraduationCap,
  Route as RouteIcon,
  ArrowUpDown,
  Play,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { StatCard } from '@/components/dashboard/StatCard';
import { TripReplayModal } from '@/components/dashboard/TripReplayModal';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import type {
  TripReportRow,
  AttendanceReportRow,
  ReportSummary,
  ApiResponse,
} from '../../../../shared/types';

function formatBoardTime(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

function StatusBadge({ status }: { status: TripReportRow['status'] }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 bg-green-bg text-green rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold">
        Active
      </span>
    );
  }
  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center gap-1.5 bg-red-bg text-red rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center bg-canvas text-sub rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold">
      Completed
    </span>
  );
}

function Paginator({
  page,
  pageCount,
  total,
  noun,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  noun: string;
  onPage: (updater: (prev: number) => number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-rule px-4 py-2.5">
      <p className="text-[11px] text-sub">
        {total} {total === 1 ? noun : `${noun}s`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-[var(--radius-btn)] border border-rule px-2.5 py-1 text-[12px] font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40 hover:bg-canvas transition-colors"
        >
          Prev
        </button>
        <span className="board-figure text-[11px] text-sub tabular-nums">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPage((p) => Math.min(pageCount, p + 1))}
          disabled={page >= pageCount}
          className="rounded-[var(--radius-btn)] border border-rule px-2.5 py-1 text-[12px] font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40 hover:bg-canvas transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function attendanceColor(pct: number): string {
  if (pct >= 90) return 'text-green';
  if (pct >= 70) return 'text-amber-dark';
  return 'text-red';
}

function firstDayOfMonthISODate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-[var(--radius-card)] bg-rule h-24" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="px-5 py-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="my-1 h-10 animate-pulse rounded bg-rule" />
      ))}
    </div>
  );
}

async function loadReportsData(rangeStart: string, rangeEnd: string) {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-reports`;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  async function fetchType<T>(type: 'trips' | 'attendance' | 'summary') {
    const params = new URLSearchParams({ type, startDate: rangeStart, endDate: rangeEnd });
    const response = await fetch(`${baseUrl}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey },
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

  return { summaryData, tripsData, attendanceData };
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
  const [replayTripId, setReplayTripId] = useState<string | null>(null);

  // Both tables show 5 rows per page; the rest are reachable via pagination.
  const ROWS_PER_PAGE = 5;
  const [tripPage, setTripPage] = useState(1);
  const [attendancePage, setAttendancePage] = useState(1);

  const fetchReports = useCallback(async (rangeStart: string, rangeEnd: string) => {
    setIsLoading(true);
    setFetchError(null);
    setTripPage(1);
    setAttendancePage(1);
    try {
      const { summaryData, tripsData, attendanceData } = await loadReportsData(rangeStart, rangeEnd);
      setSummary(summaryData);
      setTrips(tripsData.trips);
      setAttendance(attendanceData.students);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    loadReportsData(appliedStartDate, appliedEndDate)
      .then(({ summaryData, tripsData, attendanceData }) => {
        if (ignore) return;
        setSummary(summaryData);
        setTrips(tripsData.trips);
        setAttendance(attendanceData.students);
        setFetchError(null);
      })
      .catch((err) => {
        if (ignore) return;
        setFetchError(err instanceof Error ? err.message : 'Failed to load reports');
      })
      .finally(() => {
        if (ignore) return;
        setIsLoading(false);
      });
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApply() {
    setDateError(null);
    if (!startDate || !endDate) { setDateError('Both start and end dates are required.'); return; }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) { setDateError('Please enter valid dates.'); return; }
    if (start > end) { setDateError('Start date must be before end date.'); return; }
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
    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
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

  const sortedAttendance = [...attendance].sort((a, b) =>
    sortDirection === 'asc' ? a.attendancePercentage - b.attendancePercentage : b.attendancePercentage - a.attendancePercentage,
  );

  const tripPageCount = Math.max(1, Math.ceil(trips.length / ROWS_PER_PAGE));
  const attendancePageCount = Math.max(1, Math.ceil(sortedAttendance.length / ROWS_PER_PAGE));
  const clampedTripPage = Math.min(tripPage, tripPageCount);
  const clampedAttendancePage = Math.min(attendancePage, attendancePageCount);
  const pagedTrips = trips.slice(
    (clampedTripPage - 1) * ROWS_PER_PAGE,
    clampedTripPage * ROWS_PER_PAGE,
  );
  const pagedAttendance = sortedAttendance.slice(
    (clampedAttendancePage - 1) * ROWS_PER_PAGE,
    clampedAttendancePage * ROWS_PER_PAGE,
  );

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
      <DashboardHeader title="Reports" subtitle="Trip history and attendance analytics" noMargin />

      {/* Date filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sub">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-[var(--radius-btn)] border border-rule px-3 py-2 text-sm text-ink focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sub">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-[var(--radius-btn)] border border-rule px-3 py-2 text-sm text-ink focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          className="rounded-[var(--radius-btn)] bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-mid active:scale-95 transition-all duration-150"
        >
          Apply
        </button>
        {dateError && <p className="text-xs text-red">{dateError}</p>}
      </div>

      {fetchError && (
        <div className="rounded-[var(--radius-btn)] border border-red/30 bg-red-bg px-4 py-3 text-sm text-red">
          {fetchError}
        </div>
      )}

      {isLoading ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Trips" value={summary?.totalTrips ?? 0} icon={<Navigation size={18} strokeWidth={1.75} />} index={0} />
          <StatCard label="On-Time %" value={summary?.onTimePercentage ?? 0} icon={<Clock size={18} strokeWidth={1.75} />} index={1} />
          <StatCard label="Students Transported" value={summary?.totalStudentsTransported ?? 0} icon={<GraduationCap size={18} strokeWidth={1.75} />} index={2} />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.18, ease: 'easeOut' }}
            className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5 hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-[10px] font-semibold text-sub uppercase tracking-[0.14em]">Most Active Route</p>
              <div className="rounded-[10px] bg-night p-2 text-amber">
                <RouteIcon size={18} strokeWidth={1.75} />
              </div>
            </div>
            <p className="board-figure text-[34px] font-semibold text-ink leading-none">
              {summary?.mostActiveRoute?.tripCount ?? 0}
            </p>
            {summary?.mostActiveRoute && (
              <p className="mt-2 text-[12px] text-sub">{summary.mostActiveRoute.name}</p>
            )}
          </motion.div>
        </div>
      )}

      {/* Trip History + Student Attendance — side by side on large screens */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {/* Trip History */}
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-rule px-4 py-3.5">
            <h2 className="font-heading font-bold text-[16px] tracking-tight text-ink">Trip History</h2>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isLoading || trips.length === 0}
              className="rounded-[var(--radius-btn)] border border-rule px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 transition-all duration-150"
            >
              Export CSV
            </button>
          </div>

          {isLoading ? <TableSkeleton /> : trips.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-sub">
              No trips found for this date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-canvas border-b border-rule">
                    {['Date', 'Time', 'Bus', 'Route', 'Duration', 'Status'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-2.5 text-[10px] font-semibold text-sub uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedTrips.map((trip, index) => (
                    <motion.tr
                      key={trip.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.04 }}
                      className="group border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100"
                    >
                      <td className="board-figure whitespace-nowrap px-4 py-2.5 text-[12px] text-sub">
                        {new Date(trip.startedAt).toLocaleDateString()}
                      </td>
                      <td className="board-figure whitespace-nowrap px-4 py-2.5 text-[12px] text-sub">
                        {new Date(trip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="board-figure whitespace-nowrap px-4 py-2.5 text-[12px] text-sub font-semibold">{trip.busPlateNumber}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-ink">{trip.routeName}</td>
                      <td className="board-figure whitespace-nowrap px-4 py-2.5 text-[12px] text-sub">
                        {trip.durationMinutes !== null ? `${trip.durationMinutes} min` : 'In progress'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={trip.status} />
                          {trip.status !== 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => setReplayTripId(trip.id)}
                              className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-rule px-2 py-1 text-[11px] font-semibold text-navy hover:border-amber hover:text-amber-dark active:scale-95 transition-all duration-150"
                              aria-label={`Replay ${trip.routeName} trip`}
                            >
                              <Play size={11} fill="currentColor" />
                              Replay
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              <Paginator
                page={clampedTripPage}
                pageCount={tripPageCount}
                total={trips.length}
                noun="trip"
                onPage={setTripPage}
              />
            </div>
          )}
        </div>

        {/* Student Attendance */}
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
          <div className="border-b border-rule px-4 py-3.5">
            <h2 className="font-heading font-bold text-[16px] tracking-tight text-ink">Student Attendance</h2>
          </div>

          {isLoading ? <TableSkeleton /> : sortedAttendance.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-sub">
              No attendance found for this date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-canvas border-b border-rule">
                    {['Student Name', 'Class', 'Total Trips', 'Boarded', 'Absent', 'Avg Board Time'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-2.5 text-[10px] font-semibold text-sub uppercase tracking-widest">{h}</th>
                    ))}
                    <th className="whitespace-nowrap px-4 py-2.5 text-[10px] font-semibold text-sub uppercase tracking-widest">
                      <button
                        type="button"
                        onClick={() => setSortDirection((prev) => prev === 'asc' ? 'desc' : 'asc')}
                        className="inline-flex items-center gap-1 text-sub hover:text-ink uppercase tracking-widest"
                      >
                        Attendance %
                        <ArrowUpDown size={12} strokeWidth={2.5} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAttendance.map((student, index) => (
                    <motion.tr
                      key={student.studentId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.04 }}
                      className="group border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-ink font-semibold">{student.studentName}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-ink">{student.className}</td>
                      <td className="board-figure whitespace-nowrap px-4 py-2.5 text-[12px] text-sub">{student.totalTrips}</td>
                      <td className="board-figure whitespace-nowrap px-4 py-2.5 text-[12px] text-sub">{student.boardedCount}</td>
                      <td className="board-figure whitespace-nowrap px-4 py-2.5 text-[12px] text-sub">{student.absentCount}</td>
                      <td className="board-figure whitespace-nowrap px-4 py-2.5 text-[12px] text-ink font-semibold">
                        {formatBoardTime(student.avgBoardSeconds)}
                        {student.avgBoardSeconds !== null && student.timedBoardings > 0 && (
                          <span className="ml-1 text-[10px] font-normal text-sub">({student.timedBoardings})</span>
                        )}
                      </td>
                      <td className={`board-figure whitespace-nowrap px-4 py-2.5 text-[12px] font-semibold ${attendanceColor(student.attendancePercentage)}`}>
                        {student.attendancePercentage.toFixed(1)}%
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              <Paginator
                page={clampedAttendancePage}
                pageCount={attendancePageCount}
                total={sortedAttendance.length}
                noun="student"
                onPage={setAttendancePage}
              />
            </div>
          )}
        </div>
      </div>

      {replayTripId && (
        <TripReplayModal tripId={replayTripId} onClose={() => setReplayTripId(null)} />
      )}
    </div>
  );
}

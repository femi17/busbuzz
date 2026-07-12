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
  Trophy,
  Send,
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
  SemesterAward,
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

  // Most On-Time Student award
  const [award, setAward] = useState<SemesterAward | null>(null);
  const [awardLabel, setAwardLabel] = useState('');
  const [isComputing, setIsComputing] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);
  const [awardMessage, setAwardMessage] = useState<string | null>(null);

  const loadLatestAward = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('semester_awards')
      .select('*')
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setAward({
        id: data.id,
        schoolId: data.school_id,
        label: data.label,
        periodStart: data.period_start,
        periodEnd: data.period_end,
        winnerStudentId: data.winner_student_id,
        winnerName: data.winner_name,
        winnerAvgBoardSeconds: data.winner_avg_board_seconds,
        winnerTimedBoardings: data.winner_timed_boardings,
        leaderboard: data.leaderboard ?? [],
        emailSent: data.email_sent,
        emailTo: data.email_to,
        computedAt: data.computed_at,
      });
    }
  }, []);

  async function handleComputeAward() {
    setAwardError(null);
    setAwardMessage(null);
    if (!awardLabel.trim()) { setAwardError('Give the term a name, e.g. "First Term 2025/26".'); return; }
    if (!appliedStartDate || !appliedEndDate) { setAwardError('Pick a date range above first.'); return; }
    setIsComputing(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/compute-ontime-award`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            startDate: appliedStartDate,
            endDate: appliedEndDate,
            label: awardLabel.trim(),
          }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setAwardError(body?.error ?? 'Failed to compute award');
        return;
      }
      setAward(body.data.award as SemesterAward);
      setAwardMessage(body.message ?? 'Award computed');
    } catch (err) {
      setAwardError(err instanceof Error ? err.message : 'Failed to compute award');
    } finally {
      setIsComputing(false);
    }
  }

  const fetchReports = useCallback(async (rangeStart: string, rangeEnd: string) => {
    setIsLoading(true);
    setFetchError(null);
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
    loadLatestAward();
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
                  {trips.map((trip, index) => (
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
                  {sortedAttendance.map((student, index) => (
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
            </div>
          )}
        </div>
      </div>

      {/* Most On-Time Student — semester award */}
      <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
        <div aria-hidden className="h-1 hazard-stripe" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-[10px] bg-night p-2 text-amber">
              <Trophy size={18} strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="font-heading font-bold text-[16px] tracking-tight text-ink">Most On-Time Student</h2>
              <p className="text-[12px] text-sub">Ranks readiness — time from the bus reaching a stop to boarding — over the selected date range.</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          {/* Compute controls */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sub">Term name</label>
              <input
                type="text"
                value={awardLabel}
                onChange={(e) => setAwardLabel(e.target.value)}
                placeholder="e.g. First Term 2025/26"
                className="w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
              />
            </div>
            <button
              type="button"
              onClick={handleComputeAward}
              disabled={isComputing}
              className="inline-flex items-center gap-2 rounded-[var(--radius-btn)] bg-amber px-4 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
            >
              <Send size={14} />
              {isComputing ? 'Computing…' : 'Compute & send award'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-sub">
            Uses the date range above ({appliedStartDate} → {appliedEndDate}). Emails the result to the school inbox.
          </p>
          {awardError && <p className="mt-2 text-xs text-red">{awardError}</p>}
          {awardMessage && <p className="mt-2 text-xs text-green">{awardMessage}</p>}

          {/* Latest award */}
          {award && (
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
              {/* Winner hero */}
              <div className="rounded-[16px] bg-night p-5 text-white">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-amber">🏆 {award.label}</p>
                  {award.emailSent && (
                    <span className="rounded-[var(--radius-chip)] bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70">Emailed</span>
                  )}
                </div>
                {award.winnerName ? (
                  <>
                    <p className="mt-3 font-heading text-[24px] font-bold leading-tight">{award.winnerName}</p>
                    <p className="mt-1 text-[13px] text-white/55">
                      Ready in{' '}
                      <span className="board-figure font-semibold text-amber">{formatBoardTime(award.winnerAvgBoardSeconds)}</span>{' '}
                      on average · {award.winnerTimedBoardings} timed pickups
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-[14px] text-white/70">No student had enough timed pickups to qualify for this period.</p>
                )}
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                  {award.periodStart} → {award.periodEnd}
                </p>
              </div>

              {/* Leaderboard */}
              {award.leaderboard.length > 0 && (
                <div className="overflow-hidden rounded-[16px] border border-rule">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-canvas border-b border-rule">
                        {['#', 'Student', 'Class', 'Avg Board', 'Pickups'].map((h) => (
                          <th key={h} className="whitespace-nowrap px-4 py-2 text-[10px] font-semibold text-sub uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {award.leaderboard.map((entry, i) => (
                        <tr key={entry.studentId} className={`border-b border-rule last:border-0 ${i === 0 ? 'bg-amber-light/40' : 'bg-surface'}`}>
                          <td className="board-figure px-4 py-2 text-[12px] font-semibold text-sub">{i + 1}</td>
                          <td className="px-4 py-2 text-[13px] text-ink font-semibold">{entry.studentName}</td>
                          <td className="px-4 py-2 text-[12px] text-sub">{entry.className}</td>
                          <td className="board-figure px-4 py-2 text-[12px] text-ink font-semibold">{formatBoardTime(entry.avgBoardSeconds)}</td>
                          <td className="board-figure px-4 py-2 text-[12px] text-sub">{entry.timedBoardings}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

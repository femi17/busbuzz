'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type ParsedRow = { name: string; className: string; pickupAddress: string; routeName: string };
type ImportResult = { created: number; skipped: number; unmatchedRoutes: string[] };

const CSV_TEMPLATE = `name,class,address,route
Chidi Okafor,JSS1,14 Awolowo Road Ikoyi Lagos,Morning Route A
Amina Bello,SS2,5 Broad Street Lagos Island,Afternoon Route B`;

const HEADERS = ['Name', 'Class', 'Address', 'Route'];

function parseCsv(text: string): { rows: ParsedRow[]; warning: boolean } {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  let warning = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip header row (flexible matching)
    if (/^name[,\t]/i.test(line)) continue;
    const fields = line.split(',').map((f) => f.trim().replace(/^"|"$/g, ''));
    if (fields.length < 3) { warning = true; continue; }
    const [name, className, pickupAddress, ...rest] = fields;
    const routeName = rest.join(',').trim();
    if (!name || !className) { warning = true; continue; }
    rows.push({ name, className, pickupAddress: pickupAddress ?? '', routeName: routeName ?? '' });
  }
  return { rows, warning };
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'busbuzz-students-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkImportStudentsPage() {
  const dropId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseWarning, setParseWarning] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const { rows, warning } = parseCsv(text);
      setParsedRows(rows);
      setParseWarning(warning);
      setFileName(file.name);
      setResult(null);
      setImportError(null);
    };
    reader.readAsText(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  function handleCancel() {
    setParsedRows([]);
    setParseWarning(false);
    setFileName(null);
    setResult(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleImport() {
    setIsImporting(true);
    setImportError(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-student`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({
          action: 'bulk',
          students: parsedRows.map((r) => ({
            name: r.name,
            className: r.className,
            pickupAddress: r.pickupAddress || undefined,
            routeName: r.routeName,
          })),
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setImportError(errorBody?.error ?? 'Failed to import students');
        return;
      }
      const successBody = await response.json();
      setResult(successBody.data as ImportResult);
    } finally {
      setIsImporting(false);
    }
  }

  const previewRows = parsedRows.slice(0, 10);
  const extraRowCount = parsedRows.length - previewRows.length;

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Bulk Import Students</h1>
          <p className="text-sm text-sub mt-1">Import multiple students from a CSV file</p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-2 rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas transition-colors duration-150 active:scale-95"
        >
          <Download size={15} strokeWidth={2} />
          Download Template
        </button>
      </div>

      <div className="mx-auto max-w-2xl bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
        {/* Format guide */}
        <div className="rounded-[var(--radius-btn)] bg-navy-light border border-navy/10 px-4 py-3">
          <p className="text-[12px] font-semibold text-navy mb-1.5">CSV columns (in order)</p>
          <div className="flex gap-4">
            {['name', 'class', 'address', 'route'].map((col) => (
              <code key={col} className="text-[12px] text-navy font-mono bg-navy/10 rounded px-1.5 py-0.5">
                {col}
              </code>
            ))}
          </div>
          <p className="text-[11px] text-sub mt-2">
            Route must exactly match a route name in your school. Address is optional — it helps for future stop auto-assignment.
          </p>
        </div>

        {importError && (
          <div className="mt-4 rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">{importError}</div>
        )}

        {result ? (
          <div className="mt-5 flex flex-col gap-3">
            <div className="rounded-[var(--radius-btn)] bg-green-bg border border-green/20 text-green text-sm px-4 py-3">
              {result.created} {result.created === 1 ? 'student' : 'students'} imported successfully.
            </div>
            {result.skipped > 0 && (
              <div className="rounded-[var(--radius-btn)] bg-amber-light border border-amber/30 text-amber-dark text-sm px-4 py-3">
                {result.skipped} {result.skipped === 1 ? 'row' : 'rows'} skipped — route name not found:{' '}
                <span className="font-medium">{result.unmatchedRoutes.join(', ')}</span>
              </div>
            )}
            <Link
              href="/dashboard/students?imported=1"
              className="mt-2 self-start rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 active:scale-95 transition-all duration-150"
            >
              Back to Students
            </Link>
          </div>
        ) : parsedRows.length === 0 ? (
          <label
            htmlFor={dropId}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-5 py-16 text-center transition-colors duration-150 ${isDragging ? 'border-amber bg-amber/5' : 'border-rule hover:border-amber'}`}
          >
            <p className="text-sm font-medium text-ink">Drop your CSV here</p>
            <p className="text-[12px] text-sub">or click to browse files</p>
            <input
              id={dropId}
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            {fileName && (
              <p className="text-sm text-sub">
                File: <span className="font-medium text-ink">{fileName}</span>
              </p>
            )}

            {parseWarning && (
              <div className="rounded-[var(--radius-btn)] bg-amber-light border border-amber/30 text-amber-dark text-sm px-4 py-3">
                Some rows were skipped — each row needs at least name, class, and route.
              </div>
            )}

            <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-canvas border-b border-rule">
                    {HEADERS.map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[11px] font-semibold text-sub uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.name}-${index}`} className="border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100">
                      <td className="px-4 py-2.5 text-[14px] text-ink">{row.name}</td>
                      <td className="px-4 py-2.5 text-[14px] text-ink">{row.className}</td>
                      <td className="px-4 py-2.5 text-[14px] text-sub">{row.pickupAddress || <span className="italic">—</span>}</td>
                      <td className="px-4 py-2.5 text-[14px] text-ink">{row.routeName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {extraRowCount > 0 && (
              <p className="text-xs text-sub">+ {extraRowCount} more {extraRowCount === 1 ? 'row' : 'rows'}</p>
            )}

            <p className="text-sm font-medium text-ink">
              Ready to import {parsedRows.length} {parsedRows.length === 1 ? 'student' : 'students'}
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
              >
                {isImporting ? 'Importing…' : `Import ${parsedRows.length} Students`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

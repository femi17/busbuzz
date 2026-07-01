'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

type ParsedRow = {
  name: string;
  className: string;
  stopName: string;
};

type ImportResult = {
  created: number;
  skipped: number;
  unmatchedStops: string[];
};

function parseCsv(text: string): { rows: ParsedRow[]; warning: boolean } {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  let warning = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (
      /^name\s*,\s*classname\s*,\s*stopname$/i.test(line.replace(/\s+/g, ''))
    ) {
      continue;
    }

    const fields = line.split(',').map((field) => field.trim());
    const nonEmptyFields = fields.filter((field) => field.length > 0);

    if (fields.length !== 3 || nonEmptyFields.length !== 3) {
      warning = true;
      continue;
    }

    rows.push({
      name: fields[0],
      className: fields[1],
      stopName: fields[2],
    });
  }

  return { rows, warning };
}

export default function BulkImportStudentsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseWarning, setParseWarning] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleDropZoneClick() {
    fileInputRef.current?.click();
  }

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

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function handleCancel() {
    setParsedRows([]);
    setParseWarning(false);
    setFileName(null);
    setResult(null);
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleImport() {
    setIsImporting(true);
    setImportError(null);
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
            action: 'bulk',
            students: parsedRows,
          }),
        },
      );

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
    <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-navy/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-navy">Bulk Import Students</h2>

      <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 text-navy/80 text-sm px-4 py-3">
        <p className="font-medium">CSV Format: name, className, stopName</p>
        <p className="mt-1">Example:</p>
        <pre className="mt-1 whitespace-pre-wrap text-xs">
          Chidi Okafor, JSS1, Ikoyi Roundabout{'\n'}
          Amina Bello, SS2, Victoria Island Gate
        </pre>
      </div>

      {importError && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {importError}
        </div>
      )}

      {result ? (
        <div className="mt-5 flex flex-col gap-3">
          <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3">
            {result.created} students created successfully
          </div>
          {result.skipped > 0 && (
            <div className="rounded-lg bg-amber/15 border border-amber/30 text-amber-dark text-sm px-4 py-3">
              {result.skipped} students skipped — stop name not found:{' '}
              {result.unmatchedStops.join(', ')}
            </div>
          )}
          <Link
            href="/dashboard/students?imported=1"
            className="mt-2 self-start rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy"
          >
            Back to Students
          </Link>
        </div>
      ) : parsedRows.length === 0 ? (
        <div
          onClick={handleDropZoneClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy/20 px-5 py-16 text-center hover:border-amber"
        >
          <p className="text-sm text-navy/60">
            Click to select a CSV file, or drag and drop it here.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          {fileName && (
            <p className="text-sm text-navy/60">
              File: <span className="font-medium text-navy">{fileName}</span>
            </p>
          )}

          {parseWarning && (
            <div className="rounded-lg bg-amber/15 border border-amber/30 text-amber-dark text-sm px-4 py-3">
              Some rows could not be parsed and were skipped (expected exactly
              3 fields per row).
            </div>
          )}

          <div className="rounded-xl border border-navy/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-navy/10 text-navy/50">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Class Name</th>
                  <th className="px-4 py-2.5 font-medium">Stop Name</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr
                    key={`${row.name}-${index}`}
                    className="border-b border-navy/5 last:border-0"
                  >
                    <td className="px-4 py-2.5 text-navy">{row.name}</td>
                    <td className="px-4 py-2.5 text-navy/80">
                      {row.className}
                    </td>
                    <td className="px-4 py-2.5 text-navy/80">
                      {row.stopName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {extraRowCount > 0 && (
            <p className="text-xs text-navy/50">
              {extraRowCount} more rows
            </p>
          )}

          <p className="text-sm font-medium text-navy">
            Ready to import {parsedRows.length} students
          </p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-navy/20 px-4 py-2.5 text-sm font-medium text-navy/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting}
              className="rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isImporting ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

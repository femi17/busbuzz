'use client';

import { useId } from 'react';
import { Camera } from 'lucide-react';

type Props = {
  previewUrl: string | null;
  name: string;
  size?: number;
  onChange: (file: File) => void;
};

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

export function PhotoUpload({ previewUrl, name, size = 80, onChange }: Props) {
  const inputId = useId();

  return (
    <div className="flex flex-col items-center gap-2">
      <label
        htmlFor={inputId}
        className="group relative shrink-0 cursor-pointer overflow-hidden rounded-full bg-navy-light focus-within:ring-2 focus-within:ring-amber focus-within:ring-offset-2"
        style={{ width: size, height: size }}
        aria-label="Upload photo"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center font-semibold text-navy"
            style={{ fontSize: size * 0.3 }}
          >
            {initials(name) || '?'}
          </span>
        )}

        {/* Camera overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-navy/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <Camera size={size * 0.28} strokeWidth={1.75} className="text-white" />
        </div>

        <input
          id={inputId}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onChange(file);
            e.target.value = '';
          }}
        />
      </label>

      <p className="text-[11px] text-sub">Click to upload photo</p>
    </div>
  );
}

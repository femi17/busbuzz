'use client';

import { useCallback, useRef, useState } from 'react';
import { mapboxSuggest, type GeoSuggestion } from '@/lib/mapbox-geocode';

type Coords = { lat: number; lng: number };

type Props = {
  value: string;
  onChange: (address: string, coords: Coords | null) => void;
  placeholder?: string;
  className: string;
  disabled?: boolean;
};

// Address input backed by the Mapbox Geocoding API (autocomplete, Nigeria,
// Lagos-biased). Coordinates ride along with each suggestion, so the address is
// map-verified the moment it's picked — no later geocode pass, and it matches
// what the edge functions would resolve server-side.
export function AddressAutocompleteInput({ value, onChange, placeholder = 'Pickup address', className, disabled }: Props) {
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(async (input: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const results = await mapboxSuggest(input, controller.signal);
    if (!controller.signal.aborted) setSuggestions(results);
  }, []);

  function handleInputChange(val: string) {
    onChange(val, null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length >= 3) {
      setShowSuggestions(true);
      debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }

  function selectSuggestion(item: GeoSuggestion) {
    setShowSuggestions(false);
    setSuggestions([]);
    onChange(item.placeName, { lat: item.lat, lng: item.lng });
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => value.length >= 3 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        className={className}
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute left-0 top-full mt-1 w-full min-w-[280px] bg-surface border border-rule rounded-[var(--radius-btn)] shadow-[var(--shadow-float)] z-50 overflow-hidden">
          {suggestions.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={() => selectSuggestion(item)}
                className="w-full text-left px-3 py-2.5 text-sm text-ink hover:bg-canvas transition-colors duration-100 truncate"
              >
                {item.placeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

import { useCallback, useRef, useState } from 'react';
import { useGoogleMapsLoaded } from '@/lib/google-maps';

type Coords = { lat: number; lng: number };
type Suggestion = { text: string; suggestion: any };

type Props = {
  value: string;
  onChange: (address: string, coords: Coords | null) => void;
  placeholder?: string;
  className: string;
  disabled?: boolean;
};

// Address input backed by the new Places Autocomplete API — no shadow-DOM
// widget, so it can be styled to match the rest of the form. Coordinates are
// captured as soon as a suggestion is picked, so the address is map-verified
// from the moment it's entered rather than relying on a later geocode pass.
export function AddressAutocompleteInput({ value, onChange, placeholder = 'Pickup address', className, disabled }: Props) {
  const mapsLoaded = useGoogleMapsLoaded();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const sessionRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input.trim() || input.length < 3 || !mapsLoaded) { setSuggestions([]); return; }
    try {
      const g = (window as any).google;
      if (!sessionRef.current) sessionRef.current = new g.maps.places.AutocompleteSessionToken();
      const { suggestions: sugs } = await g.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionRef.current,
        includedRegionCodes: ['ng'],
        language: 'en',
      });
      setSuggestions((sugs as any[]).map((s: any) => ({ text: s.placePrediction.text.toString(), suggestion: s })));
    } catch {
      setSuggestions([]);
    }
  }, [mapsLoaded]);

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

  async function selectSuggestion(item: Suggestion) {
    setShowSuggestions(false);
    setSuggestions([]);
    sessionRef.current = null;
    let coords: Coords | null = null;
    try {
      const place = item.suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ['location'] });
      if (place.location) coords = { lat: place.location.lat(), lng: place.location.lng() };
    } catch { /* ignore */ }
    onChange(item.text, coords);
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
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

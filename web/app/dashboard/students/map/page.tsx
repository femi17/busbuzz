'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, X, Save, ChevronDown, ChevronUp, UserX } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { loadGoogleMaps } from '@/lib/google-maps';

/* ── Google Maps loader ─────────────────────────────────────── */

function useGoogleMaps(): boolean {
  const [loaded, setLoaded] = useState(
    () => typeof window !== 'undefined' && !!(window as any).google?.maps?.places,
  );
  useEffect(() => {
    if (loaded) return;
    loadGoogleMaps().then(() => setLoaded(true)).catch(() => {});
  }, [loaded]);
  return loaded;
}

/* ── types ─────────────────────────────────────────────────── */

// Mirrors the DB's trip_type enum (and the Edit Student page's own selector)
// — this is what the driver app actually filters students by per run
// (.in('trip_type', [direction, 'BOTH'])). Previously this page used a local
// ROUND_TRIP/ONE_WAY toggle that never read or wrote this column at all, so
// every student silently kept the DB default of 'BOTH' regardless of what
// the toggle showed — the reason morning-only students kept appearing on
// afternoon runs.
type TripType = 'MORNING' | 'AFTERNOON' | 'BOTH';
type RouteOption = { id: string; name: string };

type MapStudent = {
  id: string;          // actual UUID for existing, `draft-${ts}` for new
  name: string;
  className: string;
  address: string;
  lat: number;
  lng: number;
  routeId: string;
  tripType: TripType;
  isNew: boolean;      // true = unsaved draft
  saved: boolean;
  needsAttention: boolean; // true = pin is a placeholder (no address, or geocode failed) — admin must drag it into place
};

const LAGOS_CENTER = { lat: 6.5244, lng: 3.3792 };
const PIN_COLOR = '#F59E0B';
const NEEDS_ATTENTION_COLOR = '#EF4444';
// Classic teardrop pin: point at origin (0,0), circle head centred at (0,-30)
const PIN_PATH = 'M 0 0 C -2 -20 -10 -22 -10 -30 A 10 10 0 1 1 10 -30 C 10 -22 2 -20 0 0 z';

/* ── Component ──────────────────────────────────────────────── */

export default function StudentMapPage() {
  const mapsLoaded = useGoogleMaps();

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [schoolCenter, setSchoolCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [schoolCenterReady, setSchoolCenterReady] = useState(false);

  const [students, setStudents] = useState<MapStudent[]>([]);
  const [noParentCount, setNoParentCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* ── tab / form state ── */
  const [tab, setTab] = useState<'manual' | 'csv'>('manual');
  const [draftName, setDraftName] = useState('');
  const [draftClass, setDraftClass] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  // When user picks an existing student from suggestions, store their real DB id here
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);

  /* ── UI state ── */
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [geocodingBatch, setGeocodingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);

  /* ── address autocomplete state ── */
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ text: string; suggestion: any }>>([]);
  const [showAddressSugs, setShowAddressSugs] = useState(false);

  /* ── student name search state ── */
  const [studentSugs, setStudentSugs] = useState<Array<{ id: string; name: string; className: string; pickupAddress: string | null }>>([]);
  const [showStudentSugs, setShowStudentSugs] = useState(false);

  /* ── refs ── */
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const placeSelectedCoords = useRef<{ lat: number; lng: number } | null>(null);
  const addressSessionRef = useRef<any>(null);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── load routes + school center on mount ── */
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const [{ data: routeData }, { data: { user } }] = await Promise.all([
        supabase.from('routes').select('id, name').order('name'),
        supabase.auth.getUser(),
      ]);
      setRoutes((routeData ?? []) as RouteOption[]);

      if (user) {
        const { data: profile } = await supabase
          .from('profiles').select('school_id').eq('id', user.id).single();
        if (profile?.school_id) {
          const { data: school } = await supabase
            .from('schools').select('latitude, longitude').eq('id', profile.school_id).single();
          if (school?.latitude != null && school?.longitude != null) {
            setSchoolCenter({ lat: school.latitude, lng: school.longitude });
          }
        }
      }
      setSchoolCenterReady(true);
    }
    init();
  }, []);

  /* ── geocode helper (uses Places Text Search — new API, no billing gate) ── */
  const geocode = useCallback(async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const g = (window as any).google;
      const { places } = await g.maps.places.Place.searchByText({
        textQuery: `${address}, Nigeria`,
        fields: ['location'],
        maxResultCount: 1,
      });
      if (places?.[0]?.location) {
        return { lat: places[0].location.lat(), lng: places[0].location.lng() };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  /* ── init map (waits for school center + maps SDK) ── */
  useEffect(() => {
    if (!mapsLoaded || !schoolCenterReady || !mapRef.current || mapInst.current) return;
    const g = (window as any).google;
    const center = schoolCenter ?? LAGOS_CENTER;
    mapInst.current = new g.maps.Map(mapRef.current, {
      center,
      zoom: schoolCenter ? 14 : 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControlOptions: { position: g.maps.ControlPosition.RIGHT_CENTER },
    });
  }, [mapsLoaded, schoolCenterReady, schoolCenter]);

  /* ── load existing students when route changes ── */
  useEffect(() => {
    if (!selectedRouteId || !mapsLoaded) {
      setStudents([]);
      setNoParentCount(0);
      return;
    }

    let cancelled = false;

    async function loadRoute() {
      setIsLoadingRoute(true);
      setStudents([]);
      setNoParentCount(0);
      setSelectedId(null);

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('students')
          .select('id, name, class_name, pickup_address, pickup_lat, pickup_lng, trip_type, student_parents(count)')
          .eq('route_id', selectedRouteId)
          .eq('is_active', true);

        if (cancelled) return;

        const all = (data ?? []) as Array<{
          id: string; name: string; class_name: string;
          pickup_address: string | null;
          pickup_lat: number | null;
          pickup_lng: number | null;
          trip_type: TripType;
          student_parents: { count: number }[];
        }>;

        // Count students with no parent linked
        const noParent = all.filter(s => {
          const count = Array.isArray(s.student_parents) ? s.student_parents[0]?.count ?? 0 : 0;
          return count === 0;
        }).length;
        setNoParentCount(noParent);

        // Show every active student on this route, not just ones that already have
        // an address — those with neither an address nor stored coords still get a
        // pin (dropped at the school as a placeholder) so there's always something
        // for the admin to drag into place, instead of silently vanishing from the map.
        for (const s of all) {
          if (cancelled) return;
          let lat = s.pickup_lat;
          let lng = s.pickup_lng;
          let needsAttention = false;

          if (lat == null || lng == null) {
            if (s.pickup_address) {
              const coords = await geocode(s.pickup_address);
              if (coords) {
                lat = coords.lat;
                lng = coords.lng;
                // Persist so we don't geocode again next time
                supabase.from('students').update({ pickup_lat: lat, pickup_lng: lng }).eq('id', s.id);
              }
            }
            if (lat == null || lng == null) {
              // No address, or geocoding failed — never silently write a guessed
              // location as truth. Drop a placeholder pin at the school and mark
              // it unsaved so the admin must drag + Save to confirm a real spot.
              if (!schoolCenter) continue;
              lat = schoolCenter.lat;
              lng = schoolCenter.lng;
              needsAttention = true;
            }
          }

          if (cancelled) return;
          const entry: MapStudent = {
            id: s.id,
            name: s.name,
            className: s.class_name,
            address: s.pickup_address ?? '',
            lat,
            lng,
            routeId: selectedRouteId,
            tripType: s.trip_type ?? 'BOTH',
            isNew: false,
            saved: !needsAttention,
            needsAttention,
          };
          setStudents(prev => [...prev, entry]);
        }
      } finally {
        if (!cancelled) setIsLoadingRoute(false);
      }
    }

    loadRoute();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId, mapsLoaded]);

  /* ── address autocomplete (AutocompleteSuggestion — new Places API, no shadow DOM) ── */
  const fetchAddressSuggestions = useCallback(async (input: string) => {
    if (!input.trim() || input.length < 3 || !mapsLoaded) {
      setAddressSuggestions([]);
      return;
    }
    try {
      const g = (window as any).google;
      if (!addressSessionRef.current) {
        addressSessionRef.current = new g.maps.places.AutocompleteSessionToken();
      }
      const { suggestions } = await g.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: addressSessionRef.current,
        includedRegionCodes: ['ng'],
        language: 'en',
      });
      setAddressSuggestions(
        (suggestions as any[]).map((s: any) => ({
          text: s.placePrediction.text.toString(),
          suggestion: s,
        })),
      );
    } catch {
      setAddressSuggestions([]);
    }
  }, [mapsLoaded]);

  function handleDraftAddressChange(val: string) {
    setDraftAddress(val);
    placeSelectedCoords.current = null;
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    if (val.length >= 3) {
      setShowAddressSugs(true);
      addressDebounceRef.current = setTimeout(() => fetchAddressSuggestions(val), 300);
    } else {
      setShowAddressSugs(false);
      setAddressSuggestions([]);
    }
  }

  async function selectAddressSuggestion(item: { text: string; suggestion: any }) {
    setDraftAddress(item.text);
    setShowAddressSugs(false);
    setAddressSuggestions([]);
    addressSessionRef.current = null;
    try {
      const place = item.suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ['location'] });
      if (place.location) {
        placeSelectedCoords.current = { lat: place.location.lat(), lng: place.location.lng() };
      }
    } catch { /* ignore */ }
  }

  /* ── student name search ── */
  const fetchStudentSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) { setStudentSugs([]); return; }
    const supabase = createClient();
    const { data } = await supabase
      .from('students')
      .select('id, name, class_name, pickup_address')
      .ilike('name', `%${query}%`)
      .eq('is_active', true)
      .limit(5);
    setStudentSugs(
      (data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        className: s.class_name,
        pickupAddress: s.pickup_address ?? null,
      })),
    );
  }, []);

  function handleDraftNameChange(val: string) {
    setDraftName(val);
    setSelectedExistingId(null); // manual typing → no longer tied to an existing student
    if (studentDebounceRef.current) clearTimeout(studentDebounceRef.current);
    if (val.length >= 2) {
      setShowStudentSugs(true);
      studentDebounceRef.current = setTimeout(() => fetchStudentSuggestions(val), 250);
    } else {
      setShowStudentSugs(false);
      setStudentSugs([]);
    }
  }

  function selectStudentSuggestion(s: { id: string; name: string; className: string; pickupAddress: string | null }) {
    setDraftName(s.name);
    setDraftClass(s.className);
    setSelectedExistingId(s.id);
    if (s.pickupAddress) {
      setDraftAddress(s.pickupAddress);
      placeSelectedCoords.current = null; // will geocode on add
    }
    setShowStudentSugs(false);
    setStudentSugs([]);
  }

  /* ── sync map markers ── */
  useEffect(() => {
    if (!mapsLoaded || !mapInst.current) return;
    const g = (window as any).google;

    const live = new Set(students.map(s => s.id));
    for (const [id, m] of markersRef.current) {
      if (!live.has(id)) { m.setMap(null); markersRef.current.delete(id); }
    }

    students.forEach(student => {
      const isSelected = student.id === selectedId;
      const isNew = student.isNew;

      const pinIcon = (selected: boolean, newStudent: boolean, needsAttention: boolean) => ({
        path: PIN_PATH,
        fillColor: needsAttention ? NEEDS_ATTENTION_COLOR : newStudent ? '#22c55e' : PIN_COLOR,
        fillOpacity: 1,
        strokeColor: selected ? '#0C1E3D' : '#ffffff',
        strokeWeight: selected ? 2.5 : 1.5,
        scale: 1,
        anchor: new g.maps.Point(0, 0),
        labelOrigin: new g.maps.Point(0, -30),
      });

      if (!markersRef.current.has(student.id)) {
        const marker = new g.maps.Marker({
          position: { lat: student.lat, lng: student.lng },
          map: mapInst.current,
          title: student.name,
          draggable: true,
          icon: pinIcon(isSelected, isNew, student.needsAttention),
          label: {
            text: student.name[0].toUpperCase(),
            color: '#fff',
            fontSize: '11px',
            fontWeight: 'bold',
          },
        });
        marker.addListener('click', () =>
          setSelectedId(prev => prev === student.id ? null : student.id),
        );
        marker.addListener('dragend', (e: any) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          setStudents(prev => prev.map(s =>
            s.id === student.id ? { ...s, lat, lng, saved: false, needsAttention: false } : s,
          ));
        });
        markersRef.current.set(student.id, marker);
      } else {
        const m = markersRef.current.get(student.id);
        m.setPosition({ lat: student.lat, lng: student.lng });
        m.setIcon(pinIcon(isSelected, isNew, student.needsAttention));
      }
    });

    if (students.length > 0) {
      const bounds = new g.maps.LatLngBounds();
      students.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
      mapInst.current.fitBounds(bounds, 60);
      if (students.length === 1) mapInst.current.setZoom(15);
    }
  }, [students, selectedId, mapsLoaded]);

  /* ── add single student ── */
  async function handleAddStudent() {
    if (!draftName.trim() || !draftAddress.trim() || !selectedRouteId) return;
    setAddError(null);
    setIsGeocoding(true);
    try {
      // Use coords from place selection if available, otherwise fall back to geocoder
      const coords = placeSelectedCoords.current ?? await geocode(draftAddress);
      placeSelectedCoords.current = null;
      if (!coords) {
        setAddError('Could not find that address. Select an address from the suggestions.');
        return;
      }
      // Use the real DB id if an existing student was selected, else generate a draft id
      const draftId = selectedExistingId ?? `draft-${Date.now()}`;
      const draft: MapStudent = {
        id: draftId,
        name: draftName.trim(),
        className: draftClass.trim(),
        address: draftAddress.trim(),
        ...coords,
        routeId: selectedRouteId,
        tripType: 'BOTH',
        isNew: true,
        saved: false,
        needsAttention: false,
      };
      setStudents(prev => [...prev, draft]);
      setSelectedId(draft.id);
      setDraftName('');
      setDraftClass('');
      setDraftAddress('');
      setSelectedExistingId(null);
      setAddressSuggestions([]);
      setShowAddressSugs(false);
      setStudentSugs([]);
      setShowStudentSugs(false);
      addressSessionRef.current = null;
    } finally {
      setIsGeocoding(false);
    }
  }

  /* ── CSV upload ── */
  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result ?? '');
      const routeByName = new Map(routes.map(r => [r.name.toLowerCase().trim(), r.id]));
      const parsed: { name: string; className: string; address: string; routeId: string }[] = [];

      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || /^name[,\t]/i.test(line)) continue;
        const parts = line.split(',').map(f => f.trim().replace(/^"|"$/g, ''));
        const [name, className, address, routeName] = parts;
        if (!name || !address) continue;
        const resolvedRouteId = routeByName.get((routeName ?? '').toLowerCase().trim()) ?? selectedRouteId;
        parsed.push({ name, className: className ?? '', address, routeId: resolvedRouteId });
      }

      if (parsed.length === 0) return;
      setGeocodingBatch(true);
      setBatchProgress({ done: 0, total: parsed.length });
      const newStudents: MapStudent[] = [];
      for (let i = 0; i < parsed.length; i++) {
        await new Promise(r => setTimeout(r, 200));
        const coords = await geocode(parsed[i].address);
        if (coords) {
          newStudents.push({
            id: `draft-${Date.now()}-${i}`,
            name: parsed[i].name,
            className: parsed[i].className,
            address: parsed[i].address,
            ...coords,
            routeId: parsed[i].routeId,
            tripType: 'BOTH',
            isNew: true,
            saved: false,
            needsAttention: false,
          });
        }
        setBatchProgress({ done: i + 1, total: parsed.length });
      }
      setStudents(prev => [...prev, ...newStudents]);
      setGeocodingBatch(false);
    };
    reader.readAsText(file);
  }

  /* ── trip type toggle ── */
  function setTripType(id: string, tripType: TripType) {
    setStudents(prev =>
      prev.map(s => s.id === id ? { ...s, tripType, saved: false } : s),
    );
  }

  /* ── remove student ── */
  function removeStudent(id: string) {
    const m = markersRef.current.get(id);
    if (m) { m.setMap(null); markersRef.current.delete(id); }
    setStudents(prev => prev.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  /* ── save all dirty students (new drafts, and any existing pin that's been dragged) ── */
  async function handleSave() {
    const unsaved = students.filter(s => !s.saved);
    if (unsaved.length === 0) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaveError('Not authenticated'); return; }
      const { data: profile } = await supabase
        .from('profiles').select('school_id').eq('id', user.id).single();
      if (!profile?.school_id) { setSaveError('Could not find school'); return; }

      // Students with a real UUID id → update existing record
      // Students with a draft- id → insert as new record
      const toUpdate = unsaved.filter(s => !s.id.startsWith('draft-'));
      const toInsert = unsaved.filter(s => s.id.startsWith('draft-'));

      for (const s of toUpdate) {
        const { error } = await supabase
          .from('students')
          .update({
            // Never overwrite a real saved address with an empty placeholder string
            pickup_address: s.address || null,
            pickup_lat: s.lat,
            pickup_lng: s.lng,
            route_id: s.routeId || null,
            class_name: s.className || 'TBD',
            trip_type: s.tripType,
          })
          .eq('id', s.id);
        if (error) { setSaveError(error.message); return; }
      }

      if (toInsert.length > 0) {
        const rows = toInsert.map(s => ({
          school_id: profile.school_id,
          name: s.name,
          class_name: s.className || 'TBD',
          pickup_address: s.address,
          pickup_lat: s.lat,
          pickup_lng: s.lng,
          route_id: s.routeId || null,
          trip_type: s.tripType,
        }));
        const { error } = await supabase.from('students').insert(rows);
        if (error) { setSaveError(error.message); return; }
      }

      setStudents(prev => prev.map(s =>
        !s.saved ? { ...s, saved: true, needsAttention: false } : s,
      ));
    } finally {
      setIsSaving(false);
    }
  }

  const unsavedCount = students.filter(s => !s.saved).length;
  const selectedRouteName = routes.find(r => r.id === selectedRouteId)?.name ?? null;
  const routeSelected = !!selectedRouteId;
  const existingCount = students.filter(s => !s.isNew).length;
  const newCount = students.filter(s => s.isNew).length;
  const needsAttentionCount = students.filter(s => s.needsAttention).length;

  return (
    <div className="fixed inset-0 top-14 lg:top-0 lg:left-[220px] flex flex-col bg-canvas">

      {/* ── Header bar ── */}
      <div className="shrink-0 bg-surface border-b border-rule z-10" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

        {/* Top row */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3">
          <Link
            href="/dashboard/students"
            className="flex items-center gap-1 text-[12px] text-sub hover:text-ink transition-colors shrink-0"
          >
            <ArrowLeft size={13} /> Students
          </Link>
          <div className="hidden sm:block w-px h-4 bg-rule shrink-0" />
          <h1 className="hidden sm:block font-heading font-bold text-[16px] tracking-tight text-ink shrink-0">Student Map</h1>

          <div className="hidden sm:block w-px h-4 bg-rule shrink-0" />

          {/* Route picker */}
          <select
            value={selectedRouteId}
            onChange={e => setSelectedRouteId(e.target.value)}
            className="rounded-[var(--radius-btn)] border border-rule px-3 py-1.5 text-[13px] font-medium text-ink bg-canvas focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber min-w-[140px] sm:min-w-[180px] flex-1 sm:flex-initial"
          >
            <option value="">Select a route…</option>
            {routes.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          {/* Tabs */}
          {routeSelected && (
            <div className="flex items-center gap-0 sm:ml-2 shrink-0">
              {(['manual', 'csv'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[12px] font-semibold rounded-[var(--radius-btn)] transition-colors duration-100 ${
                    tab === t ? 'bg-amber/15 text-amber-dark' : 'text-sub hover:text-ink hover:bg-canvas'
                  }`}
                >
                  {t === 'manual' ? 'Add Student' : 'Upload CSV'}
                </button>
              ))}
            </div>
          )}

          <div className="hidden sm:block flex-1" />

          {/* Loading indicator */}
          {isLoadingRoute && (
            <span className="text-[12px] text-sub italic shrink-0">Loading students…</span>
          )}

          {/* Count + no-parent notice */}
          {!isLoadingRoute && routeSelected && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0">
              {noParentCount > 0 && (
                <span className="flex items-center gap-1 text-[12px] text-sub">
                  <UserX size={13} strokeWidth={2} className="text-sub" />
                  {noParentCount} without parent
                </span>
              )}
              {students.length > 0 && (
                <span className="text-[12px] text-sub">
                  {existingCount > 0 && `${existingCount} on route`}
                  {existingCount > 0 && newCount > 0 && ' · '}
                  {newCount > 0 && <span className="text-green">{newCount} new</span>}
                  {unsavedCount > 0 && <span className="text-amber ml-1">· {unsavedCount} unsaved</span>}
                </span>
              )}
            </div>
          )}

          {unsavedCount > 0 && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-amber px-4 py-2 text-[12px] font-semibold text-navy hover:brightness-110 disabled:opacity-60 active:scale-95 transition-all duration-150 shrink-0 w-full sm:w-auto justify-center"
            >
              <Save size={13} />
              {isSaving ? 'Saving…' : `Save ${unsavedCount}`}
            </button>
          )}
        </div>

        {/* Input strip */}
        {routeSelected && (
          tab === 'manual' ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2 px-3 sm:px-4 pb-3">
              {/* Name input with existing-student suggestions */}
              <div className="relative w-full sm:w-[180px] shrink-0">
                <input
                  type="text"
                  value={draftName}
                  onChange={e => handleDraftNameChange(e.target.value)}
                  onFocus={() => draftName.length >= 2 && setShowStudentSugs(true)}
                  onBlur={() => setTimeout(() => setShowStudentSugs(false), 150)}
                  placeholder="Student name"
                  autoComplete="off"
                  className="w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
                />
                {showStudentSugs && studentSugs.length > 0 && (
                  <ul className="absolute left-0 top-full mt-1 w-[240px] bg-surface border border-rule rounded-[var(--radius-btn)] shadow-[var(--shadow-float)] z-50 overflow-hidden">
                    {studentSugs.map(s => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onMouseDown={() => selectStudentSuggestion(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-canvas transition-colors duration-100"
                        >
                          <span className="font-medium text-ink">{s.name}</span>
                          {s.className && <span className="ml-1.5 text-[12px] text-sub">{s.className}</span>}
                          {s.pickupAddress && <p className="text-[11px] text-sub truncate mt-0.5">{s.pickupAddress}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <input
                type="text"
                value={draftClass}
                onChange={e => setDraftClass(e.target.value)}
                placeholder="Class"
                className="w-full sm:w-[100px] shrink-0 rounded-[var(--radius-btn)] border border-rule px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
              />

              {/* Address input with Google Places suggestions */}
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={draftAddress}
                  onChange={e => handleDraftAddressChange(e.target.value)}
                  onFocus={() => draftAddress.length >= 3 && setShowAddressSugs(true)}
                  onBlur={() => setTimeout(() => setShowAddressSugs(false), 150)}
                  placeholder="Pickup address"
                  autoComplete="off"
                  className="w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
                />
                {showAddressSugs && addressSuggestions.length > 0 && (
                  <ul className="absolute left-0 top-full mt-1 w-full min-w-[280px] bg-surface border border-rule rounded-[var(--radius-btn)] shadow-[var(--shadow-float)] z-50 overflow-hidden">
                    {addressSuggestions.map((item, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onMouseDown={() => selectAddressSuggestion(item)}
                          className="w-full text-left px-3 py-2.5 text-sm text-ink hover:bg-canvas transition-colors duration-100 truncate"
                        >
                          {item.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                onClick={handleAddStudent}
                disabled={isGeocoding || !mapsLoaded || !draftName.trim() || (!draftAddress.trim() && !placeSelectedCoords.current)}
                className="shrink-0 w-full sm:w-auto rounded-[var(--radius-btn)] bg-amber px-4 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
              >
                {isGeocoding ? 'Locating…' : '+ Add to Map'}
              </button>
              {addError && <p className="self-center text-[11px] text-red shrink-0">{addError}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 px-3 sm:px-4 pb-3">
              <p className="text-[11px] text-sub">
                CSV columns: <code className="bg-navy-light px-1 rounded text-navy font-mono">name, class, address, route</code>
                {' '}— route name must match an existing route (falls back to selected)
              </p>
              {geocodingBatch && (
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <div className="h-1.5 flex-1 bg-canvas rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber rounded-full transition-all duration-300"
                      style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-sub shrink-0">{batchProgress.done}/{batchProgress.total}</span>
                </div>
              )}
              <label className={`flex items-center gap-2 rounded-[var(--radius-btn)] border border-rule px-4 py-2 text-[12px] font-medium text-ink cursor-pointer hover:bg-canvas transition-colors ${geocodingBatch ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={13} />
                Choose CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }}
                />
              </label>
              {saveError && <p className="text-[11px] text-red">{saveError}</p>}
            </div>
          )
        )}
      </div>

      {/* ── Map area ── */}
      <div className="flex-1 relative bg-[#e8e0d8]">
        {(!mapsLoaded || !schoolCenterReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas z-10">
            <p className="text-sm text-sub animate-pulse">Loading map…</p>
          </div>
        )}
        <div ref={mapRef} className="absolute inset-0" />

        {/* Route context chip */}
        {selectedRouteName && (
          <div className="absolute top-3 right-3 max-w-[45vw] sm:max-w-none bg-surface/95 backdrop-blur-sm rounded-[var(--radius-chip)] shadow-[var(--shadow-float)] px-3 py-1.5 flex items-center gap-2 text-[12px] font-medium text-ink z-10">
            <span className="w-2.5 h-2.5 rounded-full bg-amber shrink-0" />
            <span className="truncate">{selectedRouteName}</span>
          </div>
        )}

        {/* Floating student list */}
        {students.length > 0 && (
          <div className="absolute left-3 top-3 w-[min(230px,50vw)] bg-surface/95 backdrop-blur-sm rounded-[var(--radius-card)] shadow-[var(--shadow-float)] overflow-hidden z-10">
            <button
              type="button"
              onClick={() => setListOpen(p => !p)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-[12px] font-semibold text-ink hover:bg-canvas/60 transition-colors"
            >
              <span>{students.length} student{students.length !== 1 ? 's' : ''}</span>
              {listOpen ? <ChevronUp size={13} className="text-sub" /> : <ChevronDown size={13} className="text-sub" />}
            </button>

            {listOpen && (
              <ul className="border-t border-rule max-h-[55vh] overflow-y-auto divide-y divide-rule">
                {students.map(student => {
                  const isSelected = student.id === selectedId;
                  return (
                    <li key={student.id}>
                      <div
                        className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-amber/[0.07]' : 'hover:bg-canvas/60'}`}
                        onClick={() => setSelectedId(isSelected ? null : student.id)}
                      >
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-navy"
                          style={{ backgroundColor: student.needsAttention ? NEEDS_ATTENTION_COLOR : student.isNew ? '#22c55e' : PIN_COLOR }}
                        >
                          {student.name[0].toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-ink truncate">{student.name}</p>
                          <p className={`text-[10px] truncate ${student.needsAttention ? 'italic' : 'text-sub'}`} style={student.needsAttention ? { color: NEEDS_ATTENTION_COLOR } : undefined}>
                            {student.needsAttention ? 'Drag pin to set pickup spot' : student.address}
                          </p>
                        </div>
                        {student.isNew && (
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={e => { e.stopPropagation(); removeStudent(student.id); }}
                            className="text-sub hover:text-red transition-colors shrink-0"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      {isSelected && (
                        <div className="px-3 pb-2.5 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                          <p className="text-[10px] text-sub">Rides this route:</p>
                          <div className="flex gap-1.5">
                            {(['BOTH', 'MORNING', 'AFTERNOON'] as const).map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setTripType(student.id, t)}
                                className={`flex-1 rounded-[var(--radius-btn)] py-1.5 text-[11px] font-semibold border transition-all duration-100 ${
                                  student.tripType === t
                                    ? 'bg-amber text-navy border-amber'
                                    : 'border-rule text-sub hover:text-ink hover:border-amber'
                                }`}
                              >
                                {t === 'BOTH' ? 'Both runs' : t === 'MORNING' ? 'Morning only' : 'Afternoon only'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Map legend */}
        {(existingCount > 0 || newCount > 0) && (
          <div className="absolute bottom-6 left-3 bg-surface/90 backdrop-blur-sm rounded-[var(--radius-card)] shadow-[var(--shadow-float)] px-3 py-2 flex flex-col gap-1.5 text-[11px] z-10">
            {existingCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0 bg-amber" />
                <span className="text-sub">Existing on route ({existingCount})</span>
              </div>
            )}
            {newCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0 bg-green" />
                <span className="text-sub">New students ({newCount})</span>
              </div>
            )}
            {needsAttentionCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: NEEDS_ATTENTION_COLOR }} />
                <span className="text-sub">Needs a pickup spot — drag to place ({needsAttentionCount})</span>
              </div>
            )}
            <p className="text-[10px] text-sub/70 pt-0.5 border-t border-rule">Drag any pin to correct its location</p>
          </div>
        )}

        {/* Empty hint */}
        {mapsLoaded && schoolCenterReady && students.length === 0 && !isLoadingRoute && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90vw] max-w-sm sm:w-auto sm:max-w-none bg-surface/90 backdrop-blur-sm rounded-[var(--radius-card)] shadow-[var(--shadow-float)] px-4 py-2.5 text-[12px] text-sub text-center sm:whitespace-nowrap z-10">
            {routeSelected
              ? noParentCount > 0
                ? `${noParentCount} student${noParentCount !== 1 ? 's' : ''} on this route have no parent linked`
                : 'No students on this route yet — add them above'
              : 'Select a route above to start mapping students'}
          </div>
        )}
      </div>
    </div>
  );
}

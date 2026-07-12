// Loads every child linked to the signed-in parent once, and tracks which
// one is currently "active" (persisted across launches). HomeScreen and
// HistoryScreen read from this instead of each independently querying
// student_parents and silently only ever looking at the first row.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '../../lib/supabase';

const SELECTED_STUDENT_KEY = '@busbuzz/selected-student-id';

export type LinkedStudent = {
  id: string;
  name: string;
  className: string;
  photoUrl: string | null;
  routeId: string | null;
  stopId: string | null;
  schoolName: string | null;
  schoolLat: number | null;
  schoolLng: number | null;
  routeName: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
};

type StudentContextValue = {
  students: LinkedStudent[];
  selectedStudent: LinkedStudent | null;
  selectStudent: (id: string) => void;
  isLoading: boolean;
  errorMessage: string | null;
  reload: () => Promise<void>;
};

const StudentContext = createContext<StudentContextValue | null>(null);

type StudentRow = {
  id: string;
  name: string;
  class_name: string;
  photo_url: string | null;
  route_id: string | null;
  stop_id: string | null;
  is_active: boolean;
  pickup_lat: number | null;
  pickup_lng: number | null;
  schools: { name: string; latitude: number | null; longitude: number | null } | null;
  routes: { name: string } | null;
};

export function StudentProvider({ children }: { children: ReactNode }) {
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMessage('Session expired. Please log in again.');
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('student_parents')
        .select(
          'students(id, name, class_name, photo_url, route_id, stop_id, is_active, pickup_lat, pickup_lng, schools(name, latitude, longitude), routes(name))',
        )
        .eq('parent_id', user.id);

      if (error) {
        setErrorMessage('Could not load your children. Try again.');
        setIsLoading(false);
        return;
      }

      const records: LinkedStudent[] = ((data ?? []) as unknown as Array<{ students: StudentRow | null }>)
        .map((row) => row.students)
        .filter((s): s is StudentRow => !!s && s.is_active)
        .map((s) => ({
          id: s.id,
          name: s.name,
          className: s.class_name,
          photoUrl: s.photo_url,
          routeId: s.route_id,
          stopId: s.stop_id,
          schoolName: s.schools?.name ?? null,
          schoolLat: s.schools?.latitude ?? null,
          schoolLng: s.schools?.longitude ?? null,
          routeName: s.routes?.name ?? null,
          pickupLat: s.pickup_lat,
          pickupLng: s.pickup_lng,
        }));

      setStudents(records);

      const storedId = await AsyncStorage.getItem(SELECTED_STUDENT_KEY);
      const validStoredId = records.find((r) => r.id === storedId)?.id;
      setSelectedStudentId(validStoredId ?? records[0]?.id ?? null);

      if (records.length === 0) {
        setErrorMessage('No active children linked to your account.');
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectStudent = useCallback((id: string) => {
    setSelectedStudentId(id);
    AsyncStorage.setItem(SELECTED_STUDENT_KEY, id).catch(() => {});
  }, []);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  const value = useMemo<StudentContextValue>(
    () => ({ students, selectedStudent, selectStudent, isLoading, errorMessage, reload: load }),
    [students, selectedStudent, selectStudent, isLoading, errorMessage, load],
  );

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
}

export function useStudents(): StudentContextValue {
  const ctx = useContext(StudentContext);
  if (!ctx) {
    throw new Error('useStudents must be used within a StudentProvider');
  }
  return ctx;
}

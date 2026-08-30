import screen from "../components/screen.module.css";
import styles from "./child.module.css";
import ScreenHeader from "../components/ScreenHeader";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import SignOutButton from "../components/SignOutButton";
import AccountSettings from "../components/AccountSettings";
import { createClient } from "@/lib/supabase/server";
import {
  getFirstName,
  getInitials,
  getLinkedStudents,
  getTrackBundle,
} from "@/lib/data";

export const metadata = { title: "BusBuzz — Child" };

export default async function ChildPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const { child } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, students] = await Promise.all([
    supabase.from("profiles").select("name, phone").eq("id", user.id).single(),
    getLinkedStudents(supabase, user.id),
  ]);
  const student = students.find((s) => s.id === child) ?? students[0];

  if (!student) {
    return (
      <main className="app">
        <ScreenHeader title="Child profile" />
        <EmptyState
          title="No children linked yet"
          text="Ask your school admin to link your children to this account."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          }
        />
        <SignOutButton />
        <BottomNav active="child" />
      </main>
    );
  }

  const [bundle, { data: studentRow }] = await Promise.all([
    getTrackBundle(supabase, student.id),
    supabase.from("students").select("medical_notes").eq("id", student.id).single(),
  ]);

  const routeLabel = [
    bundle?.routeName ?? student.routeName,
    bundle?.routeType === "MORNING"
      ? "Morning"
      : bundle?.routeType === "AFTERNOON"
        ? "Afternoon"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // RLS lets a parent see their own profile and their bus's driver — not
  // co-guardians — so the contacts card lists exactly those two.
  const contacts = [
    bundle?.driver?.name
      ? {
          name: bundle.driver.name,
          role: "Bus driver",
          phone: bundle.driver.phone,
          photoUrl: bundle.driver.photoUrl,
        }
      : null,
    profile?.name
      ? {
          name: profile.name,
          role: "You · Guardian",
          phone: profile.phone ?? null,
          photoUrl: null,
        }
      : null,
  ].filter(
    (c): c is { name: string; role: string; phone: string | null; photoUrl: string | null } =>
      !!c,
  );

  return (
    <main className="app">
      <ScreenHeader title="Child profile" />

      <div className={styles.hero}>
        <div className={styles.avatar}>
          {student.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={student.photoUrl} alt={student.name} />
          ) : (
            getInitials(student.name)[0]
          )}
        </div>
        <div>
          <div className={styles.name}>{student.name}</div>
          <div className={styles.klass}>{student.className}</div>
        </div>
      </div>

      <div className={screen.sectionLabel}>Route &amp; bus</div>
      <div className={screen.card}>
        <InfoRow label="School" value={student.schoolName ?? "—"} icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5" /></svg>
        } />
        <InfoRow label="Route" value={routeLabel || "Not assigned yet"} icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19c4 0 4-14 8-14s4 14 8 14" /><circle cx="4" cy="19" r="2" fill="currentColor" stroke="none" /><circle cx="20" cy="19" r="2" fill="currentColor" stroke="none" /></svg>
        } />
        <InfoRow label="Pickup stop" value={bundle?.assignedStop?.name ?? "Not assigned yet"} icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
        } />
        <InfoRow label="Bus plate" value={bundle?.plateNumber ?? "No bus assigned"} icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="2" /><path d="M8 17v2M16 17v2M3 11h18" /></svg>
        } />
      </div>

      {studentRow?.medical_notes && (
        <>
          <div className={screen.sectionLabel}>Medical notes</div>
          <div className={styles.medical}>
            <div className={styles.rowLabel}>Note for the driver &amp; school</div>
            <p>{studentRow.medical_notes}</p>
          </div>
        </>
      )}

      <div className={screen.sectionLabel}>Contacts</div>
      <div className={screen.card}>
        {contacts.map((g) => (
          <div key={g.role} className={styles.guardian}>
            <div className={styles.gav}>
              {g.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.photoUrl} alt={g.name} />
              ) : (
                getInitials(g.name)[0]
              )}
            </div>
            <div className={styles.gbody}>
              <div className={styles.gname}>{g.name}</div>
              <div className={styles.gmeta}>
                {g.role}
                {g.phone ? ` · ${g.phone}` : ""}
              </div>
            </div>
            {g.phone && (
              <a
                className={styles.call}
                href={`tel:${g.phone.replace(/\s/g, "")}`}
                aria-label={`Call ${g.name}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.1-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.4-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z" /></svg>
              </a>
            )}
          </div>
        ))}
      </div>

      <AccountSettings initialPhone={profile?.phone ?? null} />

      <SignOutButton />

      <BottomNav active="child" childName={getFirstName(student.name)} childId={student.id} />
    </main>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowIcon}>{icon}</div>
      <div className={styles.rowBody}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowValue}>{value}</div>
      </div>
    </div>
  );
}

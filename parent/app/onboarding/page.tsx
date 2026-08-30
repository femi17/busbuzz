import { redirect } from "next/navigation";
import screen from "../components/screen.module.css";
import styles from "./onboarding.module.css";
import ConfirmChildren from "./ConfirmChildren";
import { createClient } from "@/lib/supabase/server";
import { getInitials, getLinkedStudents } from "@/lib/data";

export const metadata = { title: "BusBuzz — Welcome" };

/**
 * First sign-in: the parent confirms the children their school linked to
 * this account, which flips profiles.onboarding_completed (the same flag
 * the admin dashboard and native app use). The Track page redirects here
 * until that's done.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, students] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, onboarding_completed")
      .eq("id", user.id)
      .single(),
    getLinkedStudents(supabase, user.id),
  ]);

  if (profile?.onboarding_completed) redirect("/");

  const firstName = profile?.name?.split(/\s+/)[0] ?? "there";

  return (
    <main className="app">
      <div className={styles.head}>
        <div className={styles.kicker}>WELCOME TO BUSBUZZ</div>
        <h1>
          Hi {firstName} — let&apos;s make sure
          <br />
          we have the right <em>kids</em>.
        </h1>
        <p className={styles.lead}>
          Your school linked {students.length === 1 ? "this child" : "these children"} to
          your account. You&apos;ll track their bus, get boarding and arrival alerts, and
          see every trip.
        </p>
      </div>

      <div className={screen.card}>
        {students.length === 0 && (
          <p className={styles.none}>
            No children are linked to your account yet — ask your school admin to add
            them, then reopen the app.
          </p>
        )}
        {students.map((s) => (
          <div key={s.id} className={styles.child}>
            <div className={styles.avatar}>
              {s.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.photoUrl} alt={s.name} />
              ) : (
                getInitials(s.name)[0]
              )}
            </div>
            <div className={styles.meta}>
              <div className={styles.name}>{s.name}</div>
              <div className={styles.sub}>
                {[s.className, s.schoolName].filter(Boolean).join(" · ")}
              </div>
              {s.routeName && <div className={styles.route}>{s.routeName}</div>}
            </div>
          </div>
        ))}
      </div>

      <ConfirmChildren disabled={students.length === 0} />

      <p className={styles.fine}>
        Something wrong or missing? Your school admin manages this list — confirm what&apos;s
        correct now and ask them to fix the rest.
      </p>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./screen.module.css";
import { createClient } from "@/lib/supabase/client";

/**
 * Account section on the child profile screen: the parent's phone number
 * (what the driver sees and calls — editable in place) and account
 * deletion (two-step confirm; removing the auth user cascades to the
 * profile and links, students stay with the school).
 */
export default function AccountSettings({ initialPhone }: { initialPhone: string | null }) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function savePhone() {
    setSaving(true);
    setPhoneMsg(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error();
      const { error } = await supabase
        .from("profiles")
        .update({ phone: phone.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      setEditing(false);
      setPhoneMsg("Saved");
      router.refresh();
      setTimeout(() => setPhoneMsg(null), 2000);
    } catch {
      setPhoneMsg("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error();

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (!resp.ok) throw new Error();

      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setDeleteError("Couldn't delete the account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <>
      <div className={styles.sectionLabel}>Account</div>
      <div className={styles.card}>
        <div className={styles.settingRow}>
          <div className={styles.settingBody}>
            <div className={styles.settingLabel}>Your phone number</div>
            {editing ? (
              <input
                className={styles.settingInput}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0803 000 0000"
                autoFocus
              />
            ) : (
              <div className={styles.settingValue}>
                {phone || "Not set — the driver can't call you"}
                {phoneMsg ? <span className={styles.settingMsg}> · {phoneMsg}</span> : null}
              </div>
            )}
          </div>
          {editing ? (
            <button type="button" className={styles.settingBtn} onClick={savePhone} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          ) : (
            <button type="button" className={styles.settingBtnGhost} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      </div>

      {confirmingDelete ? (
        <div className={styles.dangerCard}>
          <div className={styles.dangerText}>
            <b>Delete your account for good?</b> You&apos;ll lose access to tracking and
            alerts for your children. Their school records stay with the school. This
            can&apos;t be undone.
            {deleteError ? ` ${deleteError}` : ""}
          </div>
          <div className={styles.dangerActions}>
            <button
              type="button"
              className={styles.settingBtnGhost}
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Keep my account
            </button>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={deleteAccount}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.deleteLink}
          onClick={() => setConfirmingDelete(true)}
        >
          Delete my account
        </button>
      )}
    </>
  );
}

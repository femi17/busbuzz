'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Search, X, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const inputClass = 'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-canvas disabled:opacity-60 disabled:cursor-not-allowed';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

const inviteEmailSchema = z.string().email('Enter a valid email address');

type ParentMatch = { id: string; name: string; email: string; studentCount: number };
type InvitedEntry = { email: string; isNewUser: boolean };

function sanitizeForFilter(term: string) {
  return term.replace(/[,()%*]/g, '').trim();
}

export function ParentInviteForm({ studentId, onInvited }: { studentId: string; onInvited?: () => void }) {
  const [parentEmail, setParentEmail] = useState('');
  const [parentName, setParentName] = useState('');
  const [selectedParent, setSelectedParent] = useState<ParentMatch | null>(null);
  const [suggestions, setSuggestions] = useState<ParentMatch[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [invitedParents, setInvitedParents] = useState<InvitedEntry[]>([]);
  const searchToken = useRef(0);

  useEffect(() => {
    if (selectedParent && selectedParent.email === parentEmail) { setSuggestions([]); return; }
    const term = sanitizeForFilter(parentEmail);
    if (term.length < 2) { setSuggestions([]); return; }

    const token = ++searchToken.current;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email, student_parents(count)')
        .eq('role', 'PARENT')
        .or(`name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(6);

      if (token !== searchToken.current) return;
      const matches = (data ?? []).map((row) => {
        const r = row as unknown as { id: string; name: string; email: string; student_parents: { count: number }[] };
        return { id: r.id, name: r.name, email: r.email, studentCount: r.student_parents?.[0]?.count ?? 0 };
      });
      setSuggestions(matches);
    }, 250);

    return () => clearTimeout(timer);
  }, [parentEmail, selectedParent]);

  function selectMatch(match: ParentMatch) {
    setSelectedParent(match);
    setParentEmail(match.email);
    setParentName(match.name);
    setSuggestions([]);
  }

  function clearSelection() {
    setSelectedParent(null);
    setParentEmail('');
    setParentName('');
  }

  async function handleInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError(null);
    const emailParse = inviteEmailSchema.safeParse(parentEmail);
    if (!emailParse.success) { setInviteError(emailParse.error.issues[0]?.message ?? 'Invalid email'); return; }
    setIsInviting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({ action: 'invite-parent', studentId, parentEmail: emailParse.data, parentName: parentName || undefined }),
      });
      if (!response.ok) { const errorBody = await response.json().catch(() => null); setInviteError(errorBody?.error ?? 'Failed to add parent'); return; }
      const successBody = await response.json();
      setInvitedParents((prev) => [...prev, { email: emailParse.data, isNewUser: successBody.data.isNewUser }]);
      clearSelection();
      onInvited?.();
    } finally {
      setIsInviting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleInvite} className="flex flex-col gap-3">
        {inviteError && <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">{inviteError}</div>}

        <div className="relative">
          <label className={labelClass}>Parent Email</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => { setParentEmail(e.target.value); if (selectedParent && e.target.value !== selectedParent.email) setSelectedParent(null); }}
              placeholder="Search by name or email…"
              disabled={!!selectedParent}
              className={`${inputClass} pl-9 ${selectedParent ? 'pr-9' : ''}`}
              autoComplete="off"
            />
            {selectedParent && (
              <button type="button" onClick={clearSelection} aria-label="Clear selected parent" className="absolute right-3 top-1/2 -translate-y-1/2 text-sub hover:text-ink">
                <X size={15} />
              </button>
            )}
          </div>

          {suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-[var(--radius-btn)] border border-rule bg-surface shadow-[var(--shadow-float)] overflow-hidden">
              {suggestions.map((match) => (
                <button
                  type="button"
                  key={match.id}
                  onClick={() => selectMatch(match)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-canvas transition-colors duration-100"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-light text-navy">
                    <UserRound size={14} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{match.name}</span>
                    <span className="block truncate text-[12px] text-sub">{match.email} · already linked to {match.studentCount} {match.studentCount === 1 ? 'student' : 'students'}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedParent ? (
          <p className="text-[12px] text-sub">
            Linking an existing parent — no new invitation email will be sent.
          </p>
        ) : (
          <div>
            <label className={labelClass}>Parent Name (optional)</label>
            <input type="text" value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="e.g., Mrs. Okafor" className={inputClass} />
          </div>
        )}

        <button type="submit" disabled={isInviting || !parentEmail} className="self-start rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150">
          {isInviting ? 'Adding…' : selectedParent ? 'Link Parent' : 'Add Parent'}
        </button>
      </form>

      {invitedParents.length > 0 && (
        <div className="flex flex-col gap-2">
          {invitedParents.map((parent) => (
            <div key={parent.email} className="flex items-center gap-2 rounded-[var(--radius-btn)] border border-rule px-3 py-2 text-sm text-ink">
              <span className="text-green">&#10003;</span>
              {parent.email}
              <span className="text-[12px] text-sub">— {parent.isNewUser ? 'invitation sent' : 'linked, already has access'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

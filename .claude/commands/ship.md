# /ship — BusBuzz Feature Pipeline

Run the full 4-agent pipeline for: $ARGUMENTS

---

## Important: No Docker Environment

This project runs WITHOUT Docker. There is no local Supabase instance.
All database work targets the Supabase cloud dev project (busbuzz-dev).

Rules for every stage:
- Never run `supabase start` — it requires Docker and will fail
- Never run `supabase status`
- SQL migrations are written to files AND printed clearly for manual execution
- Edge Functions are deployed with `supabase functions deploy` (no Docker needed)
- Tests run against the cloud dev project using the DEV env vars

---

## Pre-flight

Clean up stale pipeline files from the previous run:
```bash
rm -f .pipeline/spec.md
rm -f .pipeline/changes.md
rm -f .pipeline/test-results.md
rm -f .pipeline/review.md
rm -f .pipeline/sql-to-run.md
rm -f .pipeline/manual-tests.md
```

Create `.pipeline/` if it does not exist:
```bash
mkdir -p .pipeline
```

Check Supabase CLI is linked to the dev project:
```bash
supabase projects list
```

If this fails, tell me:
"Supabase CLI is not linked. Run: `supabase link --project-ref [your-dev-project-ref]` then re-run /ship."
Then stop.

---

## Stage 1 — Planner

Delegate to the **planner** subagent with this feature request:

> $ARGUMENTS

Wait for `.pipeline/spec.md` to exist before proceeding.

After the Planner finishes, read `.pipeline/spec.md`.

**If OPEN QUESTIONS exist at the top:**
Stop the pipeline and show me the questions exactly as written. Say:
"The Planner found open questions before writing the spec. Answer these and re-run /ship:"
Then list the questions. Do not proceed to Stage 2.

---

## Stage 2 — Coder

Delegate to the **coder** subagent.

The Coder will read `.pipeline/spec.md` and implement the feature.

Wait for `.pipeline/changes.md` to exist before proceeding.

If `.pipeline/changes.md` starts with "BLOCKED:", stop and show me the message.

After the Coder finishes, check if `.pipeline/sql-to-run.md` exists.

**If sql-to-run.md exists:**
Show me its full contents and say:
"⚠️ SQL TO RUN MANUALLY: Open your Supabase dev project → SQL Editor → paste and run each block below in order. Confirm you have done this before continuing to the Tester."
Wait for my confirmation before proceeding to Stage 3.

---

## Stage 3 — Tester

Delegate to the **tester** subagent.

The Tester will read `.pipeline/changes.md` and `.pipeline/spec.md`, then produce:
- Automated tests where they can run without Docker (shared utils, schemas, mobile component tests)
- A `.pipeline/manual-tests.md` file for anything requiring a live database

Wait for `.pipeline/test-results.md` to exist before proceeding.

After the Tester finishes:

1. Show me `.pipeline/manual-tests.md` if it exists and say:
"🧪 MANUAL TESTS: Run these against your Supabase dev project and confirm results before I proceed to review."
Wait for my confirmation that manual tests passed.

2. Read `.pipeline/test-results.md`.
If any automated tests failed, stop and show me the failures.

---

## Stage 4 — Reviewer

Delegate to the **reviewer** subagent.

The Reviewer will read all pipeline files and the git diff, then write `.pipeline/review.md`.

Wait for `.pipeline/review.md` to exist before proceeding.

---

## Final Report

Show me the full contents of `.pipeline/review.md`.

Then say:

---
**Pipeline complete.**
- Branch: [current git branch]
- Verdict: [SHIP / NEEDS WORK / BLOCK]

[If SHIP]:
"Feature is ready for your review. When you are satisfied:
1. Run `supabase db push` to apply any new migrations to your PROD project
2. Run `supabase functions deploy [function-name]` for any new Edge Functions
3. Merge the branch."

[If NEEDS WORK]:
"The Reviewer found issues. Read the notes above, make the changes, then re-run `/ship $ARGUMENTS`."

[If BLOCK]:
"The Reviewer has blocked this feature. A serious issue was found — do not deploy. Fix the BLOCK reason above before re-running."

---

Do not run `supabase db push` or `supabase functions deploy` automatically.
Do not merge anything. Leave all deployment decisions to me.

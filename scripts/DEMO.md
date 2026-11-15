# BusBuzz sales-demo fleet (Ejigbo)

Three scripts spin up a believable 5-bus fleet for a school pitch and make the
buses move through the **real** BusBuzz pipeline — so the admin Live Map and
parent push notifications behave exactly as they would in production. No app
code is touched; the scripts only write data with the service-role key.

Fictional school: **Crestwood Montessori & Nursery School**, Ejigbo LCDA.
All data is defined in `demo-config.mjs` (names, coordinates, stable UUIDs).

Run from the repo root. The scripts read `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` straight from
`.env.local` (first non-empty value wins) — no `--env-file` needed.

## Commands

```bash
# 1. Create the demo data (idempotent — safe to re-run)
node scripts/demo-seed.mjs

# 2. Move the fleet (Ctrl+C ends trips cleanly)
node scripts/demo-simulate.mjs            # one full run of all 5 buses
node scripts/demo-simulate.mjs --loop     # keep looping (always-moving demo)
node scripts/demo-simulate.mjs --bus=1    # a single bus
node scripts/demo-simulate.mjs --speed=3  # faster (bigger steps) — good for rehearsals

# 3. Remove everything when done (keeps any real parent accounts)
node scripts/demo-teardown.mjs
```

## Demo runbook

1. `node scripts/demo-seed.mjs` — prints the admin login + the designated child.
2. Log into the web dashboard as **demo-admin@busbuzz.ng** / **DemoBusBuzz2026!**
   → show Buses, Routes, Students, and **Live Map**.
3. Open student **Tomiwa Adeyemi** (Ikotun Corridor) → **Add Parent** → enter the
   owner's email. (This is the existing admin→parent link flow.)
4. Owner opens **app.busbuzz.com.ng**, signs in with that email + the 6-digit OTP
   code, installs the PWA, and taps **Enable notifications**.
5. `node scripts/demo-simulate.mjs --loop` → the 5 buses move on the admin Live
   Map; the owner watches Tomiwa's bus live and gets the push sequence:
   *on the way → stop is next → 5 minutes away → **bus has arrived** → run complete*.

## Notes

- **Push on the owner's phone** needs the one-time "Enable notifications" tap in
  the PWA (web-push subscription). Without it, the in-app live map + Alerts list
  still work.
- The simulator needs your laptop + internet running during the demo.
- Everything lives under one demo school UUID on the `busbuzz-dev` project and is
  fully removed by `demo-teardown.mjs`.

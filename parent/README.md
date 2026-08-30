# BusBuzz — Parent PWA

The parent-facing app, rebuilt as an installable **Progressive Web App** so
parents on **both Android and iOS** use it from a URL — no App Store, no Apple
fee, instant updates. (The driver app stays a native Android APK: it needs
background GPS + kiosk mode, which a PWA cannot do.)

## Stack

- **Next.js 16** (App Router) + **React 19** — same framework as `web/`
- **@supabase/ssr** — same project/keys as `web/` and `mobile/`
- **Mapbox GL JS** — live bus map (native app uses `@rnmapbox/maps`; both use `[lng, lat]`)
- **Web Push (VAPID)** via `app/manifest.ts` + `public/sw.js`
- Bespoke design system (see `/design/mockups`): danfo-yellow signature,
  Bricolage Grotesque / Hanken Grotesk / Martian Mono, transit-line hero

## Getting started

```bash
cd parent
npm install
cp .env.example .env.local   # fill in Supabase + Mapbox + VAPID keys
npm run dev                  # http://localhost:3000
```

Without a `NEXT_PUBLIC_MAPBOX_TOKEN` the Track screen shows a stylised
fallback map, so the app runs before any keys are set.

### Push notifications (test locally)

iOS only delivers push to **home-screen-installed** PWAs. To test:

1. `npx web-push generate-vapid-keys` → put the pair in `.env.local`
2. Run over HTTPS: `npm run dev -- --experimental-https`
3. On iPhone: open the site → Share → **Add to Home Screen** → open from the icon → allow notifications

## Structure

```
parent/
├─ app/
│  ├─ layout.tsx            # fonts, metadata, SW registration
│  ├─ manifest.ts           # PWA manifest (installable)
│  ├─ globals.css           # design tokens
│  ├─ page.tsx              # Track — the live hero
│  ├─ track.module.css
│  ├─ login/page.tsx        # welcome + email OTP + iOS install nudge
│  └─ components/
│     ├─ CountdownBoard.tsx # live bus-stop countdown (client)
│     ├─ LiveMap.tsx        # Mapbox GL JS w/ stylised fallback (client)
│     ├─ InstallPrompt.tsx  # iOS add-to-home-screen card (client)
│     └─ ServiceWorkerRegister.tsx
├─ lib/supabase/            # browser + server clients (mirror web/)
└─ public/
   ├─ sw.js                 # push + notification-click handler
   └─ icon.svg              # installable brand mark
```

## Screens

All five parent screens are built in the shared design system and wired to
Supabase (same busbuzz-dev project as `web/` and `mobile/`):

- `/` — **Track** (live hero)
- `/route` — **All stops** (full route timeline)
- `/history` — **Trip history** (past runs, on-time badges)
- `/alerts` — **Alerts** (boarding / arrival / delay feed)
- `/child` — **Child profile** (route, medical notes, guardians)

`BottomNav` (`app/components/BottomNav.tsx`) is the one shared tab bar; the
back-arrow header is `app/components/ScreenHeader.tsx`.

### What's wired

- **Auth**: email OTP (6-digit code via `signInWithOtp` / `verifyOtp`,
  `shouldCreateUser: false` — parents are pre-registered by their school).
  `proxy.ts` refreshes the session and gates every screen except `/login`;
  `sw.js` + the manifest stay public so the app is installable pre-login.
- **Track** (`TrackClient` = `app/components/TrackLive.tsx`): server-fetches
  the parent's children + `get_parent_track_bundle`, then subscribes to the
  private `bus:{busId}` Realtime channel — live bus marker + breadcrumb on
  the Mapbox map, ETA countdown anchored to the last GPS ping, reached-stop
  detection (same 300 m proximity rule as mobile), boarding/drop-off/trip-end
  broadcasts, 30 s active-trip polling, and a resync on tab-visibility (the
  socket drops in background tabs). Off-hours it shows next-run + today's
  schedule + a recap derived from real trips/attendance.
- **Route** — full stop line from the bundle, with passed-stops / bus-here /
  on-board count overlaid from `trip_locations` + `attendance` when a trip is
  live.
- **History** — completed trips (last 30 days) + the child's attendance.
- **Alerts** — the `notifications` table, marked read on view.
- **Child** — real student/route/bus data; contacts = the bus driver + you
  (RLS hides co-guardian profiles); sign-out lives here.
- Multiple children: tapping the Track avatar cycles children (`/?child=`).

### Previewing states (demo)

Design states remain previewable without live data via query params:

- `/?demo=active` and `/?demo=idle` — Track's live/off-hours heroes with
  mockup data
- `/history?demo=empty` / `/alerts?demo=empty` — first-run empty states

Empty states share `app/components/EmptyState.tsx`.

## Not yet wired (next steps)

- Web Push: VAPID subscribe/unsubscribe Server Actions, a
  `web_push_subscriptions` table, and teaching the `send-push` Edge Function
  to deliver via Web Push alongside Expo tokens
- Production PNG icons (192/512 + maskable) to replace `icon.svg`

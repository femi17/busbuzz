# BusBuzz — CLAUDE.md
# Master context file. Read this at the start of every Claude Code session.
# Last updated: reflects lean stack decisions — Supabase-first, no NestJS, no Traccar, no Cloudinary, no Firebase, no Termii at MVP.

---

## What We're Building

BusBuzz is a school bus tracking platform for Lagos private schools.

**How it works:**
- BusBuzz owns cheap Android phones (Itel/Tecno, ~₦25,000–₦40,000 each), pre-configured in kiosk mode, mounted in each bus
- The driver opens the BusBuzz Driver App (locked to this app only — kiosk mode), starts the trip, and marks each student as boarded or dropped off at each stop
- The driver app broadcasts GPS location every 10 seconds via Expo's background location service
- Parents track their child's bus in real time on the Parent App (React Native / Expo)
- School admins manage everything from a web dashboard (Next.js)
- BusBuzz manages the SIM data plans — schools pay a monthly subscription that covers device depreciation + data

**What we deliberately do NOT have:**
- No separate GPS hardware — the driver phone IS the tracker
- No Traccar — no binary TCP protocol — GPS comes straight from the app
- No NestJS — Supabase Edge Functions handle all API logic
- No Socket.io — Supabase Realtime handles live GPS broadcasting
- No Firebase — Expo Push Notification Service handles push (free)
- No Cloudinary — Supabase Storage handles file uploads
- No Termii at MVP — Supabase Auth email OTP for parents (add SMS later when revenue exists)
- No Turborepo — simple folder structure, one repo

---

## Repository Structure

```
busbuzz/
├── web/                        ← Next.js 14 (App Router) — School Admin + Super Admin dashboard
├── mobile/                     ← Expo (React Native) — two apps from one codebase:
│   ├── src/apps/parent/        ←   Parent app (track bus, notifications, history)
│   └── src/apps/driver/        ←   Driver app (start trip, GPS broadcast, mark attendance)
├── supabase/
│   ├── functions/              ← Supabase Edge Functions (Deno) — all backend logic
│   │   ├── gps-update/         ←   Receives GPS pings from driver app
│   │   ├── start-trip/         ←   Driver starts a trip
│   │   ├── end-trip/           ←   Driver ends a trip
│   │   ├── mark-attendance/    ←   Driver marks student boarded/absent/dropped off
│   │   ├── send-push/          ←   Sends Expo push notifications
│   │   └── geofence-check/     ←   Called by gps-update; checks stop proximity
│   └── migrations/             ← SQL migration files (managed by Supabase CLI)
├── shared/
│   ├── types.ts                ← All shared TypeScript interfaces
│   ├── schemas.ts              ← All Zod validation schemas
│   └── geo.ts                  ← Haversine distance util, ETA calculations
└── .env.example                ← All environment variable names (values blank)
```

---

## Tech Stack

| Layer | Technology | Cost | Notes |
|---|---|---|---|
| Database | Supabase PostgreSQL | Free → $25/mo | Primary data store |
| Auth | Supabase Auth | Free | Email OTP for parents, email+password for admins |
| File storage | Supabase Storage | Free (1GB) | Student photos, bus images |
| Real-time GPS | Supabase Realtime | Free (200 concurrent) | Channels keyed by busId |
| API / backend | Supabase Edge Functions | Free (500k calls/mo) | Deno TypeScript, no server to manage |
| Mobile (parent + driver) | React Native + Expo SDK 51 | Free | Single codebase, two app configs |
| Mobile maps (parent app) | react-native-maps | Free | Uses native Google Maps (Android) + Apple Maps (iOS). Zero tile costs |
| Web admin maps | Mapbox GL JS | Free tier (50k loads/mo) | Only used in web dashboard — low load count |
| Push notifications | Expo Push Notification Service | Free | Handles both Android (FCM) and iOS (APNS) via Expo |
| Web hosting | Vercel | Free | Next.js deploys in seconds |
| Driver GPS | expo-location (background) | Free | Built into Expo — no hardware needed |
| Device management | Android Kiosk Mode (Device Owner) | Free | One ADB command per device locks phone to driver app only |

**Monthly infrastructure cost at MVP: ~$0**
**Scale trigger: when concurrent Realtime connections exceed 200 → upgrade Supabase to Pro ($25/mo)**

---

## Environment Variables

### web/.env.local
```
NEXT_PUBLIC_SUPABASE_URL=           # From Supabase → Settings → API → Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # From Supabase → Settings → API → anon public key
NEXT_PUBLIC_MAPBOX_TOKEN=           # From Mapbox → Tokens (for web admin map)
SUPABASE_SERVICE_ROLE_KEY=          # From Supabase → Settings → API → service_role (server only, never expose to client)
```

### mobile/.env
```
EXPO_PUBLIC_SUPABASE_URL=           # Same as web SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=      # Same as web SUPABASE_ANON_KEY
EXPO_PUBLIC_GPS_INTERVAL_MS=10000   # GPS broadcast interval (10 seconds)
EXPO_PUBLIC_GEOFENCE_RADIUS_M=300   # Metres from stop to trigger approach alert
```

### supabase/functions/.env (set in Supabase dashboard → Edge Functions → Secrets)
```
SUPABASE_URL=                       # Auto-injected by Supabase in Edge Functions
SUPABASE_SERVICE_ROLE_KEY=          # Auto-injected by Supabase in Edge Functions
EXPO_PUSH_URL=https://exp.host/--/api/v2/push/send
```

---

## Database Schema

All migrations live in `supabase/migrations/`. Use `supabase db push` to apply.

```sql
-- ENUMS
create type user_role as enum ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PARENT', 'DRIVER');
create type bus_status as enum ('ACTIVE', 'MAINTENANCE', 'RETIRED');
create type trip_status as enum ('ACTIVE', 'COMPLETED', 'CANCELLED');
create type route_type as enum ('MORNING', 'AFTERNOON');
create type attendance_status as enum ('BOARDED', 'ABSENT', 'DROPPED_OFF');

-- SCHOOLS
create table schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text not null,
  logo_url    text,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- USERS (extends Supabase Auth — auth.users is the source of truth for login)
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  role        user_role not null,
  school_id   uuid references schools(id),
  phone       text,
  expo_push_token text,           -- For push notifications via Expo
  created_at  timestamptz default now()
);

-- BUSES
create table buses (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id),
  plate_number    text not null,
  capacity        int not null,
  device_id       text unique,    -- Unique ID of the BusBuzz-owned Android phone (android ID)
  status          bus_status default 'ACTIVE',
  created_at      timestamptz default now()
);

-- ROUTES
create table routes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id),
  bus_id      uuid references buses(id),
  name        text not null,
  type        route_type not null,
  created_at  timestamptz default now()
);

-- STOPS (ordered stops on a route)
create table stops (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references routes(id) on delete cascade,
  name         text not null,
  latitude     double precision not null,
  longitude    double precision not null,
  sequence     int not null,
  eta_minutes  int,               -- Estimated minutes from trip start
  created_at   timestamptz default now()
);

-- STUDENTS
create table students (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id),
  name          text not null,
  class_name    text not null,
  photo_url     text,
  medical_notes text,
  route_id      uuid references routes(id),
  stop_id       uuid references stops(id),
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- STUDENT ↔ PARENT (many-to-many)
create table student_parents (
  student_id  uuid references students(id) on delete cascade,
  parent_id   uuid references profiles(id) on delete cascade,
  primary key (student_id, parent_id)
);

-- TRIPS
create table trips (
  id           uuid primary key default gen_random_uuid(),
  bus_id       uuid not null references buses(id),
  route_id     uuid not null references routes(id),
  driver_id    uuid references profiles(id),
  status       trip_status default 'ACTIVE',
  started_at   timestamptz default now(),
  ended_at     timestamptz,
  created_at   timestamptz default now()
);

-- TRIP LOCATIONS (GPS breadcrumbs — one row per 10s ping)
create table trip_locations (
  id          bigint generated always as identity primary key,
  trip_id     uuid not null references trips(id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  speed       real,
  recorded_at timestamptz not null,
  created_at  timestamptz default now()
);
create index on trip_locations (trip_id, recorded_at desc);

-- ATTENDANCE
create table attendance (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id),
  student_id  uuid not null references students(id),
  status      attendance_status not null,
  marked_by   uuid references profiles(id),
  marked_at   timestamptz default now(),
  unique (trip_id, student_id)    -- one attendance record per student per trip
);
```

### Row Level Security (RLS)

Enable RLS on ALL tables. Key policies:

```sql
-- Profiles: users can only read their own profile
-- School admins can read all profiles in their school
-- Parents can only read their own profile

-- Students: parents can only read students linked to them via student_parents
-- School admins can read/write all students in their school

-- Trips + TripLocations: parents can only read trips for buses their children are on
-- School admins can read all trips in their school

-- Attendance: parents can only read attendance for their own children
```

Full RLS policy SQL lives in `supabase/migrations/02_rls_policies.sql`.

---

## Key Architectural Flows

### GPS Flow (Driver Phone → Parent App)
```
Driver App (Expo, background location)
  → every 10 seconds: POST supabase/functions/v1/gps-update
      body: { tripId, busId, lat, lng, speed, timestamp, deviceId }
    → Edge Function validates deviceId matches bus record
    → Inserts row into trip_locations
    → Broadcasts via Supabase Realtime channel `bus:{busId}`:
        { lat, lng, speed, timestamp }
    → Calls geofence-check function

Parent App
  → subscribed to Supabase Realtime channel `bus:{busId}` on trip start
  → receives broadcast → updates map marker position
```

### Geofence Flow
```
geofence-check Edge Function
  → receives { busId, tripId, lat, lng }
  → loads active trip's route stops from DB
  → calculates haversine distance to each upcoming stop
  → if distance < 300m AND stop not yet triggered this trip:
      → marks stop as triggered (update stop_trigger record)
      → calls send-push function for all parents at that stop
          → Expo Push API: "Bus is 2 minutes away from [Stop Name]"
```

### Attendance Flow
```
Driver marks student at stop (taps BOARDED / ABSENT)
  → POST supabase/functions/v1/mark-attendance
      body: { tripId, studentId, status, driverId }
    → Upserts attendance record
    → If BOARDED: calls send-push for that student's parents
        → "Chidi has boarded the bus"
    → If DROPPED_OFF: calls send-push for parents
        → "Chidi has been dropped off at school"
```

### Auth Flow
```
Parents:
  → Enter email in parent app
  → Supabase Auth sends magic link / OTP to email (free, no SMS gateway)
  → Tap link → session created → JWT issued by Supabase automatically

School Admins:
  → Email + password login via Supabase Auth
  → Super admin creates school admin accounts from dashboard

Drivers:
  → Admin sets a 4-digit PIN per driver in the dashboard
  → Driver enters phone number + PIN in driver app
  → Custom auth via Edge Function: validates PIN → issues Supabase session
  → Phone boots → kiosk mode → driver app opens automatically
```

### Push Notification Flow
```
send-push Edge Function
  → receives { userIds[], title, body, data }
  → looks up expo_push_token for each userId from profiles table
  → POST https://exp.host/--/api/v2/push/send
      body: [{ to: expoPushToken, title, body, data }]
  → Expo service delivers to Android (via FCM) and iOS (via APNS) for free
  → No Firebase account needed — Expo manages FCM/APNS credentials
```

---

## Supabase Realtime Channel Structure

```
Channel naming: bus:{busId}

Driver app broadcasts to:       bus:{busId}
Parent app subscribes to:       bus:{busId}   (for their child's bus)
Admin web subscribes to:        bus:{busId}   (for all school buses — admin overview)

Broadcast event: location_update
Payload: { lat: number, lng: number, speed: number, timestamp: string, busId: string }

Presence (optional, Phase 2):
  → Driver app sets presence on trip start
  → Admin can see which drivers are online
```

---

## Shared Types (shared/types.ts)

```typescript
export type UserRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'PARENT' | 'DRIVER'
export type BusStatus = 'ACTIVE' | 'MAINTENANCE' | 'RETIRED'
export type TripStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type RouteType = 'MORNING' | 'AFTERNOON'
export type AttendanceStatus = 'BOARDED' | 'ABSENT' | 'DROPPED_OFF'

export interface Profile {
  id: string
  name: string
  role: UserRole
  schoolId?: string
  phone?: string
  expoPushToken?: string
}

export interface School {
  id: string
  name: string
  address: string
  logoUrl?: string
  isActive: boolean
}

export interface Bus {
  id: string
  schoolId: string
  plateNumber: string
  capacity: number
  deviceId?: string
  status: BusStatus
}

export interface Route {
  id: string
  schoolId: string
  busId: string
  name: string
  type: RouteType
  stops: Stop[]
}

export interface Stop {
  id: string
  routeId: string
  name: string
  latitude: number
  longitude: number
  sequence: number
  etaMinutes?: number
}

export interface Student {
  id: string
  schoolId: string
  name: string
  className: string
  photoUrl?: string
  routeId?: string
  stopId?: string
}

export interface Trip {
  id: string
  busId: string
  routeId: string
  driverId?: string
  status: TripStatus
  startedAt: string
  endedAt?: string
}

export interface TripLocation {
  tripId: string
  latitude: number
  longitude: number
  speed?: number
  recordedAt: string
}

export interface Attendance {
  tripId: string
  studentId: string
  status: AttendanceStatus
  markedAt: string
}

export interface LocationBroadcast {
  lat: number
  lng: number
  speed: number
  timestamp: string
  busId: string
}

export interface ApiResponse<T> {
  data: T
  message: string
  error?: string
}
```

---

## Code Conventions

- TypeScript everywhere — strict mode on web, mobile, and Edge Functions
- Supabase client: use `@supabase/supabase-js` v2 in all apps
- Edge Functions: Deno TypeScript. Import from `https://deno.land/x/` or npm via `npm:` prefix
- All Edge Functions return `{ data, message }` on success, `{ error, statusCode }` on failure
- RLS enforces data access at DB level — never rely solely on app-level checks
- Mobile: functional components, hooks for all state, no class components
- Web: Server Components for data fetching, Client Components only where interactivity needed
- Zod validates all inputs before any DB operation — schemas live in shared/schemas.ts
- Maps on mobile: react-native-maps only (no Mapbox on mobile — tile costs)
- Maps on web: Mapbox GL JS only (low load count in admin dashboard)
- Never log sensitive data (tokens, emails) — console.log allowed in development only

---

## Running Locally — No Docker Required

This project uses Supabase cloud directly. There is no local Supabase instance.
Never run `supabase start` — it requires Docker and is not part of this workflow.

### Two Supabase projects (create both as free projects)
- `busbuzz-dev` — used during development. Safe to break.
- `busbuzz-prod` — used for live schools. Never touch during development.

### Prerequisites
```bash
npm install -g pnpm
npm install -g supabase
npm install -g expo-cli
```

### First-time project setup
```bash
# Install all dependencies
pnpm install

# Link CLI to your dev Supabase project
supabase login
supabase link --project-ref [your-busbuzz-dev-project-ref]
# Find your project ref: Supabase dashboard → Project Settings → General → Reference ID
```

### Running the apps
```bash
# Web admin dashboard
cd web && pnpm dev             # runs on localhost:3000

# Mobile apps (parent + driver)
cd mobile && pnpm start        # Expo dev server — scan QR with Expo Go on your phone
```

### Database migrations — MANUAL PROCESS
Claude Code will write SQL files to `supabase/migrations/`.
After each feature is built, Claude also writes `.pipeline/sql-to-run.md`.

To apply a migration:
1. Open Supabase dashboard → busbuzz-dev project → SQL Editor
2. Copy the SQL from `.pipeline/sql-to-run.md`
3. Paste and run each block in order
4. Confirm success before continuing

To push all migrations to prod when ready:
```bash
supabase link --project-ref [your-busbuzz-PROD-project-ref]
supabase db push
supabase link --project-ref [your-busbuzz-DEV-project-ref]  # switch back to dev
```

### Deploying Edge Functions
```bash
# Deploy a single function to dev
supabase functions deploy [function-name] --project-ref [dev-project-ref]

# Deploy all functions to prod
supabase functions deploy --project-ref [prod-project-ref]
```

### Testing GPS without a bus
Use the Supabase dashboard API tester or curl against your cloud dev URL:
```bash
curl -X POST https://[DEV_PROJECT_REF].supabase.co/functions/v1/gps-update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [driver-jwt-from-supabase-auth]" \
  -d '{"tripId":"test-trip","busId":"test-bus","lat":6.5244,"lng":3.3792,"speed":35,"timestamp":"2024-01-15T08:30:00Z","deviceId":"test-device"}'
```

---

## Device Setup (Per Bus Phone — One-Time, ~30 Minutes)

```bash
# 1. Enable Developer Mode on Android phone (tap Build Number 7 times in Settings → About)

# 2. Connect to laptop via USB

# 3. Enable kiosk mode (Device Owner)
#    This locks the phone to ONLY run the BusBuzz driver app
adb shell dpm set-device-owner com.busbuzz.driver/.AdminReceiver

# 4. Install driver app
eas build --platform android --profile driver
adb install busbuzz-driver.apk

# 5. Phone will now boot directly into BusBuzz driver app
#    Driver cannot exit, access settings, or install other apps

# 6. Insert SIM with data plan (MTN/Airtel 1GB/month)

# 7. Mount phone on dashboard with car charger permanently connected

# 8. Register device in BusBuzz admin dashboard:
#    Buses → Edit → Device ID → paste Android device ID
```

## Scale Notes (When to Upgrade)

| Threshold | Action |
|---|---|
| >200 concurrent parents tracking | Upgrade Supabase to Pro ($25/mo) — increases Realtime to 500 concurrent |
| >500k Edge Function calls/month | Upgrade Supabase to Pro (included) |
| >1GB file storage | Upgrade Supabase to Pro (8GB included) |
| >10 schools / 500+ buses | Consider splitting schools across Supabase projects for Realtime isolation |
| >50k map loads/month (web) | Mapbox billing kicks in (~$0.50 per 1k loads above free tier) |
| Android maps billing | Google Maps SDK free up to $200 credit/mo (~28k loads). Monitor in Google Cloud Console |

---

## UI/UX Design Direction

For any UI/UX work on the web admin dashboard (`web/`) or mobile apps (`mobile/src/apps/parent`, `mobile/src/apps/driver`), invoke the `frontend-design` skill before designing or redesigning screens. Treat the brief as: a distinctive visual identity grounded in BusBuzz's actual subject matter (Lagos school runs, bus routes, parent peace-of-mind, driver workflow) — not a generic SaaS dashboard or templated AI-generated look.

Constraints specific to this product:
- **Driver app** runs on cheap kiosk-mode Android phones mounted on a dashboard — UI must be high-contrast, large-touch-target, usable in sunlight glare and with one thumb while semi-distracted. Minimal cognitive load: start trip, mark attendance, end trip.
- **Parent app** is the trust/peace-of-mind surface — the live map and ETA/arrival moments are the hero, not a generic list-based dashboard.
- **Web admin dashboard** serves Lagos school admins managing routes, students, and buses — information-dense but should still avoid the generic "cream+serif" or "dark+neon accent" AI-template defaults; ground typography and color in the school/transit domain.
- Keep accessibility floor: responsive down to mobile widths, visible keyboard focus on web, reduced-motion respected.

When making design changes, follow the skill's brainstorm → plan → self-critique → build process rather than jumping straight to code.

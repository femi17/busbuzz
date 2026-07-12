# BusBuzz Ejigbo Journey Simulation — Run Guide

## Prerequisites

- Node.js 18+ installed
- Supabase CLI linked to your dev project
- All Edge Functions deployed to dev: `start-trip`, `end-trip`, `mark-attendance`, `gps-update`, `geofence-check`, `send-push`
- Parent app installed on scrpoll07@gmail.com's phone with push notifications enabled

## Step 1: Deploy Edge Functions

```bash
supabase functions deploy start-trip --project-ref <DEV_REF>
supabase functions deploy end-trip --project-ref <DEV_REF>
supabase functions deploy mark-attendance --project-ref <DEV_REF>
supabase functions deploy gps-update --project-ref <DEV_REF>
supabase functions deploy geofence-check --project-ref <DEV_REF>
supabase functions deploy send-push --project-ref <DEV_REF>
```

## Step 2: Run seed SQL

1. Open Supabase Dashboard → SQL Editor
2. Copy the full contents of `supabase/seed-simulation.sql`
3. Run the first block (schools, buses, routes, stops, students)

## Step 3: Create auth users

1. Supabase Dashboard → Authentication → Users → Add User
2. Create `scrpoll07@gmail.com` (if not already present) — set any password
3. Create `driver@sim.test` with password `Driver1234!`
4. Copy both UUIDs

## Step 4: Insert profiles

1. Back in SQL Editor, uncomment the second block in `seed-simulation.sql`
2. Replace `PARENT_UUID` with the UUID for scrpoll07@gmail.com
3. Replace `DRIVER_UUID` with the UUID for driver@sim.test
4. Run it

## Step 5: Verify the data

Run the verification query at the bottom of the seed file. Expected result:

| student | stop | parent |
|---|---|---|
| Chidi Okonkwo | Parent Home — Ejigbo | Anna |

## Step 6: Ensure push token is registered

scrpoll07@gmail.com must have opened the parent app at least once and accepted push notification permissions. Verify in Supabase:

```sql
SELECT expo_push_token FROM profiles WHERE id = 'PARENT_UUID';
```

The `expo_push_token` column must NOT be null. If it is, open the parent app on that phone and accept notifications.

## Step 7: Set up .env

Create or edit `.env` in the project root:

```
SUPABASE_URL=https://<YOUR_DEV_REF>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SIMULATION_DRIVER_JWT=<leave blank for now>
```

## Step 8: Get driver JWT

```bash
node scripts/get-driver-token.mjs
```

Copy the printed token and paste it as `SIMULATION_DRIVER_JWT` in `.env`.

## Step 9: Open the parent app

On scrpoll07@gmail.com's phone, open the BusBuzz parent app. The app should be on the live tracking screen (or it will show tracking once the trip starts).

## Step 10: Run the simulation

```bash
node scripts/simulate-journey.mjs
```

The script takes approximately 3 minutes 24 seconds (51 waypoints x 4 seconds).

## Expected push notifications

scrpoll07@gmail.com's phone should receive these 3 notifications:

1. **"Chidi has boarded the bus"** — sent immediately at simulation start (mark-attendance BOARDED)
2. **"Bus is approaching Parent Home — Ejigbo"** — sent when simulated GPS enters 300m radius of 6.518898, 3.2882858 (geofence trigger)
3. **"Chidi has been dropped off"** — sent at simulation end (mark-attendance DROPPED_OFF)

## Troubleshooting

- **No push notifications:** Check that `expo_push_token` is set in the profiles table for scrpoll07@gmail.com
- **start-trip fails with 401:** The driver JWT has expired. Re-run `get-driver-token.mjs` and update `.env`
- **geofence notification not firing:** Check that the `trip_stop_triggers` table exists and that `geofence-check` is deployed. The trigger fires when GPS is within 300m of 6.518898, 3.2882858
- **"Bus is approaching" fires too early:** The 300m geofence radius means it can trigger ~1-2 waypoints before the final stop

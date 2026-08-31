# BusBuzz Deployment Guide

## Environments

| | busbuzz-dev | busbuzz-prod |
|---|---|---|
| Supabase ref | `nmgvnoudmxrzqthnfxkk` | `cjjsjmelyfbpcnqfkgbc` |
| Serves | local dev, Vercel previews, EAS `preview`/`driver` profiles | busbuzz.com.ng, app.busbuzz.com.ng, EAS `production*`/`driver-prod` profiles |

busbuzz-prod was bootstrapped 2026-08-30 from the migration files (applied
as batches `b01`–`b08` via the Supabase MCP; `b08` is
`20260830140000_capture_dev_drift.sql`, which records everything that had
been created directly on dev). The `check-push-receipts` pg_cron job on
each project calls that project's own functions URL.

## 1. Database Migrations

Migrations are applied via the Supabase MCP (`apply_migration`) or the
dashboard SQL Editor (no local Supabase instance). Apply to dev first;
apply to prod (`cjjsjmelyfbpcnqfkgbc`) when releasing. If a migration
hardcodes a project URL (cron jobs), substitute the target project's.

## 2. Edge Functions

Deploy via the Supabase MCP (`deploy_edge_function`). Functions that
import `../../../shared/schemas.ts` must be uploaded with repo-relative
paths (`supabase/functions/<name>/index.ts` + `shared/schemas.ts`) so the
import resolves. verify_jwt is `false` only for: driver-login, send-push,
check-push-receipts.

Secrets: `VAPID_KEYS` + `WEB_PUSH_CONTACT` live in the service-role-only
`app_secrets` table (per project — dev and prod have different VAPID
pairs). `INTERNAL_FUNCTION_SECRET` and `RESEND_API_KEY` are dashboard
Edge Function secrets, set per project. Geocoding uses Mapbox with the
public pk. token baked into manage-school/manage-student — no Google
server key.

## 3. Web Admin (Next.js)

Push to the `main` branch on GitHub. Vercel auto-deploys from the `web/` directory.

No manual steps required after initial Vercel project setup.

## 4. Mobile Apps (Android APKs)

### Prerequisites

```bash
npm install -g eas-cli
cd mobile
eas login          # log in to your Expo account
eas build:configure  # interactive — links EAS project, only needed once
```

### Build parent app APK (for testing)

```bash
cd mobile
pnpm build:parent:apk
# or: eas build --platform android --profile preview
```

### Build driver app APK (for bus phones)

```bash
cd mobile
pnpm build:driver:apk
# or: eas build --platform android --profile driver
```

### Build for Play Store (AAB)

```bash
pnpm build:parent:prod    # parent app bundle
pnpm build:driver:prod    # driver app bundle
```

## 5. Driver Phone Setup (Kiosk Mode)

Per-phone, one-time setup (~30 minutes):

1. Enable Developer Mode: Settings > About Phone > tap Build Number 7 times
2. Enable USB Debugging in Developer Options
3. Connect phone to laptop via USB
4. Install the driver APK:
   ```bash
   adb install busbuzz-driver.apk
   ```
5. Set Device Owner for kiosk mode:
   ```bash
   adb shell dpm set-device-owner com.busbuzz.driver/.AdminReceiver
   ```
   Note: This requires a custom Expo config plugin or bare workflow ejection.
   See `mobile/src/apps/driver/AdminReceiver.ts` for details.
6. Insert SIM card with data plan (MTN/Airtel, 1GB/month minimum)
7. Mount phone on bus dashboard with permanent car charger connection
8. Register the device in BusBuzz admin dashboard: Buses > Edit > Device ID

## EAS interactive setup note

No EAS project is currently linked to this codebase (`app.config.ts` has no `extra.eas.projectId`). Before `eas build` will work, the developer must run:

```bash
cd mobile
eas login
eas build:configure
```

This is interactive (requires Expo account credentials and project selection) and cannot be automated. The `eas.json` and `app.config.ts` files are already authored and committed. The interactive step only needs to happen once before the first build.

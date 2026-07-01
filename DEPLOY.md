# BusBuzz Deployment Guide

## 1. Database Migrations

Migrations are applied manually via the Supabase SQL Editor (no local Supabase instance).

**For dev:**
1. Open Supabase dashboard for `busbuzz-dev`
2. Go to SQL Editor
3. Copy SQL from `.pipeline/sql-to-run.md` and execute each block in order

**For production:**
```bash
supabase link --project-ref <busbuzz-prod-project-ref>
supabase db push
supabase link --project-ref <busbuzz-dev-project-ref>   # switch back to dev
```

## 2. Edge Functions

```bash
# Deploy a single function
supabase functions deploy <function-name> --project-ref <project-ref>

# Deploy all functions
supabase functions deploy --project-ref <project-ref>
```

Set secrets in Supabase dashboard under Edge Functions > Secrets.

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

<div align="center">

# Inji Offline Verifier

Offline-first credential verification built with Expo Router, React Native, and the `@mosip/react-inji-verify-sdk`.

</div>

## ✨ Overview

This project is a complete reference implementation of the **Inji Offline Verifier** experience:

- Cache verifiable credentials, issuer public keys, and JSON-LD contexts directly on the device.
- Verify credentials entirely offline via QR scanning or raw JSON input.
- Provide clear guidance for signature failures or missing cache data.
- Keep a local verification history to audit recent scans.

Everything runs inside a single Expo SDK 54 app backed by a workspaces-style local SDK (`inji-verify-sdk`). The goal is fast field deployments where connectivity is intermittent but credential checks must continue working.

## 🔍 Key Features

- **Credential Cache Management** – Import credential JSON, inspect summaries, and delete or clear cached entries.
- **SDK Cache Snapshot** – Surface cached contexts, public keys, and revocation lists seeded via `OrgResolver` + `SDKCacheManager`.
- **Offline Verification Flow** – Scan QR codes with `expo-camera` or paste/upload raw payloads. Verification is handled by `CredentialsVerifier` from the packaged SDK.
- **Actionable Errors** – Friendly alerts for signature failures (`ERR_SIGNATURE_VERIFICATION_FAILED`) and missing offline dependencies (`ERR_OFFLINE_DEPENDENCIES_MISSING`) with one-tap recovery to seed caches.
- **Verification History** – Persist the last 100 results with metadata (status, message, timestamp, source).
- **Expo Router UI** – Tabbed navigation for Credentials and Verify screens, modern theming, and haptic-aware tabs.

## 🧱 Project Structure

```
app/
  (tabs)/credentials.tsx     # Credential cache management screen
  (tabs)/verify.tsx          # Offline QR verification workflow
  modal.tsx                  # Shared modal host (Expo Router)
components/
  ui/                        # Reusable UI atoms (IconSymbol, Collapsible, etc.)
context/
  OfflineCacheContext.tsx    # Handles credential storage + SDK cache syncing
  VerificationHistoryContext.tsx
inji-verify-sdk/             # Local SDK fork packaged as @mosip/react-inji-verify-sdk
polyfills/                   # Web crypto / text decoder shims for RN
scripts/reset-project.js     # Expo starter cleanup helper
```

### Core Modules

- `OfflineCacheContext` – Persists credentials in `AsyncStorage`, primes the SDK cache (contexts, keys, revocations), and exposes helper methods to refresh snapshots.
- `VerificationHistoryContext` – Stores verification results locally with generated IDs and metadata.
- `app/(tabs)/credentials.tsx` – Entry point for adding JSON credentials, importing files, clearing caches, and viewing SDK stats.
- `app/(tabs)/verify.tsx` – QR scanner & verification history UI with user-friendly alerting.
- `inji-verify-sdk/src/services/offline-verifier/*` – Offline verification pipeline (credential validation, signature verification, cache handling).

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x (recommended for Expo SDK 54)
- npm 10+
- Expo CLI (`npx expo` is bundled with npm 7+)
- For Android builds: Android Studio + SDK, or an Expo development build device

### Install & Run

```bash
npm install
npx expo start
```

Open the project using:

- **Expo Go** (for quick UI validation)
- **Android Emulator / iOS Simulator** via the Expo dev tools
- **Development build** (`npx expo run:android`) for camera and offline cache testing

> ℹ️ Expo Go doesn’t bundle `expo-camera` on some platforms. If scanning doesn’t start, create a development build.

## 🔐 Offline Verification Workflow

1. **Seed Offline Data**
   - Go to the **Credentials** tab.
   - Paste credential JSON or import a `.json`/`.txt` file.
   - The app stores the credential and primes the SDK cache with issuer contexts, keys, and revocation data using `OrgResolver` → `SDKCacheManager`.

2. **Verify Credentials**
   - Move to the **Verify** tab.
   - Tap **Scan QR** to launch the camera (grants permission at runtime) or use any upstream trigger that supplies raw payloads.
   - `CredentialsVerifier.verify` runs client-side signature, schema, and revocation checks for `CredentialFormat.LDP_VC`.

3. **Review Results**
   - Result cards display status, message, and error codes.
   - The verification history list persists the latest 20 entries (capped at 100 in storage) with quick reference details.

### Error Handling Cheatsheet

| Error Code | What it means | Suggested Action |
|------------|---------------|------------------|
| `ERR_OFFLINE_DEPENDENCIES_MISSING` | Contexts/keys/revocation data not cached | Re-open **Credentials** tab while online to seed caches, then retry |
| `ERR_SIGNATURE_VERIFICATION_FAILED` | Signature validation failed (tampered/unsupported) | Confirm issuer, refresh bundle, or reimport credential |
| `VC_EXPIRED` | Credential is valid but expired | Request a fresh credential |
| `VC_REVOKED` | Credential present in revoked list | Reject credential |

The Verify screen surfaces these states with contextual alerts and optional deep links back to the Credentials tab.

## 🛠️ Working with the Local SDK

The app depends on the co-located package `@mosip/react-inji-verify-sdk` (`inji-verify-sdk/`). It bundles:

- Offline credential & presentation verifiers
- Cache helpers (`SDKCacheManager`, `CacheHelper`)
- JSON-LD document loader tailored for offline use
- `decodeQrData` utilities shared by the mobile app

When you modify the SDK:

```bash
cd inji-verify-sdk
npm install
npm run build       # Builds to dist/
```

The root app consumes the package via `"file:./inji-verify-sdk"`, so rebuilds are immediately available to Expo after restarting the dev server.

## 📱 Building an Android APK / AAB

For production-ready binaries, use Expo Application Services (EAS). A minimal flow:

```bash
# 1. Ensure you are logged in
npx expo login

# 2. Configure (runs interactively the first time)
npx eas build:configure

# 3. Trigger a build (APK for quick sideloads, AAB for Play Store)
eas build --platform android --profile preview   # APK
eas build --platform android --profile production # AAB
```

If you prefer the classic bare workflow, generate native projects first:

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

Before shipping, double-check `app.json` for bundle identifiers, version codes, and adaptive icons located under `assets/images/`.

## 🧪 Quality Gates

- **Lint**: `npm run lint`
- **Type Checking**: `npx tsc --noEmit`
- **SDK Tests**: From `inji-verify-sdk`, run `npm test` (Jest configuration provided for offline verifier components).

These checks keep the project healthy as you extend verification logic or UI features.

## 🤝 Troubleshooting

- **Camera prompt never appears** – Confirm you’re on a development build; Expo Go on desktop browsers can’t access native camera APIs.
- **Offline dependencies missing** – Re-seed credential bundles while connected, or clear caches (`Delete All Cached Credentials`) and re-import.
- **Stale verification history** – Use the **Clear** action in the Verify tab header to reset local history.
- **SDK cache mismatches** – Call `Refresh Cache Details` in the Credentials tab after scanning new credentials.

## 📚 Additional Resources

- [MOSIP Documentation](https://docs.mosip.io/)
- [Expo Router Guide](https://docs.expo.dev/router/introduction/)
- [expo-camera docs](https://docs.expo.dev/versions/latest/sdk/camera/)

---

Maintained by the Inji Offline App team. Contributions are welcome—open an issue or PR with reproducible steps and screenshots/logs where relevant.

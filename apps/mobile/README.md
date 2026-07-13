# @bearboard/mobile

Athlete + coach app â Expo SDK 54 / React Native 0.81 / TypeScript.

## Status

Placeholder scaffold. Dependencies are declared but not installed, and there is
no native project generated yet.

HealthKit / Health Connect require a **dev-client** build (not Expo Go). Bring it
up with:

```bash
# from the repo root
npm install
cd apps/mobile
npx expo install            # resolve Expo-compatible versions
npx eas init                # set the projectId in app.json
npx expo run:ios            # or run:android â generates native project + dev client
```

## Constraints (from PRD Â§3.2)

- iOS floor: **15.1** (Expo SDK 54).
- Android floor: **API 29** (Android 10) for Health Connect.
- Health data needs a dev-client; Expo Go will not work.

## Notes

- Copy `.env.example` -> `.env`. Only `EXPO_PUBLIC_*` vars reach the client bundle.
- `ios/` and `android/` are gitignored (regenerate with `expo prebuild` / `run:*`).

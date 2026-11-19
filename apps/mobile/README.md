# UNRET mobile app (iOS & Android)

Built with Expo SDK 52 (React Native 0.76) and expo-router. It uses the same API as the website, and shares its statuses, money formatting and Romanian translations through `@unret/shared`.

## Run it

```bash
cp .env.example .env            # set EXPO_PUBLIC_API_URL for your device (see the comments in the file)
pnpm --filter @unret/shared build
pnpm --filter @unret/mobile dev # then press i (iOS simulator), a (Android emulator) or scan the QR code with Expo Go
```

A phone reaches the API through your computer's local IP address (e.g. `http://192.168.1.20:4000`). Add the app's origin to `WEB_ORIGIN` in `apps/api/.env` only when testing the web build.

## What's in the app

- **Sign-in:** register (email or phone), log in, two-factor codes. Tokens are stored in the iOS Keychain / Android Keystore.
- **Customer mode:** home with services, search with filters, professional profiles (save, message, request a quote), posting requests with photos, comparing and accepting offers, requesting changes.
- **Professional mode:** dashboard with profile completeness, request inbox, sending and revising offers, pausing new requests, weekly hours, time off, upcoming appointments.
- **Jobs:** progress, start / finish / confirm, proposing and accepting changes, cancelling, disputes, reviews, recording a direct payment or paying online (simulated in development).
- **Messages:** real-time chat with photo attachments, and a badge for unread messages.
- **Notifications:** in-app list, plus push registration (the Expo push token is sent to `/notifications/devices`).
- **Settings:** language (ro/en), profile, push preferences, account deletion. Light and dark mode.
- **Website only:** administration and full profile editing (portfolio, services, verification documents).

## Publishing to the stores

1. `npm i -g eas-cli && eas init` creates an Expo project and adds its `projectId`, which push notifications need.
2. `eas build --platform all` produces signed iOS and Android builds. This needs an Apple Developer account and a Google Play Console account.
3. Point `EXPO_PUBLIC_API_URL` at the production API (HTTPS) before building.
4. On the server, connect the push channel (`apps/api/src/modules/notifications/channels.ts`) to Expo's push service.

# simpleapp

A radically minimal scheduler: type anything into one bar, and it becomes a task, a
reminder, or a calendar event. Web + iOS first, Android later.

- Product spec: [`docs/APP_SPEC.md`](docs/APP_SPEC.md) (behavioral reference) and
  [`docs/prototype.html`](docs/prototype.html) (open in a browser)
- **Decisions that supersede the spec:** [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Build plan: [`docs/BUILD_STEPS.md`](docs/BUILD_STEPS.md)

## Layout

```
packages/core   Pure TypeScript scheduling logic shared by every platform:
                natural-language parser, rules engine (create/move/cancel/complete,
                follow-up questions), recurrence, conflicts, Day-view layout,
                edit-sheet save logic, notifications, Free/Pro plan rules, AI-fallback contract.
apps/mobile     Expo (React Native + Expo Router + react-native-web) app for
                iOS, web and later Android: Home / Tasks / Calendar / Settings,
                insert bar, Day/Week/Month views, edit sheet. Data is saved on
                the device (AsyncStorage) and works fully offline.
```

## Develop

```sh
npm install
npm test          # all workspace tests
npm run typecheck

npm run web       # open the app in a browser
npm run ios       # iOS: scan the QR code with Expo Go, or press i for the simulator
npm run build:web # static web build in apps/mobile/dist (deploy anywhere, e.g. Vercel)
```

Optional: set `EXPO_PUBLIC_PARSE_FALLBACK_URL` to enable the online AI fallback
(server endpoint not deployed yet; without it the app uses on-device rules only).

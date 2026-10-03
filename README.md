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

## Backend (Supabase)

The app talks to the Supabase project in `apps/mobile/src/config.ts` (URL + publishable
key, both safe to ship; Row Level Security protects data). Env vars
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` override it. The app works
fully offline either way; sync catches up when it can.

One-time project setup: see [`supabase/README.md`](supabase/README.md).

The online AI fallback is the `parse-fallback` edge function in `supabase/functions`
(setup steps 5–7 in `supabase/README.md`). `EXPO_PUBLIC_PARSE_FALLBACK_URL` overrides its URL.

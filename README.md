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
apps/           (next) Expo app for iOS + web (+ Android)
```

## Develop

```sh
npm install
npm test          # all workspace tests
npm run typecheck
```

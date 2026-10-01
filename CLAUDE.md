# Notes for Claude

- Read `docs/DECISIONS.md` first; it overrides `docs/APP_SPEC.md` where they conflict.
- **Offline first:** the shipped app must work fully offline on the rule parser in
  `packages/core`. An AI model may be used only as an *online fallback* through our own
  server endpoint, never directly from the client with a vendor key, and always with a
  timeout that falls back to the rule result. Never make the AI a required path.
- `packages/core` stays pure: no React, no network, no storage, no `Date.now()`. Time comes
  in through `EngineContext.now`. All behavior is unit-tested there; add a regression test
  for every parsing bug before fixing it.
- Run `npm test` and `npm run typecheck` before committing.

# Decisions (supersede APP_SPEC.md where they conflict)

Recorded from the product owner's answers on 2026-10-01. `APP_SPEC.md` and `prototype.html`
remain the behavioral reference; where they disagree with this file, this file wins.

## Platforms & stack

- **Web and iOS are top priority; Android is secondary.**
- **Recommended stack:** one **Expo (React Native + Expo Router + react-native-web)** app
  for iOS, web, and later Android, instead of separate Next.js + React Native apps. Reason:
  one UI codebase means the three platforms can't drift apart, and Android comes almost
  for free. Next.js stays an option for a marketing site.
- All scheduling logic lives in `packages/core`. It's pure TypeScript with no UI and no I/O,
  and every platform shares it.
- **Backend:** Supabase (Postgres, auth, edge functions).

## Parsing: offline first, AI fallback when online (replaces APP_SPEC §9)

- The app must work **completely offline** using the rule-based parser in `packages/core`.
- The rule parser marks its result low-confidence when the text has date or time words it
  couldn't place (for example "every other tuesday" or "next month"). If that happens
  **and** the device is online, the app may ask an AI model through **our own server
  endpoint**. The device never holds a vendor API key.
- **No delay or dead-ends:** the AI call has a 2.5s timeout. On timeout, error, invalid
  output, or offline, the rule-based result is used immediately
  (`handleInputWithFallback`).
- The AI returns the **same Intent shape** the rule parser produces. Core validates it and
  applies it with the same engine, so every spec rule (rollover, meal hints, conflicts,
  least-booked day, …) holds regardless of who understood the text.

## Accounts, trial, paywall

- Users sign in before first use. Sign-up must be quick (email magic link or code, plus
  Sign in with Apple and Google).
- **7-day free trial with no card.** It is a server-side trial: `trial_started_at` is set
  at signup. It is *not* a store-managed trial, since App Store and Play trials need a
  payment method.
- The trial is visible from day one: a banner reads "Free trial — N days left" and then
  "Last day of your free trial". It must never feel like a surprise lockout.
- After 7 days the app is blocked until the user subscribes. Their data is kept.
- Billing: Stripe on web, and in-app purchase on iOS/Android (store rules). RevenueCat is
  the likely glue so one entitlement covers all platforms.
- Open question: is "7 days" seven calendar days from signup (implemented) or seven
  days of actual use?

## Behavior decisions

| # | Decision |
|---|---|
| Week start | Sunday. |
| "lunch at 11" | 11am. Lunch hint: 9–11 => am, otherwise pm. |
| "before friday" on Fri/Sat | Means next week's Friday (window: today → the day before it). Same for any weekday, e.g. "before sunday" on a Sunday. |
| "next week" said on Sunday | Mon–Thu of the *following* week (8 days out). |
| Text commands on Tasks | Yes. Tasks can be moved ("move essay to friday"), cancelled, and completed ("done with essay"). |
| Recurrence | Any weekday combination ("mon and tue", "mon wed fri", "tue/thu", "weekdays", "weekends", "every day"). Stored as a rule plus occurrences on a rolling 8-week window. |
| Event notifications | Setting with 15 min / 30 min / 1 hr, multi-select (any or all). |
| Completed tasks | Sink to the bottom; disappear when a new day starts. A setting can turn the disappearing off. |
| Overnight events | Supported. Day view splits the event at midnight with a "continues" indicator on both days. |
| Follow-up questions | Supported (real conversational state): "move dinner" → "to when?" → "8pm" works. So do picking from a list ("2", "the friday one"), One/All, and "create it". |
| Prototype footer ("will use Claude") | Superseded by the offline-first plus AI-fallback design above. |

## Small judgment calls made while implementing (easy to change)

- Command verbs only count at the **start** of the message, so "call to cancel gym
  membership tomorrow" is a reminder, not a cancel. "take", "replace" and "change" count as
  move verbs only when an existing item matches, so "take out the trash" is a new item.
- "next friday" = the next Friday strictly after today (matches the prototype).
- "sometime" / "sometime this week" → least-booked day from today through Saturday. A day
  is skipped if its default slot has already passed.
- "this weekend" / "next weekend" → least-booked of Saturday or Sunday.
- "mark X done" sets done (it doesn't toggle). The checkbox toggles.
- Cancelling "all" occurrences deletes upcoming ones and ends the rule. Past occurrences
  stay as history.

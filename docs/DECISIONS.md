# Decisions (supersede APP_SPEC.md where they conflict)

Recorded from the product owner's answers on 2026-10-01 (plans revised the same day). `APP_SPEC.md` and `prototype.html`
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

## Plans: Free and Pro (revised 2026-10-01, replaces the 7-day trial)

**Free:** no time limit, no card.
- The full local app: insert bar, Day/Week/Month calendar, Tasks, Settings, and on-device
  parsing, with unlimited use.
- **100 AI-assisted parses per month.** These are only used when the rules are unsure and
  the device is online. The allowance resets on the 1st. When it runs out, the rule-based
  result goes through instantly, with at most a subtle "Pro has unlimited" hint. Nothing
  is ever blocked.

**Pro:** $6/month billed monthly, or $4/month billed annually ($48/year).
- Google Calendar and Outlook sync (two-way).
- Unlimited AI-assisted parsing.

Implementation notes:
- `packages/core/src/plans.ts` holds the plan and feature rules, the quota maths and pricing
  constants. The server stores `pro_until` and the monthly AI counter and is the source of
  truth: the AI endpoint checks and increments the counter before calling the model. The
  client runs the same functions only to skip a call it knows would be refused.
- **Billing is deferred** until we ship to the App Store and web. Until then, Pro can be
  granted manually by setting `pro_until` in the database for testers. Likely approach
  later: Stripe on web plus in-app purchase on iOS/Android, unified with RevenueCat
  (Apple requires in-app purchase for subscriptions bought inside the iOS app).
- Users sign in to sync across devices and to count AI usage. Sign-up must stay quick:
  email code or magic link, Sign in with Apple, Google.

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

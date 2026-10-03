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

## AI fallback service (built 2026-10-03)

- `supabase/functions/parse-fallback`: verifies the caller's session (anonymous counts),
  atomically spends one parse from the monthly allowance (`consume_ai_parse`: Free 100 per
  UTC calendar month, Pro unlimited), asks Claude for the Intent JSON under a strict JSON
  schema, and refunds the parse if the model call fails. The prompt and schema live
  server-side, so they can be improved without an app update.
- Model: `claude-opus-5-5` at low effort by default, switchable with the `FALLBACK_MODEL`
  secret. Server-side refusal fallback is on.
- The app waits up to 4s, and only for inputs the rules were unsure about. Offline, a
  slow response, an error, an invalid answer, or "allowance used up" all mean the rule
  result is used. After a "used up" answer the app stops calling until next month.

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

## Accounts: sign in or skip (revised 2026-10-02)

- **First launch shows a welcome screen with two choices:** "Sign in" (email plus a
  6-digit code) or "Continue without an account".
- **Only if they skip** does the app silently create an anonymous Supabase account. Data
  is stored on the device for offline use and syncs to the backend once sync is built.
  If the device is offline at that moment, the app keeps working and creates the
  anonymous account later.
- After skipping, we ask for an email only where its value is obvious (rules in
  `packages/core/src/account.ts`):
  1. ~~The empty-first-launch note~~. Dropped, because the welcome screen already offers
     sign-in.
  2. **Turning on Google/Outlook sync, or upgrading to Pro.** Adding an email is required
     here, because sync and billing need a real identity.
  3. **A passive "Add email" row in Settings.** It's always there and never pushed.
- Claiming = attaching an email to the *existing* anonymous account, so the user ID and
  data stay the same. Sign-in uses an email one-time code. Sign in with Apple and Google
  can be added later; if we offer Google sign-in on iOS, Apple requires Sign in with
  Apple too.
- **Signing an anonymous install into an existing account merges** that install's items
  into the account (`mergeAnonymousInto`, which drops exact duplicates). Server side,
  rows are re-owned to the signed-in user and the empty anonymous user is deleted.

Known limits of this design (accepted tradeoffs, with mitigations):
- **Second device needs the first to be claimed.** A new device gets its own empty
  anonymous account and can't know who you are. "Sign in to bring your schedule here"
  only finds data if an email was added on the first device. If the email isn't found,
  the app explains: "Add your email on your other device (Settings → Add email), then
  sign in here."
- **Unclaimed data is tied to that install.** Deleting the app (or clearing browser data
  on web) before adding an email loses access to that anonymous account. The Settings row
  is the safety net; we deliberately don't nag.
- **Abuse of the free AI allowance.** Reinstalling creates a fresh anonymous account with
  a fresh 100/month. Mitigations: CAPTCHA on anonymous sign-in (Supabase supports
  Turnstile/hCaptcha), per-device and per-IP rate limits on the AI endpoint, and
  periodic cleanup of stale anonymous accounts.

## Sync (built 2026-10-02)

- Offline-first: the device is the source of truth for the UI. Every change is saved
  locally at once, marked "dirty", and pushed when online (debounced, on launch, on
  foreground, every minute). Then the device pulls everything changed since its last sync.
- Conflicts: per record, the newest edit wins (by the time the user made it). The server
  refuses to overwrite a newer row with an older one.
- Deletes sync as tombstones. Recurring occurrences get deterministic IDs
  (`<seriesId>:<date>`), so two devices never create duplicates.
- First sync for an account on a device uploads everything already on that device, so
  nothing typed before signing in (or while offline) is lost.
- Signing out uploads pending changes, then clears that account's data from the device.
- Settings are per-device for now (not synced).

## Screens (revised 2026-10-02)

- **Home** is just the greeting and the insert bar, centered on screen. The "Bar + Tasks"
  and "Bar + Calendar" home options were removed.
- **Tasks** and **Calendar** have the same insert bar at the top, so anything can be added
  from any tab. Replies show under the bar on whichever tab you're on.
- **Fonts are bundled with the app** (Inter + Newsreader in `apps/mobile/assets/fonts`,
  SIL Open Font License). Nothing loads from the internet. Verified with all outside
  network access blocked.

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

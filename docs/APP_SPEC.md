# Scheduling App — Product & Technical Spec

This spec summarizes everything locked down while building and stress-testing an
interactive prototype (`prototype.html`, included alongside this file). The prototype's
job was to validate interaction design, not to be production code — it uses hand-rolled
regex/keyword matching for parsing, which is **not** what should ship. But every rule
below was discovered and refined through real testing, so treat this as the behavioral
spec the real parser must satisfy.

---

## 1. Product Overview

**One-liner:** A radically minimal scheduling app — type anything into a single bar,
and it figures out whether it's a task, a reminder, or a timed calendar event.

**Target persona:** Young professionals who want a decluttered life. They are actively
reacting against bloated calendar/productivity apps (Motion, Reclaim, Akiflow, etc.)
that have accumulated integrations, dashboards, and multi-step workflows. The core
promise is: **we will never add a Kanban board.**

**Differentiation:** Not the fact that it parses natural language (table stakes now) —
the differentiator is deliberate, permanent minimalism. Few screens, no bells and
whistles, nothing to configure beyond what's listed in Settings below.

**Platforms:** Web and iOS first. Android later. (Shared React Native code for mobile
is the recommended path so web and iOS don't require two separate implementations of
the parsing engine and business logic.)

---

## 2. Navigation Structure

Four tabs, bottom nav on mobile:

### Home
- Always shows: greeting + insert bar (the core interaction).
- Below the bar, a Settings-controlled embed shows one of three things:
  - **Just the bar** — nothing else.
  - **Bar + Tasks** — the task list embedded directly.
  - **Bar + Calendar** — today's agenda embedded directly.
- This was an explicit requirement: the user wants to choose what greets them, not
  have it hardcoded.

### Tasks
- Full list of undated items (see Data Model — "Task" kind).
- Tapping the checkbox toggles done/not-done.
- Tapping anywhere else on the row opens the **edit sheet** (see Section 6).

### Calendar
- Day / Week / Month view switcher, plus a **Today** button that jumps back instantly
  regardless of how far the user has navigated (don't make them click back 30 times).
- **Day view** is a proportional time grid, not a fixed list of hour rows — event
  height reflects actual duration, and overlapping events render in side-by-side
  columns (not stacked full-width). See Section 7 for the layout algorithm.
- **Week view** shows each day as a row with compact chips per item; tapping a row
  jumps to Day view for that date.
- **Month view** shows a standard grid with a dot indicator on days that have items;
  tapping a day jumps to Day view for that date.
- Range covers the full 24 hours (0:00–23:59) — don't artificially clip early/late
  hours, that was a real bug (midnight/early-morning events were invisible).

### Settings
- **Home screen shows:** Just the bar / Bar + Tasks / Bar + Calendar (3-way).
- **Appearance:** Light / Dark.
- **Default event length:** 30 min / 60 min — used whenever a duration isn't
  specified or inferable.
- **Color-code events:** On / Off. See Section 5 for what color means.

---

## 3. Data Model

Every item is one of three **kinds**, distinguished purely by its date/time fields —
not by a separate type field the user sets manually:

| Kind | date | start/end | Behavior |
|---|---|---|---|
| **Task** | `null` | `null` | Appears in Tasks tab only. No time, no reminder. |
| **Reminder** | set | `null` | All-day item on the calendar. Has a computed `reminderAt` notification time. |
| **Event** | set | both set | Normal timed calendar block. |

An item can move between these three kinds just by editing its date/time (see Section
6) — this is deliberate. A Task "graduates" into a Reminder or Event once it has a
date; clearing an Event's date demotes it back to a Task.

### Fields
```
id            unique identifier
title         string
date          'YYYY-MM-DD' or null
start         'HH:MM' (24h) or null
end           'HH:MM' (24h) or null
reminderAt    ISO timestamp — only set on Reminders (see Section 5, date-only rule)
done          boolean — Tasks only
color         derived from kind, not title (see below)
recurring     { days: [0-6] } or null
seriesId      shared id linking all occurrences of one recurring series, or null
```

### Color coding — meaningful, not decorative
Color encodes **kind**, not the title:
- **Blue** = timed Event
- **Orange** = all-day Reminder
- **Tan** = Task (not currently rendered with color anywhere visually, since Tasks
  don't appear on the calendar, but the data field is set consistently for future use)

This was a deliberate correction from an earlier version that hashed the title into an
arbitrary color (visually distinct but meaningless, and worked against the app's
minimalism positioning). The color-code Settings toggle switches between this and a
fully neutral single-tone rendering.

---

## 4. Natural Language Parsing — Behavioral Spec

This is the heart of the app and was refined over many rounds of adversarial testing.
**Every rule below must be preserved in the real parser**, however it's implemented
(see Section 9 on why the real implementation can't just be a live LLM call).

### 4.1 Explicit date + time
- `"lunch with sam at noon"`, `"call with mara at 2pm"` → Event at that time.
- `"meeting 3-4pm"` → Event spanning that exact range.
- Duration: if not given and not a range, use the Settings default (30 or 60 min).
- `"...for 30 min"` / `"...for 1 hour"` → explicit duration overrides the default.

### 4.2 Time given, no day named
- Defaults to **today**.
- **Rollover rule:** if the resolved time has already passed today, roll to
  **tomorrow** at the same time instead of creating a past event. This applies
  uniformly whether the time was explicit ("2pm") or ambiguous ("2") — a real bug was
  that explicit am/pm times were skipping this check entirely.
- This rollover only applies when the day was *defaulted* (no day word typed). If the
  user explicitly said "today" and the time has passed, that's their call — don't
  silently move it.

### 4.3 Ambiguous bare hour (no am/pm given)
Resolve in this priority order:
1. **Meal-keyword hint** — if the title contains "dinner"/"night"/"evening" → PM;
   "breakfast"/"morning" → AM; "lunch" → PM-ish (noon-anchored). This hint wins even
   over the "must be future" rule below — but if the hinted time has already passed
   today (and the day was defaulted), it still rolls to tomorrow rather than flipping
   to a nonsensical meridiem (a "9pm breakfast" is never correct).
2. **If no hint and the date is today:** pick whichever of AM/PM is still ahead of the
   current real time; if both are still ahead, pick the sooner one; if both have
   already passed, roll to tomorrow.
3. **If no hint and the date is a future day:** small bare numbers (1–6) default to
   PM, otherwise AM. (Simple heuristic — a real NLU model can likely do better here,
   but this is the floor behavior to match.)

### 4.4 Day given, no time
- Becomes a **Reminder** (all-day, no start/end).
- **Reminder notification time:**
  - Default: **6am** on that date.
  - **Exception:** if the date is *today* and 6am has already passed, notify **90
    minutes after the item is created** instead (computed and shown as an actual
    clock time in the confirmation) — a 6am-in-the-past reminder is useless.

### 4.5 Bare mealtime, no day, no time
- `"dinner with sam"` (nothing else) → still becomes a scheduled **Event**, not a
  Task. Default hours: breakfast 8am, lunch 12pm, dinner 6pm. Apply the same
  today/rollover-to-tomorrow logic as 4.2.
- This was an explicit correction — the literal rule "no date → Task" is still true,
  but a bare mealtime word carries enough implicit time information that defaulting
  straight to Task felt wrong in testing.

### 4.6 No day, no time, no mealtime hint
- → **Task**. This is the only true Task-creation path.

### 4.7 Relative/vague deadlines
- `"sometime next week"`, `"before friday"`, `"before sunday"` → find the
  **least-booked day** (fewest existing scheduled hours) within the correct window,
  and schedule it there as an Event:
  - `"next week"` → search **Monday–Thursday of next week** only (Friday is the
    deadline itself, so the window ends 24h before it). A real bug was searching from
    *today* forward instead of constraining to next week specifically.
  - `"before friday"` → search **today through Thursday of this week**.
  - `"before sunday"` → search **today through Saturday** (24h before Sunday
    midnight).
- Default start time for these: use the same meal-hint logic as 4.3/4.5 if the title
  has one (e.g. don't schedule "dinner" at 9:30am), else 9am.

### 4.8 "N weekdays from now" / "in N weeks"
- `"gym two mondays from now"` → the Monday *after* the next upcoming Monday (i.e.
  "one Monday from now" = the very next Monday; count from there). Accepts both
  digits and spelled-out numbers (one–ten).
- `"dinner with sam in two weeks"` → exactly 14 days from today (a specific date, not
  weekday-anchored).
- If no time is given in either case, the result is a Reminder (see 4.4's rules).

### 4.9 Numeric dates
- `"8/10"` or `"8/10/2027"` → parsed as M/D (or M/D/YYYY). If no year given, use the
  current year, rolling to next year if that date has already passed this year.

### 4.10 Recurring events
- `"gym every monday and wednesday at 6am"` → generates repeating occurrences (the
  prototype generates 8 weeks ahead; the real app should generate indefinitely or
  regenerate on a rolling window).
- All occurrences share a `seriesId`.
- **Cancel:** `"cancel gym"` → if multiple occurrences match, don't treat every single
  occurrence as a separate disambiguation option (a real bug — with 16 generated
  occurrences, the picker only ever showed the first 4, which happened to all be
  Mondays). Collapse a series to **one representative** (the soonest upcoming
  occurrence) and prompt **"this one, or all occurrences?"** — unless the user named a
  specific date ("cancel gym next wednesday"), in which case target that exact
  occurrence directly with no prompt needed.
- **Edit:** tapping one occurrence edits only that occurrence (the series is
  unaffected). The edit sheet should say so explicitly so the user isn't surprised.

### 4.11 Moving/editing via text
Trigger words: `move`, `shift`, `take`, `replace`, `revise`.
- Find matching existing item(s) by fuzzy title-word overlap.
- **Destination parsing, in this priority order:**
  1. **Relative time shift** — `"up"`/`"earlier"` = sooner, `"down"`/`"back"`/
     `"later"`/`"forward"` = later. Accepts digits or spelled-out numbers, plus
     `"half an hour"`. (`"move dinner up one hour"`, `"push call back 30 min"`.)
  2. **New day** — any day phrase from 4.2/4.8/4.9 (weekday name, "tomorrow", numeric
     date, etc.).
  3. **New explicit time, same day** — `"move dinner to 8pm"`.
  4. If none of the above is found, **ask** — `"Move X to when? Try a day, a time, or
     a shift."` Don't silently do nothing.
- **Converting a Reminder to an Event via move:** if a destination time is given for
  an all-day Reminder, it becomes a timed Event (and its color/kind updates
  accordingly).
- **Ambiguous matches:** list candidates with enough detail to tell them apart —
  explicitly show whether each is a timed Event (with its time), an all-day Reminder,
  or part of a repeating series. A real bug was showing bare titles with no way to
  distinguish a scheduled event from an unscheduled reminder.
- **No match found:** offer "Create it instead" — but only actually create immediately
  if the remaining text *does* contain a day or time; if it contains neither, ask for
  one rather than silently falling through to a bare Task.

### 4.12 Canceling via text
Trigger words: `cancel`, `delete`, `remove`.
- Same fuzzy matching as moving.
- Recurring → One/All prompt (see 4.10), unless a specific date was named.
- No match → say so plainly, no further action.

### 4.13 Dismissing a prompt
- If the user types a bare dismissal (`"cancel"`, `"never mind"`, `"nevermind"`,
  `"nvm"`, `"stop"`, `"forget it"`, `"no thanks"`, `"nothing"`, `"no"`) while a
  clarifying prompt is showing, just clear the prompt. Don't generate a new confusing
  message in response to a dismissal.

### 4.14 Conflict detection
- Creating or moving an item into a time slot that overlaps an existing item on the
  same date appends a note to the confirmation: `"Heads up — overlaps with 'X'
  (time)."`
- **Self-conflict bug to avoid:** when checking for overlaps on a newly created item,
  exclude that item's own id from the comparison — comparing a new item against
  itself before it's excluded will always "detect" a conflict with itself.
- Overlap is defined as any time intersection, not just exact matches — e.g. an event
  from 1–4:30pm and another from 1:30–2pm genuinely overlap and must render that way
  visually (see Section 7).

### 4.15 Editing edge cases
- If a user edits only the start time and leaves the end time such that end ≤ start,
  **preserve the original duration** (shift the whole block) rather than producing an
  invalid range like "9am–8:30am".

---

## 5. Reminders/Notifications Summary

| Scenario | Notification time |
|---|---|
| Date-only item, created before 6am that day (or for a future date) | 6am on that date |
| Date-only item, created *after* 6am on the *same day* | 90 minutes after creation |
| Timed Event | (not specified in prototype — real app should decide a default, e.g. 10–15 min before) |

---

## 6. Editing — The Unified Edit Sheet

Tapping **any** item — Task, Reminder, or Event — opens the same bottom sheet:
- **Title** (text)
- **Date** (date picker, optional)
- **Start / End** (time pickers, optional)
- **Delete** button
- If part of a recurring series, a note explaining the edit only affects this
  occurrence.

**Save logic (this is the important part — it's what makes kind-switching work):**
- No date entered → item **becomes/stays a Task** (date, start, end all cleared).
- Date entered, no time → item **becomes/stays a Reminder** (start/end cleared,
  `reminderAt` computed).
- Date entered, both start and end entered → item **becomes/stays an Event**.
- Color/kind fields update automatically to match the new state — don't leave stale
  color data after a kind change.
- Apply the same end≤start duration-preservation guard as 4.15.
- Re-run conflict detection against the *new* date/time after saving, same exclusion
  rule as 4.14.

Tapping the checkbox on a Task toggles done/not-done and does **not** open the edit
sheet — these are separate tap targets on the same row.

---

## 7. Day View Layout Algorithm

The Day view is a proportional time grid, not a list:
- Grid spans 24 hours (0:00–23:59), fixed pixel-height per hour.
- Each timed item's vertical position = `(start_minutes / 60) * hour_height`.
- Each item's height = `(duration_minutes / 60) * hour_height` (with a minimum height
  for readability on very short events).
- **Overlap layout** (standard calendar algorithm):
  1. Sort items by start time.
  2. Sweep through and group into **clusters** of mutually overlapping items (an item
     starts a new cluster if its start time is at or after the running max end-time of
     the current cluster).
  3. Within each cluster, greedily assign each item to the first available **column**
     (a column is "available" once its last-placed item's end time is at or before
     the new item's start time); if none are available, open a new column.
  4. Each item's width = `100% / total_columns_in_cluster`; its horizontal offset =
     `column_index * width`.
- This is what makes two overlapping events (e.g. a 1–4:30pm block and a 1:30–2pm
  block inside it) render as visually distinct side-by-side columns instead of
  stacking full-width in sequence, which was indistinguishable from two
  non-overlapping back-to-back events and undermined trust in the conflict-detection
  feature.

Week and Month views intentionally stay simpler (compact chips / dot indicators) —
they're for orientation, not precision; Day view is where the detail lives.

---

## 8. Explicitly Deferred (Not Solved in the Prototype)

Flag these clearly so the real build doesn't assume the prototype already covers them:

1. **True multi-turn conversation.** Right now, when the app asks a follow-up
   question ("what time should this move to?"), the user's next message is always
   parsed as a brand-new top-level command — it doesn't know it's answering a pending
   question. The real app needs actual conversational state for this.
2. **Calendar sync** (Google Calendar / Outlook, two-way, OAuth). Not touched at all
   in the prototype. Should be built as its own milestone after the core loop and
   parsing engine are solid, per the user's original plan.
3. **Persistence.** The prototype is pure client-side in-memory state — everything
   resets on reload. The real app needs a real backend/database.
4. **Full language coverage.** The parsing rules above were validated against
   dozens of adversarial test phrases, but the prototype's actual implementation is
   regex/keyword matching, which is brittle outside the patterns it was built for. See
   Section 9 for how the real implementation should handle this *without* depending on
   a live third-party API at runtime.

---

## 9. CRITICAL Architecture Requirement — No Runtime AI Dependency in the Shipped App

**This is a hard constraint, not a preference, and it changes the intended
architecture from earlier planning discussions:**

> The shipped, App-Store-distributed app must be able to **run completely on its
> own**. It must **not** depend on live calls to Anthropic's Claude API, or any other
> third-party LLM API, at runtime once it's in users' hands.

What this means concretely:
- **Do not** architect the parsing engine as "send the user's text to a cloud LLM API
  and use the response" as the production design. That creates an ongoing per-request
  cost, a latency dependency, and a single point of failure/control outside the
  developer's hands — all things the developer explicitly wants to avoid for the
  shipped product.
- **What's fine:** using Claude, Claude Code, or any AI tool *during development* to
  design, generate test cases for, and refine the parsing engine itself. The
  constraint is about the **runtime behavior of the shipped app**, not the tools used
  to build it.
- **Recommended approach:** treat Section 4 above as the complete functional spec, and
  build a genuinely robust, self-contained parsing module — meaningfully more capable
  than the prototype's regex rules, but still deterministic code that runs entirely
  within the app/its own backend, with zero outbound calls to a third-party AI API at
  request time. If rule-based parsing proves insufficient for the breadth of phrasing
  real users throw at it, the next step up is a **small model trained or distilled
  ahead of time** and bundled with the app or run on infrastructure the developer
  fully controls (e.g. an on-device model via CoreML, or a self-hosted open-weight
  model) — not a live call to Anthropic's or any other vendor's hosted API.
- Claude Code should treat this as a first-class constraint when proposing the
  parsing engine's implementation, not an afterthought to handle later.

---

## 10. Recommended Tech Stack

- **Web:** Next.js, deployed on Vercel (generous free tier at low usage).
- **Mobile:** React Native sharing code with the web app where practical, to avoid
  maintaining two separate parsing/business-logic implementations.
- **Backend/data:** Supabase (Postgres + auth + hosting) — or equivalent; avoids
  standing up custom infrastructure early.
- **Parsing engine:** self-contained module per Section 9 — not a live LLM API call.
- **Calendar sync:** Google Calendar API + Microsoft Graph API (Outlook), added after
  the core loop is solid — this is the single most time-consuming integration.

---

## 11. Reference Artifact

`prototype.html` (included alongside this spec) is the actual interactive prototype
referenced throughout this document. It's a single self-contained HTML file — open it
directly in a browser. It demonstrates every rule in Section 4 and the full UI
described in Sections 2, 6, and 7. Treat its behavior as the ground truth whenever
this written spec is ambiguous — the prototype was iterated against real adversarial
testing, and the spec was written from its final state.

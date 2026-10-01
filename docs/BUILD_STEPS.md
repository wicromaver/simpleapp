# Build Plan — Steps to Give Claude Code

Give Claude Code both `APP_SPEC.md` and `prototype.html` at the very start (drop them
in the project root, or point Claude Code at them). Work through these steps roughly
in order — each one is close to a literal prompt you can give. Don't skip Step 0.

---

### Step 0 — Orientation (don't let it start coding yet)

> "Read APP_SPEC.md and prototype.html fully before doing anything else. Open
> prototype.html's source and APP_SPEC.md and summarize back to me: the three item
> kinds and how they convert into each other, the full parsing rule set in Section 4,
> and the Section 9 constraint about no runtime AI API dependency in the shipped app.
> Don't write any code yet — just confirm you understand the spec."

This matters because Section 9 is a real pivot away from the "just call an LLM API"
default a coding agent might otherwise reach for. Make sure it's confirmed understood
before any architecture gets decided.

---

### Step 1 — Lock the stack

> "Based on Section 10 of APP_SPEC.md, scaffold a new project: Next.js for web,
> Supabase for auth and data, and a plan for sharing code with a React Native iOS app
> later. Don't build any features yet — just the project skeleton, folder structure,
> and a basic deploy pipeline. Explain any deviations from the suggested stack before
> making them."

---

### Step 2 — Build the parsing engine first, in isolation

> "Build the natural-language parsing engine as a standalone, pure module with no UI
> dependency — it should take a raw string and today's date/time as input, and return
> a structured result (kind, title, date, start, end, or a clarification needed).
> Implement every rule in APP_SPEC.md Section 4. Write unit tests for each rule,
> including the specific edge cases called out there (the am/pm rollover bug, the
> 'next week' window bug, the recurring-series disambiguation bug, the self-conflict
> bug, etc. — these were real bugs found in testing, use them as regression tests).
> Remember: per Section 9, this must be self-contained code with no live calls to a
> third-party AI API."

This is the highest-leverage step — get it solid and tested before any UI exists.

---

### Step 3 — Data layer

> "Set up the database schema per APP_SPEC.md Section 3 (the three-kind item model),
> and basic CRUD operations against it. No UI yet."

---

### Step 4 — UI shell

> "Build the four-tab navigation (Home, Tasks, Calendar, Settings) and get the static
> layout matching prototype.html's structure and styling — the insert bar, the
> Settings options, the tab bar. Wire up the Settings controls (home screen mode,
> theme, default duration, color-coding) to real state, but don't wire the insert bar
> to the parsing engine yet."

---

### Step 5 — Calendar rendering

> "Implement the Day/Week/Month calendar views per APP_SPEC.md Section 7, including
> the proportional time-grid layout and the overlap-clustering column algorithm for
> Day view. Use the seeded/mock data for now to verify the layout handles overlapping
> events correctly before wiring real data."

---

### Step 6 — Wire it together

> "Connect the insert bar to the parsing engine from Step 2 and the data layer from
> Step 3. Implement the confirmation message pattern (text below the bar + jump link)
> and the clarification/disambiguation prompts described in Section 4 (move
> disambiguation, cancel One/All, dismissal words, etc.)."

---

### Step 7 — The unified edit sheet

> "Build the edit sheet from APP_SPEC.md Section 6 — same sheet for Tasks, Reminders,
> and Events, with the kind-switching save logic (no date → Task, date only →
> Reminder, date + time → Event) and the duration-preservation guard for invalid
> start/end edits."

---

### Step 8 — Auth and persistence

> "Add real user accounts and make sure data survives reload and syncs across
> devices/sessions."

---

### Step 9 — Calendar sync (its own milestone)

> "Now add Google Calendar and Outlook (Microsoft Graph) sync — OAuth flow, two-way
> sync of events. This is explicitly the most time-consuming integration per the
> spec, so budget accordingly and don't rush it alongside other work."

---

### Step 10 — iOS

> "Port the shared logic to a React Native iOS app, reusing the parsing engine and
> business logic from the web build rather than reimplementing it."

---

### Step 11 — Test against the real adversarial list

> "Here's the list of every phrase that broke the prototype during testing and what
> the correct behavior should have been: [paste your running list — see note below].
> Run all of these against the real app and fix anything that regressed."

*Note: if you kept the "list of every phrase that failed and what you expected"
habit suggested earlier, this is where it pays off — hand it directly to Claude Code
as a regression test list.*

---

### Step 12 — Pre-launch checklist

> "Before we ship: confirm there are zero runtime calls to any third-party AI API
> anywhere in the production build — grep the codebase for any Anthropic/OpenAI/etc.
> API usage outside of dev tooling, and confirm the app functions with no internet
> connection to any AI vendor at all. This is a hard requirement, not a nice-to-have."

---

## General tips while working through this with Claude Code

- Keep steps small and let it finish + show you working code before moving to the
  next one — don't dump the whole spec and ask for the whole app at once.
- When something breaks, describe it the same way you did in this conversation
  (exact phrase typed, exact expected behavior, exact actual behavior) — that level of
  specificity is what made debugging the prototype fast.
- Re-paste the relevant APP_SPEC.md section when Claude Code seems to drift from it —
  agentic coding sessions can lose track of constraints stated many turns ago,
  especially the Section 9 no-API-dependency rule, since it cuts against a coding
  agent's natural instinct to reach for "just call the API."

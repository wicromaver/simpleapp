# Supabase setup (one time)

1. **Create the tables.** Dashboard → SQL Editor → New query → paste the contents of
   [`migrations/20261002000000_init.sql`](migrations/20261002000000_init.sql) → Run.
   It's safe to run again.
2. **Turn on sign-in methods.** Authentication → Sign In / Providers:
   - **Email**: enabled (the default).
   - **Allow anonymous sign-ins**: on. This powers "Continue without an account".
3. **Send codes, not links.** Authentication → Emails → Templates. In **Confirm signup**,
   **Magic Link** and **Change Email Address**, include the 6-digit code, e.g.
   `Your code is {{ .Token }}`. The app asks for the code. It doesn't use links.
4. **Before real users:** Supabase's built-in email sender is limited to a few emails an
   hour, which is fine for testing. For launch, add your own SMTP (Authentication → Emails
   → SMTP Settings; Resend or Postmark both work) and turn on CAPTCHA for sign-ins.

Never put the **secret / service-role key** in the app or this repo. Only the
publishable key belongs in the client.

## What's in the database

- `items`, `series`: each user's records. Each row holds the app record as JSON, plus
  `updated_at` (when the user changed it; newest wins) and `deleted` (tombstone). The
  server sets `synced_at`, and devices pull "everything since my last `synced_at`".
- `entitlements`: plan and monthly AI-usage counter. Users can read their own row; only
  server code can change it. Every new user gets a Free row automatically.
- Row Level Security on all tables: a user can only touch rows with their own `user_id`.

Give a tester Pro for 30 days:

```sql
update public.entitlements set pro_until = now() + interval '30 days'
where user_id = (select id from auth.users where email = 'tester@example.com');
```

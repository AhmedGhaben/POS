# Sign-up & Onboarding — plan

Item #1 of `LAUNCH_READINESS.md`. Goal: a business owner who has never
heard of us can create an account, verify their email, and reach a usable
POS without anyone touching the database.

## Current state (2026-10-08)

- Businesses only exist via `apps/api/prisma/seed.ts`; nothing in the API
  calls `business.create`.
- `AuthService.login` already returns `{ accessToken, user, stores }` and sets
  the refresh cookie — registration can reuse that exactly.
- `POST /auth/forgot-password` + `/auth/reset-password` exist in the API but
  **the web app has no page for them**. Self-serve owners need one.
- Email lookups are case-sensitive (`findUnique({ where: { email } })`), so
  `Owner@x.com` and `owner@x.com` would be separate accounts.
- There is no store update endpoint, so the sign-up form collects store
  details up front rather than in a later wizard step.
- Reset emails send a raw code, not a link — there's no `APP_URL` config yet.

## Backend (`apps/api`)

1. **Schema migration**
   - `User.emailVerifiedAt DateTime?` (null = unverified). Backfill existing
     users (seed accounts, e2e users) as verified in the migration.
   - New `EmailVerificationToken` model, same shape as `PasswordResetToken`
     (`tokenHash` unique, `expiresAt`, `usedAt`). 24h TTL.
2. **`POST /auth/register`** (`@Public`, throttled 5/min like login)
   - DTO: `businessName`, `storeName`, `firstName`, `lastName`, `email`,
     `password` (min 8, same as reset), optional `timezone` (IANA, defaults
     to `UTC`; the web app sends the browser's zone).
   - One `$transaction`: create `Business` (plan `SIMPLE`) → `Store` →
     OWNER `User` (bcrypt cost 12, same as reset). Owners see all stores, so
     no `StoreUser` row is needed (matches `login`).
   - `409 Conflict` if the email is taken (same message as `UsersService`).
   - Sends the verification email best-effort *after* the transaction
     commits (same pattern as receipt emails — a mail failure must not fail
     sign-up), then returns the same body + refresh cookie as `login`.
3. **Email verification**
   - `POST /auth/verify-email` `{ token }` → sets `emailVerifiedAt`, marks
     token used. 400 on invalid/expired/used.
   - `POST /auth/resend-verification` (authenticated, throttled) → new token
     + email; no-op if already verified.
   - Email contains a link `${APP_URL}/verify-email?token=...`. New env var
     `APP_URL` (default `http://localhost:5173`), added to `.env.example`
     and `docker-compose.prod.yml`. Switch the password-reset email to a
     link the same way.
   - **Not enforced** at login: unverified owners can use the app; the UI
     shows a banner. (Enforcing can be added later, e.g. block billing until
     verified.) `emailVerified: boolean` is added to the login/register
     `user` payload.
4. **Normalize emails** — trim + lowercase in register, login,
   forgot-password, and `UsersService` create, via a shared helper /
   class-transformer `@Transform`. Seed emails are already lowercase.

## Frontend (`apps/web`)

1. **`/signup` page** — same Card layout as `/login`, react-hook-form + zod
   (the Phase 8 pattern). Fields: your name, business name, store name,
   email, password. Timezone from `Intl.DateTimeFormat().resolvedOptions()`.
   On success: `setSession(...)` then go to `/welcome`.
2. **Links** — "Create an account" on `/login`; "Already have an account?"
   on `/signup`; "Forgot password?" on `/login`.
3. **`/forgot-password` and `/reset-password?token=`** pages wired to the
   existing API endpoints.
4. **`/verify-email?token=`** page — calls the API, shows success/failure,
   links to the dashboard. Works whether or not the user is logged in.
5. **Unverified banner** in the back-office shell: "Verify your email —
   resend link", dismissible per session.
6. **`/welcome` first-run screen** (owner only, shown once after sign-up):
   three cards — *Add your first product* (→ `/products`, opens the create
   form), *Add a cashier* (→ `/employees`), *Open the POS* (→ `/pos`) — plus
   "Skip to dashboard". No new backend endpoints; reuses existing pages.

## Tests

- Unit (`auth.service.spec.ts`): register creates all three records in one
  transaction; duplicate email → 409; email normalization; verify-email
  happy path + expired + reused token.
- E2E (`test/signup.e2e-spec.ts`): register → can call `/stores` and
  `/businesses/me` with the returned token → sees only its own business
  (tenant isolation against the seed business) → verify-email flips
  `emailVerified`. **Clean up the created business/user at the end**, so
  this suite doesn't add to the dev-DB clutter noted in `LAUNCH_READINESS.md`.
- Manual run-through in the browser: sign up a fresh business, pick up the
  verification link from the API console log (stub mail), verify, add a
  product, ring up a sale.

## Out of scope (later items)

- Currency and business settings → item #3.
- Plans/billing, trial periods → item #2.
- Google/OAuth sign-in, CAPTCHA (rate limiting covers abuse for now —
  revisit at launch if fake sign-ups appear).
- Deleting a business/account → "should-have" list.

## Done when

A brand-new owner can go `/signup` → `/welcome` → add a product → sell it at
`/pos`, verify their email from the link, and reset a forgotten password —
all from the browser, with unit + e2e tests passing in CI.

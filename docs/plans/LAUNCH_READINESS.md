# Launch Readiness — what's left before promoting to business owners

Written 2026-09-27, after all 11 roadmap phases (see `ROADMAP.md`) plus
`/health` + rate limiting shipped. The core product works end to end; this
file tracks what's missing to sell it to real businesses.

**Biggest blocker:** a new business owner has no way to sign up. The only
business that exists is the demo one created by `apps/api/prisma/seed.ts`
(upsert of `seed-business`). There is no registration endpoint or page, and
nothing in `apps/api/src` ever calls `business.create`.

## Must-have before selling

- [ ] **1. Sign-up & onboarding**
  - Registration endpoint + page: create `Business` + OWNER `User` + first
    `Store` in one transaction. Rate-limit it like the other auth endpoints.
  - Email verification (none exists today; Resend `MailService` from Phase 9
    can send it).
  - First-run setup wizard: store name, currency, tax defaults, add/import
    products — so a new owner doesn't land on an empty dashboard.
- [ ] **2. Billing / subscriptions**
  - Already in place but unused: `Business.plan` (`SIMPLE` default / `PRO`)
    in `schema.prisma`, `PlanGuard` (`apps/api/src/common/guards/plan.guard.ts`)
    and `@RequiresPlan()` (`common/decorators/requires-plan.decorator.ts`).
    No route uses them yet.
  - AI insights (`POST /insights/store/:storeId`) was intended as Pro-only
    but is currently ungated — apply `@RequiresPlan(Plan.PRO)`.
  - Needs: Stripe (or similar) subscriptions, free trial, upgrade/downgrade,
    webhook to update `Business.plan`, handling of failed payments.
- [ ] **3. Business settings page** (none exists)
  - Currency is hard-coded to `$` in `apps/web/src/lib/format.ts`
    (`formatCurrency`). Needs a business-level currency setting.
  - Business name/logo, timezone (`Store.timezone` exists), tax defaults
    (`Product.taxRate` is per-product only), receipt header/footer text.
- [ ] **4. Production deploy** (previously deferred — pick a platform to unblock)
  - Hosting + domain + HTTPS. Dockerfiles (`apps/api/Dockerfile`,
    `apps/web/Dockerfile`) and `docker-compose.prod.yml` are the building blocks.
  - Real secrets — `docker-compose.prod.yml` has placeholder JWT secrets and
    CORS origin.
  - Managed Postgres with **automated backups** (no backup setup exists).
  - Verified sending domain in Resend (`MAIL_FROM` currently uses
    `onboarding@resend.dev`).
  - `ANTHROPIC_API_KEY` in production if AI insights is offered.
- [ ] **5. Structured logging + Sentry** (previously deferred "until real
  traffic" — paying customers are that trigger; ship at launch).
- [ ] **6. Legal**: Terms of Service, Privacy Policy, data-deletion/export
  process (customer names/emails are stored).

## Should-have

- [ ] Account deletion + full data export for a business that cancels.
- [ ] Separate test database — e2e runs leave "Branch <timestamp>" stores
  (12 of 14 stores in dev DB) and "e2e test transfer" rows in the dev DB.
- [ ] Void a sale — `VOIDED` sale status is a dead enum value (see Phase 6
  notes in `ROADMAP.md`); build it, then gate it with a permission.
- [ ] Hardware testing — receipts print via `window.print()`
  (`apps/web/src/routes/pos.tsx`, layout in `features/pos/components/Receipt.tsx`).
  Test on a real 80mm thermal printer and a USB barcode scanner.

## Promotion (non-code)

- [ ] Landing page with pricing
- [ ] Demo account or walkthrough video
- [ ] Support channel (email/chat)

## Suggested order

1. Sign-up & onboarding
2. Settings (currency first)
3. Deploy with backups
4. Billing
5. Logging + Sentry
6. Legal pages
7. Landing page

A free beta with a few friendly shops is possible after steps 1–3, before
billing exists.

## Local dev notes

- Docker Desktop must be running first (`docker compose up -d` for Postgres).
- Windows sometimes reserves port 3000 (WinNAT excluded range, `EACCES`).
  Workaround: `PORT=4000 npm run dev:api` and `API_PORT=4000 npm run dev:web`
  — `apps/web/vite.config.ts` proxy reads `API_PORT` (default 3000). Keep the
  web app on 5173 since `CORS_ORIGIN` expects it.
- Seed logins: `owner@demo-store.test` / `OwnerPass123!`,
  `cashier@demo-store.test` / `CashierPass123!`.

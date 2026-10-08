# POS

Cloud-based point-of-sale system for small shops and multi-store businesses.
React + TypeScript + Tailwind + shadcn/ui frontend, NestJS + PostgreSQL +
Prisma backend.

## Features

- **Self-serve sign-up**: creates the business, its first store and the
  owner in one step. Then email verification, password reset, and a
  first-run `/welcome` screen.
- **POS**: product grid and search, barcode scanning, split payments,
  customers, emailed receipts. Works **offline** and syncs sales when back
  online (PWA).
- **Documents**:
  - 80 mm receipts with logo and business details
  - **quotes** (slip or A4) printed without checking out
  - numbered **A4 invoices** (`INV-<year>-0001`, gap-free, restarting
    yearly) with a frozen seller snapshot, plus an Invoices page for
    reprinting
- **Products & stock**: categories, per-store inventory, purchases,
  returns, transfers between stores, low-stock alerts, and **CSV
  import/export** with a validating preview.
- **Staff**:
  - employees with optional logins (cashier or manager), limited to
    chosen stores
  - password set by the owner, or an emailed invite
  - deactivation takes effect immediately
  - per-user permission overrides
- **Settings** (owner): legal details, tax/VAT ID, currency (shown
  everywhere), default tax rate, receipt and invoice text, logo, and store
  details.
- **Reports**: dashboard with KPIs, trends, top products, store
  comparison, CSV/PDF export, and optional AI insights (Anthropic API).
- Audit log, rate-limited auth, `/health` endpoint.

## Structure

- `apps/api`: NestJS backend
- `apps/web`: React (Vite) frontend
- `packages/shared`: shared TypeScript types/enums
- `docs/plans/`: design docs per phase/feature, and `LAUNCH_READINESS.md`
  (what's left before selling)

## Development

```bash
docker compose up -d                  # start local Postgres (Docker Desktop must be running)
npm install
cp apps/api/.env.example apps/api/.env
npm run prisma:migrate --workspace apps/api
npm run prisma:seed --workspace apps/api
npm run dev:api                       # backend on :3000
npm run dev:web                       # frontend on :5173
```

**Windows:** port 3000 is sometimes reserved by the OS (`EACCES`). Run the
API on another port and point the web dev proxy at it:

```bash
PORT=4000 npm run dev:api
API_PORT=4000 npm run dev:web
```

**Demo logins (from the seed):**

- `owner@demo-store.test` / `OwnerPass123!`
- `cashier@demo-store.test` / `CashierPass123!`

Or create your own business at http://localhost:5173/signup.

**Emails** (verification, password reset, staff invites, receipts) go
through [Resend](https://resend.com) when `RESEND_API_KEY` is set. Without
it they're printed to the API console, links included.

### Environment (`apps/api/.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets: **change for any real deployment** |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Token lifetimes (default `30m`, `30d`) |
| `PORT` | API port (default 3000) |
| `CORS_ORIGIN` | Web app origin allowed to call the API |
| `APP_URL` | Public URL of the web app, used for links in emails |
| `RESEND_API_KEY`, `MAIL_FROM` | Optional: send real email |
| `ANTHROPIC_API_KEY` | Optional: enables AI insights |

## Tests

```bash
npm run test --workspace apps/api       # API unit tests
npm run test:e2e --workspace apps/api   # API e2e: needs the migrated + seeded dev database
npm run test --workspace apps/web       # web unit tests (Vitest)
npm run lint
```

The e2e suites create their own businesses and delete them afterwards. Some
older suites still leave rows in the seed business; a separate test
database is on the launch checklist. CI (`.github/workflows/ci.yml`) runs
lint, build and all of the above against a fresh Postgres.

## Docker

`apps/api/Dockerfile` and `apps/web/Dockerfile` are multi-stage builds for
this npm-workspaces monorepo. Build them from the **repo root**, so the
workspace `package-lock.json` and `packages/shared` are in context:

```bash
docker build -f apps/api/Dockerfile -t pos-api .
docker build -f apps/web/Dockerfile -t pos-web .
```

To run the full stack locally (Postgres + API + web, wired together):

```bash
docker compose -f docker-compose.prod.yml up --build
```

The web container serves the built frontend via nginx on `:8080` and
reverse-proxies `/api/*` to the `api` service. Visit http://localhost:8080.

`docker-compose.prod.yml` sets placeholder JWT secrets, CORS origin and
`APP_URL` for local smoke testing only. Override them (env vars or a real
secrets manager) before deploying anywhere real.

Cloud deploy config isn't included yet. Hosting, backups and a verified
email domain are item #4 in `docs/plans/LAUNCH_READINESS.md`.

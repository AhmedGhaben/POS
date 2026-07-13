# POS Roadmap

## Vision

Build a production-ready, cloud-based POS system that is faster, simpler,
and more visually refined than existing solutions. Modern, minimal UI
inspired by Apple, Stripe, Shopify, and Linear, with a strong focus on
speed, usability, and scalability. Secure authentication, role-based access
(Owner, Manager, Cashier), single-store and multi-store support, a
lightning-fast POS interface with barcode scanning, inventory management,
products, customers, suppliers, employees, sales, returns, purchases,
expenses, reports, receipt printing, and offline capability. A powerful
owner dashboard with real-time analytics, interactive charts, AI-powered
business insights, profit tracking, inventory monitoring, and store
performance comparisons. React + TypeScript + Tailwind CSS + shadcn/ui
frontend; NestJS + PostgreSQL + Prisma backend. Clean architecture, modular
design, responsive layouts, dark/light mode, production-ready coding
standards. Every workflow should minimize clicks, load instantly, and
deliver a premium experience for businesses of any size.

## Shipped so far

- **Phase 1 — Foundation** (`152e257`): auth (JWT access+refresh), multi-store,
  products, inventory, POS sales.
- **Phase 2 — Back-office modules** (`b199a51`): suppliers, employees,
  purchases, expenses, returns.
- **Phase 3 — Dashboard analytics** (`0aa6aa6`): store-scoped revenue/profit/
  order KPIs with period-over-period deltas, revenue trend and top-products
  charts, low-stock panel, owner-only cross-store comparison.
- **Phase 4 — Finish the checkout experience** (`e621cc9`): cash tendered/
  change-due calculation, split tender across multiple payment methods,
  customer search/create-and-attach at checkout, receipt payment breakdown.
- **Phase 5 — Security & production hardening** (partial): DB-backed
  refresh-token rotation with reuse/theft detection (revokes all sessions
  if a rotated-away token is replayed), password reset flow (console-log
  mail stub — Phase 9 swaps in a real provider), a global audit-log
  interceptor recording who-did-what for every mutating request, baseline
  unit tests (auth/sales/guards) + GitHub Actions CI, and multi-stage
  Dockerfiles for `apps/api`/`apps/web` with a verified `docker-compose.prod.yml`
  stack. Fine-grained permissions were carved out into their own phase —
  see Phase 6.
- **Phase 6 — Fine-grained permissions**: a `Permission` enum
  (`VIEW_COST_PRICE`, `PROCESS_RETURN`) with per-role defaults plus a
  `UserPermission` override table for per-user exceptions in either
  direction, enforced via a global `PermissionsGuard`/`@RequiresPermission()`
  (mirrors the existing `RolesGuard` pattern). Applied to the two real gaps
  a codebase audit found: cost price was visible to every role via the raw
  API (now redacted unless permitted — the Products admin page was already
  Owner/Manager-only in the UI, so this closes the API-level hole), and
  returns/refunds had no approval gate (Cashier is now default-denied,
  overridable per-user). Owner-only management UI lives on the Employees
  page (`Manage` button per employee with a login account). "Void a sale"
  — one of the two motivating examples for this phase — doesn't exist as a
  feature (the `VOIDED` status is a dead enum value) and was deliberately
  left out rather than building new business logic inside a permissions
  phase; build it as its own feature first if it's still wanted, then gate
  it the same way.
- **Phase 7 — Multi-store operations**: a `StockTransfer`/`StockTransferLineItem`
  model moves stock between two stores atomically (decrement source,
  increment-or-create destination, both inside one `$transaction`), with a
  movement-history view per store. A new `TransferStoreAccessGuard` checks
  access to *both* `fromStoreId` and `toStoreId`, since the existing
  `StoreAccessGuard` only understands a single `storeId` field. OWNER/MANAGER
  only (same as purchases). Frontend: new `/transfers` page with from/to
  store pickers + line items, reachable from the sidebar.

## Phase order

1. **Phase 8 — UI/UX refinement & responsiveness**: expand the shadcn
   component set (table, dropdown-menu, tabs, toast, sheet, form — command/
   popover already added in Phase 4), real mobile/tablet layouts, command
   palette + keyboard shortcuts to minimize clicks per the original vision.
2. **Phase 9 — Notifications & data export**: low-stock email alerts,
   emailed receipts, CSV/PDF export for reports and product/inventory lists.
   Also where the Phase 5 console-log mail stub gets replaced with a real
   provider (e.g. Resend/SES).
3. **Phase 10 — Offline-first POS**: service worker + IndexedDB sale queue +
   sync-on-reconnect, so checkout keeps working through a connectivity drop.
   Sequenced late since it's the most architecturally invasive remaining
   phase and benefits from the hardening already in place (Phase 5).
4. **Phase 11 — AI-powered business insights**: natural-language summaries
   of the Phase 3 reports data, anomaly detection (e.g. unusual revenue
   dip), restocking suggestions. Built last — depends on solid reports data
   (Phase 3, done) and a stable, tested backend (Phase 5) underneath it.

Remaining gaps not yet assigned to a phase: rate limiting, structured
logging, error tracking (Sentry), a `/health` endpoint, and cloud-specific
deploy config (Fly.io/Render/ECS/etc. — the Dockerfiles from Phase 5 are the
portable building block, but no platform has been chosen yet). Fold these
into whichever phase is active when they become relevant, or give them
their own phase if they pile up.

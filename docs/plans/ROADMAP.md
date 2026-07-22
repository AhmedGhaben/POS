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
- **Phase 8 — UI/UX refinement & responsiveness** (`39f5c18`): expanded the
  shadcn/ui component set (table, dropdown-menu, tabs, sheet, form, sonner
  toasts) and rebuilt products/purchases/returns/transfers/suppliers/
  expenses/employees/inventory around them with react-hook-form + zod
  validation and toast feedback on mutations. Added a Cmd/Ctrl+K command
  palette for cross-page navigation and a real mobile layout: the sidebar
  collapses below the `lg` breakpoint and reappears as a `Sheet` drawer
  behind a hamburger trigger, with an account dropdown menu replacing the
  old inline controls. Keyboard shortcuts beyond ⌘K (e.g. per-page "new
  record" or search-focus bindings) were considered but left out — fold
  into a later phase if still wanted.
- **Phase 9 — Notifications & data export** (`961209d`): the Phase 5
  console-log mail stub is now a real `MailService` that sends through
  Resend when `RESEND_API_KEY` is set, falling back to the console log so
  dev/CI need no account. A daily `@nestjs/schedule` cron emails low-stock
  digests to every OWNER in the business plus MANAGERs assigned to the
  affected store (mirrors `StoreAccessGuard`'s access rule). Checkout gained
  an optional receipt-email field that defaults to the attached customer's
  email, sent best-effort after the sale commits so a mail failure can't
  fail the sale. CSV export (products, inventory, sales trend) and a PDF
  report export (KPIs + top products) were added client-side from data
  already on screen, rather than new backend endpoints.
- **Phase 10 — Offline-first POS** (`c61298b`): a service worker
  (vite-plugin-pwa/Workbox) precaches the app shell and runtime-caches the
  product/category catalog, so the POS terminal keeps rendering and
  searchable through a connectivity drop. Checkout itself doesn't depend on
  that cache: `createSale()` checks `navigator.onLine` and falls back to
  the same path on a real fetch failure, queuing the sale in IndexedDB (via
  `idb`) and building a full receipt client-side (mirroring
  `SalesService`'s math) so the cashier gets an `OFFLINE-`prefixed receipt
  with no server round-trip. The browser's `online` event drains the queue
  in order, replacing each entry with a real sale; a rejected sale (e.g.
  stock ran out by the time it synced) is marked failed and left for review
  rather than retried forever. A topbar indicator shows offline/pending
  state with a manual "sync now" fallback. Discovered while testing:
  React Query's default `networkMode: 'online'` pauses queries/mutations
  itself whenever `navigator.onLine` is false, which would leave checkout
  stuck at "Processing..." forever before any of the above code ever ran —
  fixed by setting `networkMode: 'always'` globally in `query-client.ts`.
- **Phase 11 — AI-powered business insights** (`a2e2062`): an on-demand
  "Generate insights" panel on the dashboard turns the existing Phase 3
  reports data (summary, revenue trend, top products, low stock) into a
  plain-English briefing — summary paragraph, notable patterns/anomalies,
  restocking suggestions — via a single Claude API call (`claude-opus-4-8`,
  structured output through `messages.parse` + a Zod schema). No new data
  queries needed; Phase 3 already computes everything the prompt uses.
  POST rather than GET (unlike the plain-query `ReportsController`
  endpoints) since every call costs money, and the frontend only triggers
  it on an explicit button click, never automatically. `ANTHROPIC_API_KEY`
  is optional — unset, the endpoint returns a clear 503 rather than a stub,
  since there's no honest way to fake generated analysis the way the
  Phase 9 mail stub could fake an email log.

All phases from the original roadmap are now shipped.

Remaining gaps not yet assigned to a phase: rate limiting, structured
logging, error tracking (Sentry), a `/health` endpoint, and cloud-specific
deploy config (Fly.io/Render/ECS/etc. — the Dockerfiles from Phase 5 are the
portable building block, but no platform has been chosen yet). These would
form the next phase if the project continues.

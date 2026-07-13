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

A codebase audit (2026-07-13) confirmed the current gaps against the vision
above, which is what the phases below address:

- Checkout has no cash tendered/change-due calculation, no split tender, and
  never attaches a customer to a sale (backend supports it, frontend doesn't
  use it). Receipt is browser-print only.
- Zero offline capability (no service worker, no IndexedDB queue).
- Auth has no password reset, no email verification, no 2FA, no refresh-token
  revocation, no audit logging, no fine-grained permissions beyond the 3
  fixed roles.
- No stock transfers between stores.
- shadcn component set is thin (7 components), responsive/mobile layouts are
  sparse, no command palette or keyboard shortcuts.
- No unit tests, no CI pipeline, no frontend tests.
- Zero AI/LLM code anywhere.
- No Dockerfiles, deploy config, notifications (email/SMS), data export
  (CSV/PDF), rate limiting, structured logging, or error tracking.

## Phase order

1. **Phase 4 — Finish the checkout experience** (full spec below; next up).
2. **Phase 5 — Security & production hardening**: password reset flow,
   refresh-token rotation/revocation, audit logging (who did what, when),
   fine-grained permissions beyond the 3 fixed roles, baseline unit tests +
   GitHub Actions CI, Dockerfiles for `apps/api`/`apps/web` + deploy config.
   De-risks everything built after it — currently zero CI, zero unit tests,
   zero audit trail.
3. **Phase 6 — Multi-store operations**: stock transfers between stores,
   cross-store inventory movement history. `stores`/`StoreUser` already
   support multiple stores but there's no way to move inventory between them.
4. **Phase 7 — UI/UX refinement & responsiveness**: expand the shadcn
   component set (table, dropdown-menu, tabs, toast, sheet, popover, command,
   form), real mobile/tablet layouts, command palette + keyboard shortcuts to
   minimize clicks per the original vision.
5. **Phase 8 — Notifications & data export**: low-stock email alerts,
   emailed receipts, CSV/PDF export for reports and product/inventory lists.
6. **Phase 9 — Offline-first POS**: service worker + IndexedDB sale queue +
   sync-on-reconnect, so checkout keeps working through a connectivity drop.
   Sequenced after checkout (Phase 4) and hardening (Phase 5) since it's the
   most architecturally invasive remaining phase.
7. **Phase 10 — AI-powered business insights**: natural-language summaries
   of the Phase 3 reports data, anomaly detection (e.g. unusual revenue
   dip), restocking suggestions. Built last — depends on solid reports data
   (Phase 3, done) and a stable, tested backend (Phase 5) underneath it.

---

## Phase 4 — Finish the checkout experience (detailed spec)

Scope: cash tendered/change due, split tender, attaching a customer to a
sale, and an improved receipt. Still browser-print only — no thermal
printer/WebUSB/offline work, that's Phase 9.

### Confirmed current state

- `Sale` model (`apps/api/prisma/schema.prisma:198-214`) has a single
  required `paymentMethod PaymentMethod` field, no tendered/change tracking,
  and an already-wired but frontend-unused `customerId String?` FK.
- `apps/api/src/sales/sales.service.ts` computes totals and decrements stock
  correctly inside one `$transaction` — reuse this, don't redesign it.
- `apps/web/src/routes/pos.tsx` + `features/pos/components/{ProductSearchInput,
  Cart, Receipt}.tsx` implement scan-to-cart and browser-print receipt; no
  customer UI exists anywhere under `apps/web/src/features/pos`.
- `apps/api/src/customers/{customers.controller,customers.service}.ts`
  already expose working `GET /customers?search=` and `POST /customers` —
  zero backend change needed there, purely a frontend integration gap.
- shadcn primitives on disk: badge, button, card, dialog, input, label,
  select only. `command`/`popover` need to be added (deps + generated
  wrappers) for a customer search combobox; a `tabs.tsx` wrapper is NOT
  needed — split-tender is a simple boolean-toggle conditional render.

### 1. Data model — additive-only migration, no backfill required

- Add nullable `Sale.amountTendered Decimal? @db.Decimal(10,2)` and
  `Sale.changeDue Decimal? @db.Decimal(10,2)`.
- Add new `SalePayment` table: `id, saleId (FK), method PaymentMethod, amount
  Decimal, tendered Decimal?, change Decimal?, createdAt`. One row per tender
  leg — every sale gets ≥1 row, single-payment sales included, so the write
  path never branches between "simple" and "split."
- Keep `Sale.paymentMethod` as-is (required, unchanged) for backward
  compatibility with any existing report queries that group by it — it
  becomes a denormalized "first payment leg" convenience field, with
  `payments[]` as the authoritative source.

### 2. Backend

- `packages/shared/src/types.ts` + `apps/api/src/sales/dto/create-sale.dto.ts`:
  replace the request DTO's single `paymentMethod` field with
  `payments: SalePaymentInputDto[]` (`{ method, amount, tendered? }`,
  `@ValidateNested @ArrayMinSize(1)`). This is an internal-only API with one
  consumer (`pos.tsx`), so change the backend and frontend together in the
  same deploy.
- `sales.service.ts#create()`: add a validation step that
  `sum(payments[].amount) === total` (reject with `BadRequestException`
  otherwise); for CASH legs, compute `change = tendered - amount` (must be
  ≥ 0) or default `tendered = amount, change = 0` when omitted; write
  `paymentMethod: payments[0].method`, `amountTendered`/`changeDue` as the
  summed cash-leg values (or `null` if no cash leg), and nested
  `payments: { create: [...] }`. `customerId` needs no service change — it's
  already read from the DTO and persisted.
- Response `SaleDto` gains `payments: SalePaymentDto[]`,
  `amountTendered`/`changeDue` (string | null).

### 3. Frontend

- New `apps/web/src/features/pos/components/CustomerSearchCombobox.tsx` —
  `Popover` + `Command`, debounced search over `GET /customers?search=`,
  inline "add as new customer" row posting to `POST /customers`. Defaults to
  "Walk-in customer" (no interaction required) — add `searchCustomers`/
  `createCustomer` to `features/pos/api.ts`.
- New `apps/web/src/features/pos/components/PaymentPanel.tsx` replacing the
  inline `Select` in `pos.tsx`: default single-method `Select` (unchanged
  fast path) + a "Tendered" input that appears only for CASH with a live
  client-side "Change due" readout; a "+ Split payment" toggle swaps to a
  repeatable `{method, amount}` row list with a running "Remaining: $X.XX"
  indicator gating the Charge button. No on-screen numeric keypad in v1 —
  this is a keyboard/mouse POS today; a touch keypad is a stretch item
  needing separate confirmation, not built by default.
- `pos.tsx`: swap in `<PaymentPanel>` + `<CustomerSearchCombobox>`, mutation
  body becomes `{ storeId, customerId, payments, lineItems }`.
- **Click-count check**: zero-decision fast path (scan → Charge) stays at 2
  clicks; tendered-amount entry, customer attach, and split-tender are all
  strictly opt-in additions, never inserted into the default flow.

### 4. Receipt (`Receipt.tsx`)

Replace the single "Paid via {method}" line with a per-payment breakdown
(iterate `sale.payments`, falling back to a synthetic single row from
`paymentMethod`/`total` for pre-migration sales where `payments` is empty),
plus a Tendered/Change-due line only when `changeDue` is non-null and > 0.
Customer name: pass the already-selected `CustomerDto` from `pos.tsx` state
as a prop rather than round-tripping through the API — cheaper than
extending `SaleDto` with a nested customer object for a same-session-only
display need.

### 5. Build order

Schema migration → backend DTO/service (testable via REST client before
touching frontend, since `POST /sales` request shape is a breaking change
that must ship atomically with the frontend update) → `PaymentPanel`
tendered/change (highest value, ship first) → split-tender toggle →
`CustomerSearchCombobox` (independently parallelizable) → `Receipt.tsx` last
(depends on both prior frontend pieces).

### 6. Risks

Rounding consistency between JS floats (frontend "Remaining" calc) and
`Prisma.Decimal` (backend validation) on split-tender sums — use
2-decimal-place rounding on both sides; grep `apps/api/src/reports/**` for
any `groupBy` on `paymentMethod` before/while touching the schema to confirm
zero report breakage (expected, since the field is untouched).

### Critical files

`apps/api/prisma/schema.prisma`, `apps/api/src/sales/sales.service.ts`,
`apps/api/src/sales/dto/create-sale.dto.ts`, `packages/shared/src/types.ts`,
`apps/web/src/routes/pos.tsx`, `apps/web/src/features/pos/components/Receipt.tsx`,
`apps/web/src/features/pos/api.ts`.

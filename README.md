# POS

Cloud-based point-of-sale system for small shops and multi-store businesses.
React + TypeScript + Tailwind + shadcn/ui frontend, NestJS + PostgreSQL +
Prisma backend.

## Features

- **Self-serve sign-up**: creates the business, its first store and the
  owner in one step. Then email verification, password reset, and a
  first-run `/welcome` screen.
- **POS**: product grid (tiles or a list) and search, barcode scanning,
  split payments, customers, emailed receipts. Works **offline**: sales
  are queued on the device and sync automatically, exactly once, when the
  server is back.
  - **Quantities**: type one on a cart line, or put `3*` before a barcode
    or name in the search.
  - **Held orders** ("Deixar pendente" / "Vendas pendentes"): put an order
    on hold, serve someone else, resume it later. Kept on the till; no
    stock or document number until it's completed.
  - **Change a price** on a line for this sale (CHANGE_PRICE); the
    original price is kept beside it.
  - **Customers**: a sale with nobody chosen goes to "Consumidor Final"
    (NIF 999999999). The customer card shows contact, NIF, purchases and
    the last sales.
  - **Manager approval**: whoever lacks a permission (cancel, return,
    discount, discount above the maximum, price change, cash out) can ask
    a manager, who picks their name and types their PIN. The cashier stays
    signed in; the approval covers that one action, and the server issues
    a single-use token that expires in 5 minutes. Offline, the till checks the PIN
    itself and the upload records who approved it. Every approval is in
    the audit log.
  - **Recent sales** on the till: the store's latest sales, including ones
    waiting to upload. Reprint a receipt (marked COPY) or **cancel a
    sale**.
  - Cancelling needs the VOID_SALE permission (owners and managers by
    default, others with a manager's approval) and a reason. The stock goes back, reports drop the sale, and
    a cash sale opens the drawer to hand the money back. It works offline
    too.
  - A sale with a return or an invoice, or older than 24 hours, is undone
    with a return instead.
  - **Discounts**: a percentage or an amount off an item or the whole
    sale. They need the APPLY_DISCOUNT permission (owners and managers by
    default), and owners can set a maximum discount % in Settings; going
    over it needs DISCOUNT_ABOVE_LIMIT (owners and managers) or a
    manager's approval.
    - Tax is charged on the discounted amount.
    - The till, offline receipts and the server use the same calculation
      (`packages/shared/src/pricing.ts`, with a copy in the API that a test
      keeps identical).
    - Receipts, quotes and A4 invoices show each discount; reports count
      revenue after discounts; returns refund what was actually paid.
- **Documents**:
  - 80 mm receipts with logo and business details
  - **quotes** (slip or A4) printed without checking out
  - numbered **A4 invoices** (`INV-<year>-0001`, gap-free, restarting
    yearly) with a frozen seller snapshot, plus an Invoices page for
    reprinting
- **Products & stock**: categories, per-store inventory, purchases,
  returns, transfers between stores, low-stock alerts, and **CSV
  import/export** with a validating preview.
  - **Track stock** can be turned off for services and the like: they
    always sell, never move stock and never show in stock or low-stock
    alerts.
  - **Returns**: a cash refund comes out of a drawer, so it needs the
    person's open shift at a till; a refund by card or transfer can be done
    from the back office.
  - **Editing products**: owners and managers click a product to change its
    name, SKU, barcode, category, prices or tax. Changes apply to new
    sales only: past receipts and invoices keep the name, SKU and price
    the product was sold with. Users who can't see cost prices can't
    change them either.
  - **Tax by name**: each product picks a tax rate ("Taxa geral 14%") or is
    exempt with the AGT reason (M10...). Changing a rate's percentage
    moves its products from the next sale. In Regime Simplificado or
    Exclusão every line is exempt with M00 / M04 whatever the product says.
    Products whose tax wasn't picked by name are flagged in the list.
  - **Prices with IVA** (the store setting): the tax is worked out of the
    shelf price and rounded up to the cent, so base + tax is always the
    shelf price; without the setting the tax is added (also rounded up).
    Receipts say "IVA incluído"; A4 documents show the amounts without
    tax. Every sale line records its rate, code and exemption reason.
  - **Units**: un, kg, g, l, m, cx; everything but "un" takes up to 3
    decimals (0,765 kg). At the till, type the quantity on the line or
    scan "0,5*" before the barcode.
  - **SAF-T fields**: product type (P, S, O, E, I) and inventory type (a
    provisional list until AGT publishes Angola's).
  - **Categories**: add, rename and delete; deleting moves its products to
    another category or leaves them uncategorized.
  - **Barcodes** are unique among active products (checked while typing and
    on the server); a scanner's Enter in the barcode field doesn't save the
    form.
  - **Photos**: resized in the browser, shown in the product list and on
    the till's tiles.
  - **Stock history and value**: every stock change (sale, cancel, return,
    purchase, transfer, count) is a movement with its unit cost. Stock is
    valued at the **weighted average cost** per store (purchases
    re-average it; everything else moves at it), shown to people who may
    see costs. Inventory shows each product's history and the **stock at a
    date** with its book value (31 December for the yearly inventory),
    exportable as CSV. Reports count revenue without tax and profit at the
    average cost.
  - **Archiving**: hides a product from the till and the list without
    touching past sales or reports. "Show archived products" lets you
    restore it.
- **Shifts and cash counts** (always on):
  - The cashier opens a shift with the opening float before the first
    sale; the server refuses sales without an open shift on that till (an
    offline upload is never dropped). One open shift per till, owned by
    whoever opened it: someone else signing in can't sell until it's
    closed, and a manager can close an abandoned one for them (logged as
    forced). A shift survives the app closing or crashing.
  - **Cash in / out** with a reason; cash out needs CASH_OUT or a
    manager's approval.
  - **Close the till** (or Log out, which goes into closing) asks for a
    blind count, as a total or note by note, then shows the expected
    cash, the count and the difference, prints the end-of-shift report
    (optionally listing every sale) and signs the cashier out. The report
    covers sales by payment method, discounts, cancels, returns, cash
    in/out and each cashier.
  - Expected cash = float + cash taken − cash refunds + cash in − cash
    out. The server keeps its own figure and the till's, and works offline
    through the outbox.
  - Differences above an amount set in Settings → Tills are flagged. The
    **Shifts** page lists every shift with its difference and filters by
    status, cashier, till and flagged.
- **Staff**:
  - employees with optional logins (cashier or manager), limited to
    chosen stores
  - password set by the owner, or an emailed invite
  - deactivation takes effect immediately
  - per-user permission overrides
- **Settings** (owner): legal details, tax/VAT ID, currency (shown
  everywhere), default tax rate, receipt and invoice text, logo, and store
  details.
  - **Country configuration** (`packages/shared/src/countries/`, keyed on
    the store's country; Angola first): IVA regimes and their rules, tax
    rates, the AGT exemption table (generated from
    `docs/saft-ao/examples/TaxExemptions.json`, with valid-from/to dates),
    banks, legal forms, provinces, payment mechanisms, notes and coins,
    document types, the AGT QR link and SAF-T deadlines. A new country is a
    new config file. The API keeps a copy that a test keeps identical.
  - **Company data** ("Dados da Empresa"): alphanumeric NIF, Registo
    Comercial, legal form and province from the country's lists, CAE,
    structured address, and "e-invoicing active" (stops the monthly SAF-T
    reminder).
  - **Stores**: country, structured address, **IVA regime** (Geral,
    Simplificado, Exclusão; owner only, every change in the audit log) and
    **prices include IVA** (on for new stores).
  - **Tax rates**: start as the country's (Angola: 14% geral, 5% reduzida,
    7% intermédia flagged "check it still applies", 1% Cabinda only for
    stores in Cabinda); the owner can change, retire or add rates.
  - **Bank accounts**: a bank from the list or "Outro", holder and a
    checked IBAN; shown on quotes/proformas and, if chosen, invoices.
  - Suppliers and customers have a NIF and a structured address. New
    payment methods: credit card, Multicaixa reference, bank transfer and
    cheque, each mapped to its SAF-T payment mechanism.
- **Reports**: dashboard with KPIs, trends, top products, store
  comparison, CSV/PDF export, and optional AI insights (Anthropic API).
- **Languages**: English, European Portuguese, Brazilian Portuguese and
  **Portuguese (Angola)** (see `docs/plans/I18N.md`).
  - pt-AO is made from pt-PT with the Angolan spelling ("Factura", "actual",
    "acção"; `src/i18n/ao-spelling.ts`, same rules in the API) plus a few
    Angolan terms (Numerário, Multicaixa / TPA); money reads "245 000,00 Kz".
  - Each person picks their language (account menu, This device, or the
    corner of the sign-in pages). It's saved to their account, and before
    they choose it follows the computer's language.
  - Receipts, quotes, invoices, the customer display and receipt emails
    use the **business language** (Settings → Receipts & invoices).
  - Numbers, money and dates follow the language; server error messages,
    emails, AI insights, the Windows installer and its first-start screen
    are translated too.
  - Text lives in `apps/web/src/locales/<language>/*.json`. Adding a
    language means adding a folder and one line in `src/i18n/index.ts`.
- **Dropdowns**: every list (suppliers, products, stores, categories,
  payment methods, printers…) uses one searchable dropdown
  (`components/ui/combobox.tsx`). Start typing to filter (accents and
  case don't matter, codes are searchable too), pick with the mouse or
  arrows + Enter, Esc closes.
- Audit log, rate-limited auth, `/health` endpoint.

## Structure

- `apps/api`: NestJS backend
- `apps/web`: React (Vite) frontend
- `apps/desktop`: Windows app (Electron) wrapping the web app: offline
  selling, silent printing, cash drawer, customer displays and
  auto-updates (see `docs/plans/DESKTOP_APP.md`)
- `packages/shared`: shared TypeScript types/enums
- `docs/plans/`: design docs per phase/feature, `LAUNCH_READINESS.md`
  (what's left before selling) and `PRODUCT_AND_DISTRIBUTION.md` (website,
  subscriptions, downloads, accounts and updates for customers)

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

**Always-on API for the installed Windows app.** To use the installed app
against your local data without keeping a terminal open, run the API as a
container on :4000. Docker restarts it, it doesn't need a terminal, and it
uses much less memory than the dev server:

```bash
docker compose --profile api up -d --build   # again after pulling new code
docker compose stop api                      # before `npm run dev:api` on :4000
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

## Windows desktop app

`apps/desktop` is an Electron app for shop tills. Plan:
`docs/plans/DESKTOP_APP.md` (all parts built; released on GitHub Releases).

**What it does:**
- **Bundled web app.** Built with `--mode desktop` (no service worker) and
  served from `app://pos`. Requests to `/api/*` go to the server address
  chosen on first run, so the refresh cookie stays in the main process.
- **Selling offline.** Sales are saved on the till (IndexedDB outbox) when
  any of these happen:
  - the server is unreachable
  - the server answers 502/503/504 or another 5xx
  - the request times out
  - the session has lapsed

  They upload in the background and can't create duplicates (`clientId`).
  Offline sales keep the price and time they were rung up with. Products
  are saved on the till, so the POS starts and sells offline.
- **This device** (`/device`):
  - till registration (`POS-001 "Front Till"`)
  - server and sync status
  - failed sales with Retry
  - fullscreen till mode, start with Windows
  - log folder
- **Logs:** rotating logs in `%APPDATA%/POS/logs`, with tokens,
  passwords and card numbers scrubbed.
- **Silent printing.** Receipts, quotes and invoices go straight to the
  printers chosen on This device, with no dialog, and work offline.
  - Optional auto-print after each sale.
  - Per-printer calibration (paper and printable width, margin, text size,
    feed, copies) and a calibration receipt.
  - In a browser, printing still uses the print dialog.
  - Real-printer checks: `docs/HARDWARE_CHECKLIST.md`.
- **Cash drawer.** Plugged into the receipt printer (USB or network),
  any Windows printer, a network printer by IP, or a COM port.
  - Opens automatically on cash sales.
  - **Open drawer** needs the OPEN_DRAWER permission and asks for a
    reason.
  - Every opening is recorded (offline too) and listed on the **Cash
    drawer** back-office page.
  - Optional ESC/POS paper cut after receipts.
- **Setting up a new till with a code.** In Settings → Tills, the owner
  clicks **Add a till** and gets a 6-digit code: single use, valid 10
  minutes, only its hash stored. After connecting to the server, a new
  till opens a setup wizard:
  1. Enter the till code. The till registers to the right store and gets
     its key, with nobody's password typed on it.
  2. Receipt printer, cash drawer and customer display, each with its
     test.
  3. Then to sign-in, where staff use their PINs.

  The wizard can be run again from This device. The Tills list also shows
  each till's last contact and can turn a till off.
- **PIN sign-in and quick cashier switching.** Staff tap their name on the
  till and type a 4-6 digit PIN. **Lock till** (and optional auto-lock when
  idle) hands the till to the next person; it works offline too.
  - Registering a till gives it a secret key. The Windows app keeps it
    (encrypted with DPAPI), sends it with every request, and the page
    never sees it. Older tills get theirs when a manager next signs in.
  - The owner sets staff PINs on the Employees page; anyone can set their
    own (account menu or This device). Five wrong PINs lock that person
    for 5 minutes.
  - Offline, the till checks PINs against its saved staff list and the
    person works with their saved permissions. Their server session
    follows when the server is back.
  - Queued sales, cancels and drawer openings upload with the till's key
    and are recorded under whoever was on the till.
- **Customer display.** Either:
  - a 2×20 **pole display** (COM port or network; Epson, CD5220 or plain
    commands), or
  - a **second monitor** facing the customer, showing each item, the
    total, then the change.

  The second-monitor view is the `/customer-display` page, which also
  works in a browser window next to the POS. It runs offline.
- **Auto-updates.**
  - Installed tills check this repository's GitHub Releases, download in
    the background, and install when the app next restarts. They never
    interrupt a sale.
  - "Restart and update now" is on This device.
  - Releases are built by GitHub Actions (see below).

```bash
npm run build:desktop --workspace apps/web   # web build for the app
npm run start --workspace apps/desktop       # compile + launch Electron
npm run dist --workspace apps/desktop        # installer: apps/desktop/release/POS-Setup-x.y.z.exe
```

**Releasing a new version:** bump `version` in `apps/desktop/package.json`,
commit, then `git tag v<version> && git push origin v<version>`. The
*Desktop release* workflow builds the installer on Windows and publishes it
as a GitHub Release. Installed tills update themselves from there.
Release builds are locked down with Electron fuses. `npm run dist:test
--workspace apps/desktop` builds a copy Playwright can drive.

On first launch, enter the API address, e.g. `http://localhost:4000`. That's
the API itself, not the Vite dev server. The installer is **unsigned** for
now, so Windows SmartScreen shows a warning ("More info" → "Run anyway").

**Desktop e2e tests** drive the real app with Playwright. They need the API
running on :4000 with seed data. A switchable proxy simulates the server
going down, answering 502, or losing a response. With
`POS_DESKTOP_PRINT_TO_PDF_DIR` set, print jobs are written there as PDFs
at the printer's page size instead of printing (the suite does this
itself):

```bash
npm run test:e2e --workspace apps/desktop
# against the packaged app instead of the dev build:
POS_DESKTOP_EXECUTABLE=release/win-unpacked/POS.exe npx playwright test   # in apps/desktop
```

## Tests

```bash
npm run test --workspace apps/api       # API unit tests
npm run test:e2e --workspace apps/api   # API e2e: needs the migrated + seeded dev database
npm run test --workspace apps/web       # web unit tests (Vitest)
npm run test --workspace apps/desktop   # desktop unit tests (ESC/POS, transports, log scrubbing)
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

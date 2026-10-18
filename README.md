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
  - **The cart is kept** (items, discounts, customer, cash typed…) per
    till, store and person: going to another page, restarting or a crash
    loses nothing, and someone else signing in on the till gets their own.
    It goes only when the sale completes, is cleared or held. Logging out
    or closing the till with a sale in it asks: "Deixar pendente" or
    "Cancelar". Every page reached from the POS has "Voltar ao POS".
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
    reprinting (countries without fiscal documents; in Angola these are
    the older documents, readable but no longer issued)
- **Fiscal documents (Angola)**: every completed sale is a
  **Factura-Recibo** (FR), every return a **Nota de Crédito** (NC) pointing
  at the FR and the lines it corrects. Proformas (PF) can be saved from a
  quote and sold later from the till.
  - **Annulling** an FR (status A) is only allowed for the two reasons the
    law gives (AGT `documentCancelReason`): **I**, the customer was wrongly
    identified, or **N**, the document never reached the customer. The
    cancel dialog says so; anything else is a return (credit note). The code
    and its Portuguese wording are kept and printed.
  - **Series** per till per document type per year (`FR POS001-2026/57`),
    gap-free. Browser sales use the store's series (`WEB1-2026`), numbered
    and signed by the server.
  - **Signed on the till**: a registered till numbers and signs every
    document as it issues it (RSA-SHA1, Base64, over
    `InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;previous hash`), so
    the receipt carries hash characters 1, 11, 21, 31 online or offline.
    The key reaches a till only with its till key (registration), is kept
    encrypted by Windows (DPAPI) and never shown to the page, has a version
    (HashControl once certified, 0 until then) so it can be rotated, and is
    dropped when the till's access is withdrawn. The server checks every
    signature over the chain on upload and flags breaks (signature that
    doesn't match, missing or re-ordered numbers, unknown key version) to
    managers on the Invoices page. Without its key a till can't sell
    offline in Angola.
  - **Immutable**: no route changes or deletes a document, and a database
    trigger refuses it too (only annulling, or a proforma becoming
    invoiced).
  - Buyer, seller, lines and taxes are frozen on the document; exempt
    lines carry the AGT reason's legal wording.
  - **Printouts**: receipts (80 or 58 mm) and A4 with the document type and
    number, buyer NIF (Consumidor Final 999999999), IVA per rate, exemption
    reasons, the amount in words, the hash line, the AGT QR code, and
    "DOCUMENTO SEM VALIDADE FISCAL" until certified. **Invoices** lists every
    document (filter by type, date, customer/NIF) for reprinting.
  - **AGT QR code**: Model 2, error correction M, byte mode, UTF-8, a
    350 x 350 px PNG with a 4-module quiet zone; version 8 for the AGT link
    (version 4 holds only 62 bytes). The centre logo is off until tested on
    real prints.
  - **Kwanzas**: stored and exported as AOA (ISO 4217), printed "Kz"
    (country setting) in the Portuguese format, e.g. "245 000,00 Kz". A
    new business takes its country's currency, language (pt-AO), time
    zone (Africa/Luanda) and IVA regime.
  - **Display size per person**: Small, Normal, Large or Extra large from
    the top bar (back office and till); it follows the person to every till
    and never changes printouts.
  - **Reports** (owner and manager): sales by day, month, product,
    category, cashier, payment method and document type, with cost and
    margin; IVA summary by rate and exemption (and 7% of money received in
    the Simplificado regime); stock valuation and low stock; customers' and
    suppliers' balances; purchases by supplier; what was sent to AGT. For a
    store or the whole company, any period of calendar days; CSV, PDF and
    print.
  - **Electronic invoicing with AGT** (behind a server flag, off by
    default): invoices, invoice-receipts, credit/debit notes and receipts are
    queued and sent to AGT signed (RS256), with retries and AGT's limits
    respected; the **AGT page** shows what's waiting, accepted and rejected
    (with AGT's errors) and corrects a rejected document with a new one; the
    top bar shows what's still waiting and turns red on a rejection.
  - **Files for AGT and the accountant** (Reports, owner and manager; every
    file generated is in the audit log):
    - **SAF-T (AO) Facturação** for a month or any period within one year,
      for the company or one store: header, customers (Consumidor Final
      999999999), products, tax table, every sales document (FR, FT, NC,
      annulled ones with their reason), proformas as working documents. Each
      file is checked against AGT's XSD (`docs/saft-ao/xsd`) in the tests.
    - **SAF-T de Inventários** (draft layout until AGT's circular is
      published): stock held at the end of a date (31 December by default),
      per product, at the weighted average cost; no stock gives the header
      only.
    - **Export for the accountant**: an Excel workbook with sales (base and
      IVA per rate, exemptions, credit notes subtracting), purchases, and
      money received and refunded.
    - Periods are **calendar dates in the shop's time zone** (Luanda): a
      sale at 00:30 on 1 November belongs to November even though it's
      still 31 October in UTC.
    - The Dashboard reminds owners of the monthly files (last month's
      invoicing and purchases files, due by the last day of the month,
      Decreto Presidencial 312/18 art. 3; while e-invoicing is off) and of
      the yearly inventory (until 15 February). The purchases file's due
      day can be changed in Accounting → Settings.
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
  - **No exempt product without its reason** (Angola): a 0% product must
    have its M-code (form, API and CSV import, which has an Exemption
    column); new products start on Taxa geral 14%. Older products exempt
    without a reason are listed under **Produtos a rever** on the Products
    page, the till won't sell them, and no document, SAF-T file or AGT
    submission is ever made with an exempt line lacking its M-code.
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
- **Shifts and cash counts** (always on; shifts follow selling, not signing in):
  - Each device is a **till** or **back office** (This device). The
    Windows app is a till until changed; a browser asks an owner or
    manager once, the first time the POS screen is opened there. Signing in never opens a shift, and back-office work
    (dashboard, reports, products, settings, accounting) never needs one.
    On a till, the shift opens with the opening float when someone goes to
    sell; a back-office device never opens one. The server refuses sales
    without an open shift on that till (an offline upload is never
    dropped). One open shift per till, owned by
    whoever opened it: someone else signing in can't sell until it's
    closed, and a manager can close an abandoned one for them (logged as
    forced). A shift survives the app closing or crashing.
  - **Cash in / out** with a reason; cash out needs CASH_OUT or a
    manager's approval.
  - **Log out** with no shift of your own open is a plain sign-out (a
    manager who takes over a cashier's till to check something leaves the
    cashier's shift open).
  - **Close the till** (or Log out with your shift open, which goes into
    closing) asks for a blind count, as a total or note by note, then shows the expected
    cash, the count and the difference, prints the end-of-shift report
    (optionally listing every sale) and signs the cashier out. The report
    covers sales by payment method, discounts, cancels, returns, cash
    in/out and each cashier. A shift with no sales and no cash in or out
    closes in one click ("Contagem = fundo de caixa?"), or with another
    amount typed.
  - Expected cash = float + cash taken − cash refunds + cash in − cash
    out. The server keeps its own figure and the till's, and works offline
    through the outbox.
  - Differences above an amount set in Settings → Tills are flagged. The
    **Shifts** page lists every shift with its difference and filters by
    status, cashier, till and flagged.
- **Sales history** (back office): every sale of the store by day
  (the store's calendar days), status (cancelled, on credit) or receipt,
  document number, customer or NIF; reprint the slip, print the A4
  document, or issue an invoice where sales aren't fiscal documents; CSV.
- **Printing fiscal documents**: the first print is the **original**
  (with the store's copies: Original, Duplicado, Triplicado); every later
  print says **"2ª Via"**, and each print is logged (who, when, how). A
  store can print the A4 document after each sale instead of the slip
  (Settings → Stores → Printing).
- **Purchases** filtered by day, supplier, payment status or number, with
  CSV export and an A4 printout of each purchase (supplier document, IVA,
  IVA cativo, payments).
- **Credit and payables (Angola)**:
  - **Customers** page: credit limit (owners and managers), what each owes,
    and their account: invoices on credit, receipts, take a payment, annul
    a receipt (VOID_SALE).
  - At the till, a chosen customer's sale can go **on their account**
    (SELL_ON_CREDIT or a manager's approval, within the limit, online):
    it's a **Factura (FT)**; anything paid now gets a **Recibo (RC)**. The
    customer card shows what they owe and takes payments. Cash taken
    counts in the shift; returns on unpaid invoices lower the debt first.
  - **Purchases** record the supplier's document, IVA per rate (deductible
    % and type), IVA cativo and what was paid; **Suppliers** shows what is
    owed, takes payments and cancels mistaken ones.
  - All of it reaches the SAF-T file (Payments, PurchaseInvoices) and the
    accountant's workbook (including AGT's supplier annex layout).
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
  comparison, CSV/PDF export, and optional AI insights (Anthropic API);
  the **Reports** page makes the SAF-T and accountant files (above).
- **Languages**: English, European Portuguese, Brazilian Portuguese and
  **Portuguese (Angola)** (see `docs/plans/I18N.md`).
  - pt-AO is made from pt-PT with the Angolan spelling ("Factura", "actual",
    "acção"; `src/i18n/ao-spelling.ts`, same rules in the API) plus a few
    Angolan terms (Numerário, Multicaixa / TPA); money reads "245 000,00 Kz".
  - Each person picks their language (account menu, This device, or the
    corner of the sign-in pages). It's saved to their account, and before
    they choose it follows the computer's language.
  - Receipts, quotes, invoices, shift reports, printed/PDF/CSV reports and
    exports, the customer display and receipt emails use the **store's
    document language** (Settings → Stores → "Idioma dos documentos"; by
    default its country's: Angola → pt-AO), whatever the screens are in.
  - **Dates** follow the store's country, not the language: DD/MM/YYYY
    (and DD/MM/YYYY HH:mm) in Angola, typed that way in date fields too
    (`src/lib/dates.ts`). SAF-T, AGT, the hash and QR, and the database
    stay ISO.
  - Numbers and money follow the language; server error messages,
    emails, AI insights, the Windows installer and its first-start screen
    are translated too.
  - Text lives in `apps/web/src/locales/<language>/*.json`. Adding a
    language means adding a folder and one line in `src/i18n/index.ts`.
- **Dropdowns**: every list (suppliers, products, stores, categories,
  payment methods, printers…) uses one searchable dropdown
  (`components/ui/combobox.tsx`). Start typing to filter (accents and
  case don't matter, codes are searchable too), pick with the mouse or
  arrows + Enter, Esc closes.
- **Contabilidade** (accounting, `apps/api/src/accounting`, branch
  `feature/accounting`; plan and decisions in `docs/ACCOUNTING-DECISIONS.md`):
  - Chart of accounts from the PGC (Decreto 82/01) with GR/GA/GM accounts and
    an account per customer, supplier, till and bank account; years with
    periods 0–15 that close and reopen (with a reason, audit-logged).
  - Journals and entries that must balance, can't change once posted (an
    estorno corrects them) and can't go into a closed period: all enforced by
    the database. Templates, opening balances (CSV).
  - Sales, receipts, credit notes, purchases, supplier payments, expenses,
    cash differences and stock counts are posted automatically (account
    mapping per company, daily summary per till as an option, integration
    monitor; nothing is posted twice).
  - Reports (Balancete, Razão, Diário, statements and ageing, Balanço,
    Demonstração de Resultados, IVA) as PDF and Excel; year-end (apuramento,
    close, carry forward).
  - SAF-T (AO) accounting file (TaxAccountingBasis I) and purchases file
    (A), validated against AGT's XSD; TransactionID and AccountID in the
    invoicing file; 10 April reminder.
  - Outside accountants (role ACCOUNTANT): one login for several companies,
    full rights in the books, read-only elsewhere. An accountant who already
    has a login gets an email when another company invites them; the
    invitation waits under Your clients until they accept it.
  - Document archive (ZIP) for a period: every document as a PDF in its
    printed A4 layout ("2ª Via"; exact PDFs in the Windows app, page images
    in a browser), the SAF-T files, the attachments and an index.
  - Attachments, bank reconciliation (CSV/Excel), fixed assets with monthly
    depreciation.
  - Local demo accountant: `npx ts-node prisma/demo-accountant.ts` in `apps/api`
    (accountant@demo-store.test / AccountantPass123!).
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

**Demo logins (from the seed).** The seed makes an Angolan demo store
("Demo Retail Co."): AOA, pt-AO documents, Africa/Luanda, Regime Geral,
70 products priced in kwanzas.

- `owner@demo-store.test` / `OwnerPass123!` (till PIN 8642)
- `cashier@demo-store.test` / `CashierPass123!` (till PIN 2468)

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
| `SAFT_PRIVATE_KEY` or `SAFT_PRIVATE_KEY_FILE` | RSA private key (PEM, 1024-bit) that signs the fiscal documents' hash chain. Keep it in secrets, never in the repo. Without it a temporary key is used (fine until certified) |
| `SAFT_KEY_VERSION` | The key's version, printed as HashControl once certified (default 1) |
| `AGT_SOFTWARE_CERTIFICATE` | The software's AGT validation number (e.g. `77/AGT/2019`). Unset: documents say "DOCUMENTO SEM VALIDADE FISCAL" and HashControl is 0; set: the API won't start without the real key |
| `AGT_EINVOICE_ENABLED` | `1` turns on sending documents to AGT (electronic invoicing). Off by default; also needs the business's setting |
| `AGT_EINVOICE_URL` | AGT's e-invoicing API (default: the homologation server `https://sifphml.minfin.gov.ao/sigt/fe/v1`) |
| `AGT_EINVOICE_USER`, `AGT_EINVOICE_PASSWORD` | The credentials AGT gives the software producer (Basic auth) |
| `AGT_SOFTWARE_KEY` or `AGT_SOFTWARE_KEY_FILE` | RSA private key (PEM, 2048+ bits) for the software's signature; secrets only |
| `AGT_DOCUMENT_KEY` or `AGT_DOCUMENT_KEY_FILE` | RSA key for documents' signatures (default: the software key) |
| `AGT_QUEUE_INTERVAL_MS` | How often the queue runs (default 15000; 0 turns the timer off) |
| `SAFT_PRODUCER_TAX_ID`, `SAFT_PRODUCT_ID`, `SAFT_PRODUCT_VERSION` | The software maker's NIF, "Product name/Company name" and version written in every SAF-T file's header. Placeholders (`999999999`, `POS/POS`, `0.2.3`) until the software is registered with AGT |

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
  - what the device is for: till or back office
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
  - In a browser, printing uses the print dialog. To print without it,
    start Chrome or Edge with `--kiosk-printing` (e.g. a shortcut to
    `chrome.exe --kiosk-printing https://your-pos-address`): it prints to
    the default printer straight away.
  - **Print options** beside every Print button: copies and (in the Windows
    app) another printer, for that print only.
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
  - **Update channel** (This device): *Stable*, the default, installs full
    releases only; *Beta* also installs pre-releases, so a version can be
    tried on one computer before the shops get it.
  - Releases are built by GitHub Actions (see below).

```bash
npm run build:desktop --workspace apps/web   # web build for the app
npm run start --workspace apps/desktop       # compile + launch Electron
npm run dist --workspace apps/desktop        # installer: apps/desktop/release/POS-Setup-x.y.z.exe
```

**Releasing a new version:** bump `version` in `apps/desktop/package.json`,
commit, then `git tag v<version> && git push origin v<version>`. The
*Desktop release* workflow builds the installer on Windows and publishes it
as a GitHub **pre-release**: only computers on the Beta channel install
it. Once it's tested, make it a full release so every till updates:
`gh release edit v<version> --prerelease=false --latest`.
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
# desktop e2e against another API than :4000 (e.g. this branch's, run from source):
POS_TEST_API_URL=http://localhost:4100 npx playwright test --config apps/desktop/playwright.config.ts
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

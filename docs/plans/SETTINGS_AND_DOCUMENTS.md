# Business Settings, Quotes, A4 Invoices & CSV Import: plan

Item **#2** of `LAUNCH_READINESS.md` (settings, currency first), extended on
2026-10-08 with three requests from the user:

- **Logo upload** as part of settings.
- **Print a quote without checking out.** Used when a company wants to see
  the cost before buying, or when a manager sends a mystery shopper to check
  prices.
- **Import products from CSV.** Today the products page can only *export*.
- **A4 invoice at checkout**, with full company details, as an alternative to
  the small receipt. Some buyers need one legally, e.g. for purchases on
  company expense.

Shipped in four parts, in this order, because the later ones depend on
the earlier: **A** settings (currency, company details, logo), **B**
quotes, **C** A4 invoices, **D** CSV import. Each part gets its own commits
and tests.

## Current state (2026-10-08)

- **Currency is `$` everywhere.** `formatCurrency` in
  `apps/web/src/lib/format.ts` hard-codes USD, and 10 more files build
  `$${x.toFixed(2)}` by hand: `Cart`, `PaymentPanel`, `ProductGrid`,
  `ProductSearchInput`, `Receipt`, `pos.tsx`, and the products, expenses,
  purchases and returns pages. The receipt email in `MailService` also
  hard-codes `$`.
- **Money columns are `Decimal(10, 2)`**, so only currencies with 0–2
  decimal places are stored exactly. TND, KWD, BHD, OMR and JOD use 3.
  Decided 2026-10-08: keep 2 decimals, and leave 3-decimal currencies out
  of the currency list for now.
- **Nothing is editable after sign-up.** `Business` has only `name` and
  `plan`, with no update endpoint. `Store` has `name`, `address` and
  `timezone`, also with no update endpoint. There is no business-level
  address, tax ID, phone or default tax rate. `Product.taxRate` is set per
  product and defaults to 0.
- **No file uploads exist anywhere.** There's no multer setup and no object
  storage.
- **Receipt:** `features/pos/components/Receipt.tsx` is an 80 mm slip,
  printed with `window.print()`. `globals.css` has an `@media print` rule
  that hides everything except `#printable-receipt`. It shows only the
  store name, with no address, logo or tax ID.
- **Receipt numbers** are `${storeId.slice(-4)}-${Date.now()}`, unique but
  not sequential. Offline sales get `OFFLINE-…` until they sync. Many
  jurisdictions require invoice numbers to be **sequential with no gaps**.
- **Customers** have `name`, `phone` and `email`, but no address or tax ID.
- **CSV:** `lib/csv.ts` only writes CSV. The export columns are Name, SKU,
  Barcode, Cost price, Sell price, Tax %. Products are unique per
  `(businessId, sku)`. `POST /products` creates one product at a time.
- `jspdf` + `jspdf-autotable` are already dependencies, used for the
  dashboard report.

## A. Business settings, currency & logo

**Status: shipped 2026-10-08** (`d8a14ad` API, `85c1140` web). Notes:

- **Logo endpoint is public:** `GET /businesses/:id/logo`, not `/me/logo`.
  A plain `<img>` can't send the bearer token, and the logo is printed on
  every receipt anyway. The business id is an unguessable cuid. The cache
  is immutable, and the `v=` param changes on every upload.
- **JSON body limit is 1 MB** (was Express's default 100 KB), set in
  `main.ts`.
- **The session carries the full business settings** (not just currency),
  since receipts need the address and tax ID offline.
  `ProtectedRoute` refreshes them on load.
- **Money uses the browser's locale** for separators (`1.234,50 €` in a
  French browser).
- **Known limitation:** jsPDF's built-in font is Latin-only, so the
  dashboard PDF export may garble non-Latin currency symbols (e.g. ₹, ₪).

### Data (one migration)

- `Business` gains: `legalName?`, `taxId?` (VAT/tax number),
  `registrationNumber?`, `address?`, `phone?`, `email?`, `website?`,
  `currency` (ISO 4217 with 0–2 minor units, default `"USD"`, so existing
  data keeps showing `$`), `defaultTaxRate Decimal(5,2) @default(0)`, `receiptHeader?`,
  `receiptFooter?`, `invoiceFooter?` (e.g. bank details or payment terms),
  `logo Bytes?`, `logoMimeType?`, and `logoUpdatedAt?` (for cache-busting).
- `Store` gains `phone?`. It already has `address` and `timezone`.

### API

- `GET /businesses/me` returns all the new fields except the logo bytes,
  plus a `logoUrl` (`/businesses/me/logo?v=<logoUpdatedAt>`) when a logo is
  set.
- `PATCH /businesses/me` (owner only) updates name, legal details, currency
  (validated against `Intl.supportedValuesOf("currency")`, rejecting
  currencies whose minor units exceed 2), default tax,
  and receipt/invoice text.
- **Logo:** `PUT /businesses/me/logo` (owner only) takes
  `{ dataUrl }` with PNG, JPEG or WebP, **≤ 300 KB after decoding**. The
  browser shrinks the image to at most 600 px wide before sending it, so
  phone photos still fit. `DELETE` removes it. `GET` serves the bytes with
  `Cache-Control: private, max-age=86400` and requires auth.
  - Why the database and not files: no storage exists yet, and the hosting
    platform isn't chosen (item #4). A 300 KB row is fine. Moving it to
    object storage is a small change once we deploy.
- `PATCH /stores/:id` (owner only): name, address, phone, timezone.
- The session payload (login, register, refresh-on-load) includes a
  `business` block with `name`, `currency`, `defaultTaxRate` and
  `logoUrl`, persisted in the auth store. **The POS has to know the
  currency offline**, so it can't be fetched on every page load.

### Web

- **New `/settings` page** (owner only; a sidebar entry and a command
  palette item). Its sections:
  - *Business*: name, legal name, tax ID, registration number, address,
    phone, email, website.
  - *Logo*: upload, preview, remove.
  - *Money*: currency (a searchable list with each code's symbol and
    example "1,234.50 TND"), and the default tax % for new products.
  - *Receipts & invoices*: receipt header and footer, invoice footer.
  - *Stores*: a table with edit (name, address, phone, timezone).
- **Currency everywhere:** `formatMoney(value, currency)` uses
  `Intl.NumberFormat` with the currency's own decimal places. A
  `useMoney()` hook reads the currency from the auth store. Replace
  `formatCurrency` and all 10 hand-built `$` sites. The compact dashboard
  figures use `Intl`'s `notation: "compact"`.
- The API receipt email uses the business currency too.
- The new-product form pre-fills tax % from `defaultTaxRate`.
- The 80 mm receipt gains the logo (when set, in grayscale for thermal
  printers), the receipt header, the store address and phone, the tax ID,
  and the receipt footer (replacing the fixed "Thank you!").

## B. Print a quote (no checkout)

**Status: shipped 2026-10-08** (`git log --grep "Print quote"`). Notes:

- The dialog has a "For (optional)" name field, pre-filled from the POS
  customer. It shows as "For:" on the slip and as "Bill to" on A4.
- The shared pieces are `features/documents/`: the `DocumentLine` maths,
  `A4Document` and `SlipHeader`, plus the receipt/A4 formats of
  `PrintArea`. Part C reuses `A4Document` with a seller snapshot.
- There are no automated tests on the web side, which has no test runner;
  the logic is small (`documents/lines.ts`). Adding Vitest is worth doing
  before part D's CSV parser.

- A **"Print quote"** button in the POS checkout panel, next to "Charge",
  enabled whenever the cart has items. It doesn't create a sale, take
  payment or change stock.
- It prints the same layout as the receipt, titled **QUOTE**, with:
  - date and time, store, items, subtotal, tax and total
  - "Prices valid on <date>"
  - **"This is not a receipt or proof of payment"** in the footer, so a
    quote can't be passed off as a paid receipt
- The quote has no receipt number. It gets a short reference instead
  (`Q-<store>-<yyMMdd-HHmm>`) so the shop can tell quotes apart.
- An **A4 option** for companies: the same "Print quote / A4" choice as
  invoices (part C), using the invoice layout titled **QUOTATION** with
  company details. It doesn't consume an invoice number.
- **Works offline**, since it uses only the cart and the cached settings.
- **Quotes are not saved** (decided 2026-10-08). The cart stays as it was,
  so the cashier can quote and then check out.

## C. A4 invoice at checkout

### Data

- New `Invoice` model:
  - `id`, `businessId`, `saleId @unique`
  - `number`: a per-business sequence
  - `issuedAt`
  - `seller Json`: a snapshot of the business details and logo URL at
    issue time, because an issued invoice must not change if settings change
    later
  - buyer fields: `buyerName`, `buyerAddress?`, `buyerTaxId?`,
    `buyerEmail?`
  - optional `customerId`
- **Numbering, decided 2026-10-08: `INV-<year>-<0001>`, restarting at 1
  each year.**
  - A new `InvoiceCounter` table (`businessId`, `year`, `next`; unique on
    `(businessId, year)`) is upserted and incremented in the same
    transaction as the invoice insert. That makes numbers gap-free and
    safe when two tills invoice at once (row lock via
    `update … returning`).
  - The year comes from the business's first store timezone, so a sale at
    23:30 on 31 December isn't numbered into the next year.
  - `Invoice` stores `year` and `sequence`, with `@@unique([businessId,
    year, sequence])` as a final guard.
- `Customer` gains `address?` and `taxId?`, so repeat company buyers are
  pre-filled.

### API

- `POST /sales/:saleId/invoice` takes buyer details and an optional
  `customerId` / `saveToCustomer`. It returns the invoice, or the existing
  one if the sale was already invoiced. Cashiers are allowed, but only for
  sales at their own stores.
- `GET /invoices` (owner/manager, paged, filterable by date) and
  `GET /invoices/:id` (for reprinting).
- **Offline sales** can't be invoiced until they sync, since numbering is
  server-side. The button says so.

### Web

- **Sale complete dialog:** two buttons, **"Print receipt"** (the default,
  as today) and **"A4 invoice"**. The second opens a small buyer form
  (company name, address, tax ID, email). If the sale had a customer, it's
  pre-filled from them, with a "Save to customer" tick. Then it issues the
  invoice and opens the print view.
- **A4 layout:**
  - logo; seller legal name, address, tax ID and registration number
  - "INVOICE" with number and date; "Bill to" block
  - line table: item, qty, unit price, tax %, line total
  - totals by tax rate, then grand total; payment method(s), marked
    "Paid"
  - invoice footer
- **Printing:** generalize the print CSS from `#printable-receipt` to a
  `data-print` root with named pages (`@page receipt { size: 80mm auto }`,
  `@page a4 { size: A4; margin: 15mm }`). The browser's print dialog also
  covers "Save as PDF" for emailing.
- **New `/invoices` page** (back office): a list with reprint, so an
  invoice can be printed again later. That's needed for audits and lost
  copies.

## D. Import products from CSV

- On the products page, an **"Import CSV"** button next to "Export CSV".
- **Download template:** the same columns as the export, plus `Category`
  and `Stock` (an optional starting quantity for the current store). An
  exported file can be edited and imported back.
- **Steps:**
  1. **Choose file:** parsed in the browser, with no upload until
     confirmed. The parser handles quoted fields, `;` separators (common in
     European Excel) and a UTF-8 BOM. Headers are matched case-insensitively.
  2. **Preview:** a table of rows with their status: *new*, *update*
     (same SKU exists), or *error* (missing name/SKU, a price that isn't a
     number, a duplicate SKU in the file), with the reason shown on the
     row. Owner choices:
     - "Update existing products with matching SKU" (on by default)
     - "Create missing categories" (on by default)
  3. **Import:** valid rows are sent as `POST /products/import`, in chunks
     of up to 1,000 rows, each chunk one transaction. The result shows how
     many were created and updated, and the skipped rows with reasons, which
     can be downloaded as a CSV to fix.
- **API:** `POST /products/import` (owner/manager) validates every row
  again on the server and upserts by `(businessId, sku)`. It creates
  categories by name when asked, and sets starting stock through the same
  inventory path as manual adjustments, so stock history stays consistent.
- **Tax %** comes from the file. When blank, it uses `defaultTaxRate` from
  part A.

## Tests

- **Unit:**
  - money formatting (USD, EUR, JPY 0dp; 3dp currencies rejected)
  - settings validation (currency codes, logo type and size)
  - invoice numbering is sequential and restarts in a new year, a second
    request returns the same invoice, and the seller snapshot is unaffected by later settings changes
  - CSV parser (quotes, `;`, BOM, bad numbers, duplicate SKUs)
  - import upsert and category creation
- **E2E:**
  - owner updates settings and the session/`/businesses/me` reflects them
  - logo upload, serve and delete; a non-owner gets 403
  - two concurrent invoices get consecutive numbers
  - a cashier can't invoice another store's sale
  - an import of 3 rows (1 new, 1 update, 1 error) gives the right counts
  - cleanup in `afterAll`, as in the other new specs
- **Browser (user):**
  - set the currency and see it on POS, receipt and dashboard
  - upload a logo and see it on the receipt and invoice
  - print a quote, check out, print an A4 invoice, reprint it from
    `/invoices`
  - import a CSV edited in Excel

## Out of scope

- Real thermal-printer drivers (ESC/POS). Printing stays through the
  browser; hardware testing is a separate "should-have" item.
- Emailing invoices or quotes as PDF attachments. Possible later, since
  the receipt email already exists.
- Saving quotes and turning them into sales (decided: not saved).
- Multi-currency within one business, and exchange rates.
- Discounts on invoices or quotes. `discountTotal` exists but the POS has
  no discount UI.
- Credit notes for returned items that were invoiced. Needed eventually
  for legal completeness, and noted for the returns flow.

## Done when

An owner can:

- set their business details, logo and currency, and see the currency
  everywhere, including the offline POS
- print a quote from a cart without selling anything
- check out and print a numbered A4 invoice with both companies' details,
  then reprint it later
- import a few hundred products from a spreadsheet, with clear errors for
  bad rows

Unit and e2e tests pass.

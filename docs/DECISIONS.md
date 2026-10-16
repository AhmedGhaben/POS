# Angola plan: decisions and progress (from phase 8b)

The plan is `docs/plans/ANGOLA.md` (its **Progress** section has the
details of each phase). This file records the choices made without the
owner, so they can be reviewed and reversed.

## Summary (session of 2026-10-15/16)

**Every phase of the plan is built** (order 1→2→3→7→6→8→8b→4→5→9→10→11),
one commit per phase, each pushed to `main`; CI green on every one.

| Phase | Commit | What |
|---|---|---|
| 8b | `0e0514c` | SAF-T (AO) Facturação (checked against AGT's XSD), Inventário (draft CSV), accountant's Excel workbook. **Date fix**: periods are plain calendar dates in the store's time zone (Luanda); 2026-10-01..31 has EndDate 2026-10-31 and exactly October's documents; month-end and year-end tests (unit + e2e). |
| CI | `e06caef` | CI had been red since 13 Oct (tests priced sales as if IVA were added; one used the UTC date). Fixed; green again. |
| 4 | `a1f3d38` | Sales on credit (FT), receipts (RC), customers' and suppliers' accounts, purchase IVA and cativo. |
| 5 | `2914c3a` | Sales history, purchase filters/CSV/A4, "2ª Via" from a print log, copies and print options. |
| 9 | `994204c` | AGT e-invoicing **behind a flag (off by default)**: queue, RS256 signatures, send/status/backoff, AGT page, rejected → correct, top-bar indicator. |
| 10 | `8a46006` | Reports: sales by day/month/product/category/cashier/payment/document type with margin, IVA summary (Simplificado 7%), AGT status, stock valuation, low stock, balances, purchases; CSV, PDF, print. |
| 11 | `285595a` | Wider sidebar, larger icons; display size per person (saved on the server; printouts unaffected). |

Tests at the end: API unit 225, API e2e 221 (27 suites; on `pos` and on
the freshly migrated `pos_ci`), web unit 150, desktop unit 28; lint clean
(web: the 4 old fast-refresh warnings).

**For you to review or decide** (details in each phase's table below):
- Phase 9 was built from AGT's published docs and tested against a fake
  AGT only; never against AGT's servers (no homologation credentials). Two
  spec ambiguities were guessed and need confirming in homologation:
  `operationType` (TB/SE) and `companyName` (taken as the buyer).
- **Not built, on purpose**: AGT's `solicitarSerie`/`listarSeries`. With
  e-invoicing, series must be requested from AGT, which changes how
  documents are numbered (tills number offline today). Needs your call and
  its own phase. Lookups (`consultarFactura`, `listarFacturas`,
  `validarDocumento`) aren't built either.
- Reports read the fiscal documents, not the old `sales` table, so they
  match SAF-T; the dashboard keeps its own figures and may differ slightly.
- "PDF" is the print dialog's "Save as PDF" on an A4 layout; no server PDF.

**Desktop e2e and screens (2026-10-16, after you restarted the :4100 API):**
- Full desktop Playwright suite against this branch's API: **116 passed,
  3 skipped** (the skips are the existing conditional ones). New
  `angola-phase9-11.spec.ts`: the AGT page (server not configured) and its
  Settings switch, Documents by type + CSV, display size kept across
  sign-out/in on the till.
- Four older specs failed on purpose-made changes and were updated (no app
  bug): reprints say "2ª Via", not "COPY" (phase 5); Reports opens on
  Figures (phase 10); the payment picker shows once the cart has something
  (phase 4); part C opens its shift before setting up the drawer (opening a
  shift kicks the drawer; it passed only when an earlier suite left the
  owner's shift open). Phase 5's spec had two selector mistakes, fixed.
- Screens checked from screenshots: AGT page, report figures (product
  margin, IVA summary), display-size menu, back office and till at Extra
  large. One fix: the Reports page had no page margins (now like the others).
- **Found, not fixed (your call):** 55 demo products are at 0 % IVA without
  an exemption reason (from before phase 6), and the API still accepts a
  bare `taxRate: 0`. Their sales get IVA ISE 0 % with **no M-code**, which
  the SAF-T file leaves out and AGT will most likely reject. Suggested fix:
  require a reason for 0 % (product form and API) and have the owner pick
  one for the existing products (a data change, so not done here).

**Not run / not done** (skipped per your rules or the situation):
- The Docker API on :4000 (serving the installed v0.2.3 tills) was **not
  rebuilt**: that's the 0.2.4 release, your call. Migrations were applied
  only to the local databases (`pos`, `pos_ci` on localhost:15432); none
  to any other database. Nothing was deployed.
- The local throwaway database `pos_ci` is still there (drop with
  `DROP DATABASE pos_ci;` if unwanted).
- Old `nest start --watch` dev servers from an earlier session are still
  running (one on :3000). They lock Prisma's engine DLL, so `prisma
  generate` reports EPERM (types still regenerate). Left alone; stop them
  and run `npx prisma generate` in `apps/api` once.

---

## Corrections to the previous session's log (2026-10-15)

The earlier version of this file said phase 8b was complete with all tests
passing. On checking:

- The API unit suite was red: `messages.spec.ts` failed on the untranslated
  "Invalid date format". ("13/13 fiscal tests" were the existing signature
  and line tests; nothing tested the exports.)
- The SAF-T XML wasn't valid against the XSD (all lines inside one `<Line>`,
  no `DocumentStatus`, `NumberOfEntries`, totals or `SpecialRegimes`,
  `ProductID` "POS", exemption reason and code in the wrong order, a
  `Contact` structure that is text in the schema, `buyerAddress.street`
  that doesn't exist).
- The dates depended on the server's own time zone (`getHours()`) and the
  web sent `new Date(input).toISOString()`.
- The Inventários radio button was ignored (always the invoicing file);
  there was no store picker; the page's texts were looked up in the wrong
  namespace; `/reports` wasn't in the menu.
- Inventários and the accountant export were 30-line CSV placeholders (no
  stock at a date, no IVA per rate, no purchases).
- `docs/PLAN.md` doesn't exist; the plan is `docs/plans/ANGOLA.md`.

All of 8b was rebuilt (see below). `bf3534c`'s "Phase 4 preparation"
mentioned a migration "prepared"; there is none in the repo.

---

## Phase 8b: SAF-T (AO) and accountant exports

| # | Decision | Why |
|---|----------|-----|
| 1 | Export dates are `YYYY-MM-DD` calendar dates, read in the **store's** time zone (stores on UTC take the country's: Africa/Luanda). A file for the whole company uses the country's zone. Anything else (timestamps, 2026-02-30) is a 400. | The owner's requirement; the server's own zone must not matter (tested with the process in 5 zones). |
| 2 | `invoiceDate` (a DATE column, already the shop's day) is compared as a date; timestamps (purchases, stock movements) from local midnight of the start to local midnight after the end, exclusive. | Same answer for documents and for everything else; no 23:59:59 tricks. |
| 3 | Both dates or neither; neither = last month by the shop's clock (inventory: last 31 December). | The monthly file is the usual case. |
| 4 | A SAF-T file stays within one fiscal (calendar) year; the accountant export may span years. | Header has one FiscalYear; series restart per year. |
| 5 | Routes became `GET` downloads (`Content-Disposition`), replacing the `POST` ones that returned the file inside JSON. Web uses `apiClient.download`. | Binary Excel; same auth/refresh/error handling as every other call. |
| 6 | XSD validation in tests with `xmllint-wasm` (libxml2 in WASM, dev dependency, offline). | The plan asked for it; it found real bugs (see 9). |
| 7 | N's annulment wording (58 characters) is exported as "Anulada por não envio do documento ao adquirente" (48); I's fits (50). | SAF-T `Reason` holds 50; a hard cut read "…documento ao ad". |
| 8 | No file without the company NIF (10–15 characters) or with a currency other than AOA. | The XSD requires both; a wrong file is worse than a clear error. |
| 9 | `CustomerID`: Consumidor Final is always `CONSUMIDOR-FINAL`; other ids as stored (25 characters), a stable SHA-1 digest if longer than 30. | Old Consumidor Final rows have 35-character ids; the demo business's real file failed the XSD on them. |
| 10 | MasterFiles carry the customers and product codes the period's documents use (product code = the SKU on the line, as sold). | Keyrefs in the XSD; a later SKU change mustn't break the file. |
| 11 | Header software fields from env: `SAFT_PRODUCER_TAX_ID` (placeholder 999999999), `SAFT_PRODUCT_ID` ("POS/POS"), `SAFT_PRODUCT_VERSION` (0.2.3); `SoftwareValidationNumber` is `AGT_SOFTWARE_CERTIFICATE` when it looks like `NNN/AGT/AAAA`, else 0. | **Owner to fill in**: the producer's NIF and the registered product name. |
| 12 | Payment lines (`Payment`) only on FR; credit note refunds go to the accountant workbook. `Payments` (RC) is written by the builder and fed in phase 4. PurchaseInvoices waits for the supplier's document number/date/hash (phase 4/5). | What the documents actually are; no invented data. |
| 13 | Inventário (draft until Circular 05/2026): semicolon CSV, header row, dot decimals, CRLF, columns `ProductCategory;ProductCode;ProductDescription;ProductNumberCode;ClosingStockQuantity;UnitOfMeasure;ClosingStockValue;CostingMethod` (CMP). Stock = each store's last movement before local midnight after the date, summed per product; nothing held is left out; no stock = header only. | Portuguese inventory file's names and separator; swap the `InventoryFormat`, not the data, when the circular arrives. |
| 14 | Accountant export = real `.xlsx` (own ~200-line writer, no library), sheets Vendas / Compras / Recebimentos e pagamentos, Portuguese headers, base + IVA per rate (Cabinda separate), exempt base and codes, credit notes negative, annulled documents and cancelled purchases listed at 0, totals row. FT payment status "Por pagar" until phase 4. | Accountants in Angola work in Portuguese; Excel with real dates and number formats. Checked with openpyxl. |
| 15 | Reports page in the menu for owners and managers; managers export the whole business like the fiscal documents list allows. | Consistent with the existing fiscal list permissions. |
| 16 | Deadline reminders (Dashboard, Reports): monthly file from the 1st until 5 days after the 15th; inventory from 1 January until 5 days after 15 February; nothing once e-invoicing is active. | The country config's deadlines; no tracking of what was submitted. |
| 17 | `formatCalendarDate` for `YYYY-MM-DD` strings in the web (formats in UTC). | `formatDate("2026-10-15")` shows the 14th west of Greenwich. |

## Phase 4: credit and payables

The previous log left three questions open; answered here.

| # | Decision | Why |
|---|----------|-----|
| 1 | **Allocation: oldest first by default**, or chosen documents (API accepts explicit allocations; the UI uses oldest first). | What shops and accountants expect; explicit allocations cover the exceptions. |
| 2 | **No overpayment / money on account**: a payment can't exceed what's owed (400). | An advance (adiantamento) is its own document in Angola; not built yet. |
| 3 | **Currency**: the business currency only. | Plan: exchange fields only for non-AOA documents, later. |
| 4 | A sale on credit = `Sale.creditAmount > 0`, not a new PaymentMethod; all on credit = no payment legs (`paymentMethod` OTHER, receipts show "On account"). | Keeps payment-method reports and the SAF-T mechanism map about real money. |
| 5 | `creditLimit` null = **no credit at all**; over the limit is refused (no override). Only owners/managers set limits. | A manager can raise the limit in seconds; an override would make the limit meaningless. |
| 6 | Credit sales and receipts are **online only** and only where sales are fiscal documents (Angola). The FT is numbered/signed by the server (in the till's FT series when sold at a till). Offline uploads that carry credit are accepted without the limit check. | The limit needs the server's balance; never drop an offline upload. |
| 7 | What's paid at the till with a credit sale is a **receipt (RC) allocated to the sale's FT**, not FT payments. | That's what the document regime says an FT + payment is. |
| 8 | Receipts are **FiscalDocument rows (type RC)**: own series, hash-chained (SAF-T Payments has no Hash, but it costs nothing), immutable; allocations in `CustomerPaymentAllocation`, also immutable by trigger. Annul = status A, with VOID_SALE. | Reuses numbering, printing, listing and the immutability we already trust. |
| 9 | **Cash receipts need the receiver's open shift** (and cashiers need one for any method); the shift summary adds them to expected cash; receipts taken with a sale aren't counted twice. | Cash is in a drawer; the blind count must match. |
| 10 | Cancelling a credit sale annuls the FT **and its own deposit receipt**; if later receipts exist, refused until they're annulled. | The deposit goes back with the cancel; later payments are separate decisions. |
| 11 | A return on a sale on credit **lowers what's still owed first** (`Return.accountCredit`), the rest is money back (needing a shift only if cash). The NC's payments list only money given back. | Returning goods you haven't paid for shouldn't hand out cash. |
| 12 | Purchases: one or more **IVA lines** whose bases must add up to the net total; tax = base × rate rounded half-up to the cent unless the supplier's figure is given; **IVA cativo** % of the IVA; owed to supplier = total − cativo. Existing purchases were marked **paid** by the migration. The UI offers one rate per purchase (API takes several). | Mirrors the supplier annex and SAF-T Deductible; old purchases predate payables. |
| 13 | Supplier payments are not fiscal documents: **cancel** (kept, marked) instead of delete; business-level (no store), so a single-store accountant export leaves them out. | No AGT document for outgoing payments; supplier debts are per company. |
| 14 | The accountant workbook gets a 4th sheet in **AGT's "Anexo de Fornecedores" layout** (one row per IVA base), with "Linha de destino no Modelo" left for the accountant. | The template is in docs/saft-ao/examples; the model-line mapping isn't documented. |
| 15 | Customer card queries always refetch (`staleTime: 0`) and are invalidated after a sale. | Found by the desktop test: the 30 s cache showed a stale balance right after a credit sale. |

**Not done (later or for the owner):** due dates / payment terms on
invoices, interest, statements by email, supplier credit notes, advances,
a receipt slip on 80 mm (receipts print on A4 for now).

## Phase 5: purchases, history, printing

| # | Decision | Why |
|---|----------|-----|
| 1 | **Printer, paper width, calibration and default copies stay per till** (This device, already built). The store gets only: what a sale prints (slip or A4) and how many A4 copies. | They describe hardware; a store-wide printer name can't exist on every till. |
| 2 | **Print options** on every Print button: copies (1–5) and, in the Windows app, another printer — for that print only. | "Overridable per print" without touching the till's setup. |
| 3 | **"2ª Via"** from a server print log: the first print of a document anywhere is the original; every later print, on every copy, says "2ª Via". Offline prints at the till aren't logged (best-effort). | Fiscal documents are immutable (no counter column); a separate log also says who reprinted what. |
| 4 | First-print copies are labelled **Original / Duplicado / Triplicado** (store setting, max 3), each its own A4 page, sent as one print job. Slips print the same slip N times (one cut at the end). | Portuguese/Angolan practice; one job keeps them together. |
| 5 | Store set to **A4 after a sale**: with the till's auto-print on, the A4 document opens and prints its original; otherwise the A4 button is the main one. Offline sales (no server document yet) print the slip. | The FR is numbered/signed on the server or till; the A4 needs the stored document. |
| 6 | History lists need a store and are owner/manager only; dates are the store's calendar days (same rules as SAF-T); CSV exports up to 5 000 rows. | Consistent with the exports; keeps cashiers at the till. |
| 7 | Purchase A4 printout is an internal record, **not** a fiscal document (no hash, no AGT wording). | It's the supplier's document that's fiscal. |
| 8 | Chrome/Edge `--kiosk-printing` documented in the README for browser tills. | The plan asked for it; nothing to build. |

**Not run:** the desktop e2e `apps/desktop/e2e/angola-phase5.spec.ts` was
written but not run: it needs this branch's API from source on :4100, which
the system stopped for low memory, and I was told not to restart it on my
own. Run it with the API on :4100:
`POS_TEST_API_URL=http://localhost:4100 npx playwright test e2e/angola-phase5.spec.ts`.

## Phase 9: AGT e-invoicing

| # | Decision | Why |
|---|----------|-----|
| 1 | **Off unless the server is configured**: `AGT_EINVOICE_ENABLED=1` plus user, password and signing key; and the business's "electronic invoicing" setting. Either off: nothing is queued. Without keys the API logs an error and stays off (it still starts). | A flag, as the plan says; a half-configured server must not queue documents it can't send. |
| 2 | Default URL is AGT's **homologation** server; production is set explicitly with `AGT_EINVOICE_URL`. | Nothing reaches production by accident. |
| 3 | Only **registarFactura + obterEstado** are built. **solicitarSerie/listarSeries are not**: with e-invoicing, series must be requested from AGT, which changes how documents are numbered (today the till numbers its own series offline). **consultarFactura/listarFacturas/validarDocumento** are not built either (lookups and the buyer's confirmation; no screen needs them yet). | Numbering is the riskiest change in the system and needs its own phase and the owner's say; the two built services are what sending needs. |
| 4 | Documents queued: **FT, FR, NC, ND, RC**; not proformas, not purchases. | The spec's document types for registarFactura. |
| 5 | `operationType` per line: goods **TB**, services **SE** (others TB). | The spec lists the codes without saying which to use for a plain sale; a guess to confirm in homologation. |
| 6 | `companyName` in the document signature = **the buyer's name**. | The spec's field is ambiguous (issuer or customer); it sits with the customer's fields. To confirm in homologation. |
| 7 | Retries: 30 s doubling to 1 h; status checks 30 s growing to 10 min; **429/E98 waits 5 min**; obterEstado 9 resends the request. | The spec says to back off on E98 and not to poll aggressively. |
| 8 | A **rejected document is never resent**. It is corrected by issuing a new document (new number) and linking it on the AGT page; that one goes out with `documentStatus` C and `rejectedDocumentNo`. Must be the same type and not sent yet. | The spec: a rejected number can't be reused; corrections reference it. Fiscal documents are immutable here anyway. |
| 9 | Signing key for documents defaults to the software key (`AGT_DOCUMENT_KEY` can differ); minimum 2048 bits. Separate from the 1024-bit SAF-T hash key. | The spec asks RS256 with 2048+; the SAF-T hash key is a different, fixed requirement. |
| 10 | The queue runs inside the API (every 15 s, `AGT_QUEUE_INTERVAL_MS`; 0 disables the timer, for tests) and claims work by `nextAttemptAt`, so it survives restarts. | One process today; DB-backed so nothing is lost. |

**Not verified against AGT**: no homologation credentials, so everything was
tested against a fake AGT built from the published docs. The installed
v0.2.3 tills and the Docker API on :4000 are untouched (the flag is off by
default there anyway).

## Phase 10: reports

| # | Decision | Why |
|---|----------|-----|
| 1 | **Sales reports read the fiscal documents** (FT, FR, ND; NC subtract; annulled left out; dated by invoice date), not the `sales` table. The old dashboard keeps its own figures. | They then agree with the SAF-T file and the accountant's workbook, which is what the owner hands AGT. |
| 2 | **Cost for margin** = the sale's own unit cost for that product (what stock cost when sold; the original sale's for a return), else the product's cost price today. | The best figure available per line; fiscal lines don't carry a cost. |
| 3 | **Cashier** = who made the sale, or who processed the return for a credit note. Documents from neither are "—". | Fiscal documents don't record a user. |
| 4 | **Payment methods** from the documents' payments: FR and RC received, NC refunds paid out; invoices on credit (FT) are a separate "sold on account" table. | Same sources as the accountant's money sheet; credit isn't money received. |
| 5 | **Simplificado**: a second IVA table per Simplificado store: money received less refunds × the regime's rate (7%). | The regime's IVA is due on turnover actually received. |
| 6 | Stock valuation, low stock and balances are **as of now** (no period). Stock at a past date is the SAF-T inventory file. Balances are business-wide (an account isn't a store's). | Those are the questions those reports answer. |
| 7 | **No store = the whole business, owner only**; a manager must choose one of their stores. | Same rule as the history lists (phase 5). |
| 8 | **PDF** = the browser's/Windows' print dialog ("Save as PDF") on an A4 layout; **Print** = the till's A4 printer (Print options). No server-side PDF. | No PDF library in the stack; the A4 print path already exists and is tested. |
| 9 | CSV: one file per table; numbers plain (1234.50), dates ISO, codes translated, a Total row last. | Opens cleanly in Excel/LibreOffice in any locale. |
| 10 | The API returns generic tables (column key + kind); the web translates column names and formats cells. Adding a report is API-only plus its labels. | One viewer, one CSV and one A4 layout for all reports. |

**Not checked in a browser**: the API that has phase 10 runs only from
source, and the API on :4100 isn't running (see the summary). Type-check, lint and
unit tests pass; the screen should get a look when the API is up.

## Phase 11: UI

| # | Decision | Why |
|---|----------|-----|
| 1 | Display size is **saved on the server per person** (like their language), not per device. | Tills are shared: each person gets their own size on any till they sign in to. |
| 2 | **Four sizes**: 90, 100, 115, 130 % of the root font size (the app is sized in rem, so text, spacing and buttons all scale). | Enough range for older eyes and small screens without breaking layouts. |
| 3 | The control is a **button in both top bars** (back office and till), not only in Settings. | Cashiers have no Settings; it's a personal choice anyone may make. |
| 4 | **Print rules force the root size back to 100 %**; the Windows app's print window never had it. | The plan: printed documents (mm/pt) must not change. |
| 5 | Sidebar **16 rem** (from 14) with 20 px icons and 15 px labels. | The plan asks for wider with larger icons; 16 rem fits the longest Portuguese labels. |
| 6 | The installed v0.2.3 Windows app drops the new staff field (its schema strips unknown keys) until updated: offline PIN sign-ins there show normal size. | Harmless; updates bring it. |

**Not checked in a browser** (same reason as phase 10).

## CI

CI had been red since phase 6 (13 October): on a freshly seeded database
the demo store's prices include IVA, and three old suites priced sales as
price + tax; another used the UTC date for "today". Fixed in `e06caef`
(test helper `test/sale-total.ts`), checked on a throwaway freshly seeded
local database `pos_ci` (left in the local Postgres; drop it with
`DROP DATABASE pos_ci;` if unwanted). CI green again.

**Not done here, on purpose:** the always-on Docker API on :4000 (the
installed app's) was not rebuilt — it serves the installed v0.2.3 tills,
which phase 3+ already makes incompatible online; rebuilding it is the
owner's call with the 0.2.4 release. Desktop e2e ran against this branch's
API started from source on :4100 (`POS_TEST_API_URL`).

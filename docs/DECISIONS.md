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
- Found: 55 products at 0 % IVA without an exemption reason. **Fixed as
  you asked**: see "0 % products without an exemption reason" below.

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

## Four fixes from testing: dates, the POS cart, Back to POS, document language (2026-10-17)

### Dates: DD/MM/YYYY

| # | Decision | Why |
|---|----------|-----|
| 1 | **One helper**, `apps/web/src/lib/dates.ts` (re-exported by `lib/format.ts`): `formatDate`, `formatDateTime`, `formatCalendarDate`, `formatShortDate`, `formatMonth`, `parseDateInput`. The format comes from the **store's country** config (`locale`: AO → pt-AO → 17/10/2026 and 17/10/2026 14:05, always 24-hour), not the screen language: someone using English screens in an Angolan store sees the same dates as on the documents. With no country config, the screen language decides. | Your rule: one helper, by country, nothing hardcoded. |
| 2 | Every date shown went through it: sales, invoices, purchases, shifts, reports (screen, A4/PDF, CSV), customers' and suppliers' accounts, AGT page, drawer events, inventory, transfers, returns, expenses, tills, This device, the SAF-T deadlines, receipts, A4 documents, quotes, shift reports. "Long" dates ("17 de outubro de 2026") became DD/MM/YYYY too. | "Every date". |
| 3 | Not dates, so not DD/MM/YYYY: a **month** in words ("outubro de 2026", report rows by month, SAF-T deadline "covers"), and **chart axes**, which show DD/MM (the year is in the title; tooltips show the full date). | Readability; say if you want MM/YYYY or the year on the axes. |
| 4 | **Date fields** (`components/ui/date-input.tsx`, all 12 of them): typed as DD/MM/YYYY (also 17-10-2026, 17.10.2026, 1/2/2026, 17102026, and ISO when pasted), with a calendar button. Half-typed or impossible dates (31/02) are refused and the field goes back to the last good date when left. The value in and out stays ISO. The browser's own date field showed the computer's format (MM/DD/YYYY on an English Windows), so it's only used for its calendar. The **month** picker on Reports → Files is still the browser's own. | Your rule: type DD/MM/YYYY. |
| 5 | **Exports for people**: report CSVs write dates as DD/MM/YYYY (amounts stay plain numbers, so spreadsheets can add them); the accountant's Excel workbook keeps real date cells, now shown dd/mm/yyyy. File names keep ISO dates (`SAFT-AO-…_2025-12-31.csv`): they sort. | |
| 6 | **Untouched, still ISO**: SAF-T XML, AGT payloads, the hash/signature message, the QR, the database, the API, the period logic. Tests check it (SAF-T and AGT specs, `xlsx.spec.ts`). | Your rule. |

### The POS cart survives navigation, restarts and crashes

| # | Decision | Why |
|---|----------|-----|
| 7 | The sale in progress lives in a **saved cart** (`features/pos/cart-store.ts`, browser storage of the till, written at every change): items, quantities, line and sale discounts, changed prices, managers' approvals, the customer, the receipt email, credit and amount paid now, the payment method, split rows and the **cash typed**, and a pro-forma being sold. | Your list, "exactly as they were". |
| 8 | **One cart per till, store and person** (key: till id, or "browser"; store; user). Someone else signing in on the same till (password or PIN, after a lock too) gets their own, never the last person's; the first person's is still there when they're back. Switching store switches cart. | "Not see or inherit"; nothing lost either. |
| 9 | **Cleared only** when the sale completes, on **Clear cart** (the explicit cancel), or when held ("Deixar pendente"). | Your rule. |
| 10 | **Log out or Close the till with items in the cart** asks first: "Há uma venda no carrinho": **Deixar pendente** (it becomes a held order, then carries on), **Cancelar** (the sale is dropped, then carries on), or **Voltar à venda** (stays). Logging out from the back office goes to the POS to ask. Then the usual flow (with a shift open: blind count, report, sign out). | Your rule. "Cancelar" cancels the sale, not the logout; "Voltar à venda" is there so nobody is forced to choose. |
| 11 | Held orders are still shared by the store's cashiers on that till, as before: parking a sale is the way to hand it over. | |
| 12 | The completed-sale dialog isn't kept: once sold, the receipt is in Sales / Recent sales. | |

### Back to the POS

| # | Decision | Why |
|---|----------|-----|
| 13 | **"Voltar ao POS"** in the back office's top bar (Settings, Dashboard, Products, Customers… every page) once you came from the POS or while there's a sale in the cart; it shows the cart's item count and goes back to the same sale (the cart of point 7). On **This device** (the till's settings, the gear in the POS top bar) the top-left link is now "← Voltar ao POS". The sidebar's "Point of Sale" link also returns to the same sale. | Your point 3: every way out of the POS comes back to the same sale. |

### Documents in the store's language

| # | Decision | Why |
|---|----------|-----|
| 14 | **New per-store setting "Idioma dos documentos"** (Settings → Stores → edit a store): "From the country: Português (Angola)" by default, or any language. Stored as `stores.documentLanguage`, null = the country's (`documentLanguageFor` in the shared and API country helpers: the store's choice, else its country's `defaultLanguage`, else the business's). Migration `20261017090000_store_document_language`. | Your point 4; other countries get theirs from their config. |
| 15 | The business-wide "Language of receipts and invoices" in Settings is **gone from the screen** (a line points to Stores). The column stays as the fallback for countries without a config and for emails not about one store (password reset, staff invite). | One place to set it. |
| 16 | In the store's document language, **whatever the user's screen language**: receipts and fiscal receipts, A4 documents (Factura, Factura-Recibo, Recibo, Notas de Crédito/Débito, Pró-forma), quotes, the old A4 invoices, the **shift close report**, **Reports** when printed / saved as PDF / exported to CSV, the Sales / Purchases / Inventory / stock-at-date CSVs, the Dashboard's CSV and PDF, the customer display, and the **receipt email** to customers. The screens themselves stay in each person's language (a report on screen is in yours; its print, PDF and CSV in the store's). | Your rule. |
| 17 | pt-AO wording on A4 documents: **"Total Ilíquido"** and **"Total Imposto"** (were "Total sem IVA" / "Total de IVA", still used in pt-PT). "Troco", the amount in words and exemption texts were already Portuguese. | Your list. |
| 18 | The accountant's Excel and SAF-T were already Portuguese; unchanged. | |
| 19 | Templates checked for hardcoded English: none left. Every document label comes from the translation files, so any language added later is complete or caught by the key-parity test. | |

**Tests added**: `lib/dates.test.ts` (DD/MM/YYYY with English screens,
24-hour times, typed input, impossible dates), `features/pos/cart-store.test.ts`
(kept with everything, survives a restart, cleared, not shared between
users, one per till/store/person), `i18n/document-language.test.tsx`
(renders an AO Factura-Recibo, a report on A4 and a shift report with the
screens in English and fails on any English label, using the English
texts Portuguese says differently; checked that it does fail when the
documents are English), `xlsx.spec.ts` (dd/mm/yyyy cells), `countries.spec.ts`
(document language). Desktop e2e updated where documents are now in
Portuguese (receipt discount, shift report, receipt RC, customer display)
and where the inventory date field now shows 31/12/YYYY; `logOut` cancels
a sale left in the cart.

**Desktop e2e (after you restarted :4100 with the migration)**: full suite
**119 passed, 3 skipped** (the usual conditional skips). New
`cart-and-documents.spec.ts`: a sale with two products, a quantity, cash
typed and an email survives Dashboard, Settings, This device and Products
and back via "Back to POS", and closing and reopening the app; Log out asks,
"Hold order" parks it and the cashier signing in next gets an empty cart; a
completed sale empties the cart; its receipt is Factura-Recibo in
Portuguese with a DD/MM/YYYY HH:mm date while the screens are English; the
Sales date field shows and takes DD/MM/YYYY. Older specs updated because
receipts, the slip of a cancelled sale, the pole and the shift report are
now Portuguese ("A crédito", "0,5 kg", "*** ANULADA ***", "PAGO / TROCO"),
and `getByLabel("Date")` now needs `exact` (the calendar button is "Pick a
date").

**Changes in behaviour you'll notice**: on the demo store, receipts and
reports were English (the business language was "en"); they're now
Portuguese, since the store is in Angola. To get English documents back,
set the store's "Idioma dos documentos" to English.

---

## 0 % products without an exemption reason (2026-10-16)

Your instructions: a 0 % / Isento product must have an M-code; never
default to 0 %; regime stores get M00/M04; fix the demo data by rule; a
review list and a till block for real stores; issued documents untouched.

| # | Decision | Why |
|---|----------|-----|
| 1 | **One rule, shared by API and app** (`lacksExemptionReason` in the country helpers): a line at 0 % needs a code from the country's exemption table. Only where the country has one (AO); a business without country rules is unchanged. | The till (offline too) and the server must agree. |
| 2 | **API refuses** a product with `taxRate: 0`, or exempt with no reason (`taxRateId: null, exemptionCode: null`): "A product exempt from IVA (0%) needs an exemption reason (M-code)", in Portuguese with `X-Language` (pt-PT: "Um produto isento de IVA (0%) tem de ter o motivo de isenção (código M, por exemplo M10)"). The product form says the same under the reason field. | Your rule 1. |
| 3 | **New products start on the default rate** (the business's default tax rate, Taxa geral 14 %; the country's default if its rates aren't created yet), in the API, the form (it already did) and the CSV import. The old business-wide "Default tax %" (0 by default, and what the CSV import used: the likely source of the 0 % products) is hidden in Settings for countries with tax rates. | Your rule 1: never 0 % by default. |
| 4 | **CSV import**: a new optional **Exemption** column ("Motivo de isenção"); a 0 % row needs a known code (preview error, and the server skips it otherwise); a code alone means 0 %; a code with a rate above 0 is ignored. Template and product export include the column. | Imports were the other way in for 0 % products. |
| 5 | **Regime stores**: every line gets 0 % with M00 (Simplificado) or M04 (Exclusão) from the store's regime, whatever the product says, so they need no per-product reason. This was already how `lineTax` worked (phase 6); now tested for both, including a product exempt without a reason. | Your rule 2. |
| 6 | **No fiscal document with an exempt line lacking its M-code**: refused where every document line is built (`documentLine`), so sales, proformas, invoices and credit notes alike; the sale path checks first, before anything is saved. Message: `"X" is exempt from IVA without a reason: a manager must fix the product first` (pt-PT: "… um gestor tem de corrigir o produto (Produtos → Produtos a rever) antes de o vender"). | Your rule 4. A credit note for one of the old demo documents without a code is refused too (the note would repeat the missing code). |
| 7 | **The till blocks Charge** while the cart has such a product, with the same message, offline too (it uses the saved catalog). Offline sales now send the exemption code the till printed, so the server records that reason even if the product changed since. | Your rule 4. |
| 7b | An offline sale from a till **without** this update (v0.2.3) that charged 0 % with no reason is refused when it syncs and stays in that till's outbox. | Those tills already can't sell online against this API (phase 3); 0.2.4 sends the reason. |
| 8 | **"Produtos a rever"**: a banner on the Products page with the count and "Show only these" (also `/products?review=1`); each product already showed "Exempt, no reason given". Not a separate page: fixing is opening the product. | Your rule 4, where the fixing happens. |
| 9 | **SAF-T**: the writer refuses to write an exempt line without `TaxExemptionCode`, and the export answers 400 naming the documents ("Documentos com linhas isentas sem motivo de isenção: …"). | Your rule 6; a file without the code would be refused by AGT anyway. |
| 10 | **AGT**: a queued document with such a line is held back (stays "Waiting to send" with "Not sent: an exempt line has no exemption reason (M-code)", looked at again daily), never sent. | "Don't send a document without an M-code." Only old documents can be like that. |
| 11 | Real customer stores' products are **never changed automatically**. | Your rule 4. |

**Demo data, fixed by rule** (local databases `pos` and `pos_ci` only; the
script is a one-off, not a migration):

| Products | Was | Now |
|---|---|---|
| Demo store, Bakery / Dairy / Meat & Seafood / Produce (22) | 0 %, no reason | **Isento M10** (bens alimentares) |
| Old test leftovers that are food: "Queijo da Serra" (1), "Arroz" (2), "Coffee", "Green tea", "Tea" | 0 %, no reason | **Isento M10** |
| Everything else at 0 % without a reason: "Lavender soap" ×22 (archived test leftovers), "szdf", and test leftovers "CAP", "Drawer Widget", "Soap", "Gum" (27) | 0 %, no reason | **14 % Taxa geral** |
| Medicines (M11), books (M13) | none in the data | — |
| Demo store's other products (50) | 8 % (not an Angolan rate) | **14 % Taxa geral** (beyond the 55, so the demo matches the seed) |

Coffee and tea counted as food. Beverages, Snacks and Frozen Foods were
already taxed (8 %) and stay taxed (now 14 %): they aren't basic foods of
Anexo I, so I didn't make them exempt. "Coloring Book" (Toys & Games) stays
14 %: it's sold as a toy, not a book.

**Seed** (`apps/api/prisma/seed.ts`): new demo stores get the AO tax rates,
the four food categories as Isento M10, everything else 14 % Taxa geral
linked to that rate.

**Issued documents stay as they are** (immutable). The local demo has
**203 exempt lines without a code**, in documents issued on 15–16 October
2026 (pre-certification test data). Consequence: a SAF-T invoicing file for
October 2026 of the demo store is refused (it lists them), and credit notes
for those documents are refused. Neither matters for real stores, which
can't create such documents any more.

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

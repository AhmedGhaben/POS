# Angola launch: fiscal documents, IVA, checkout, credit, AGT

**Status:** approved 2026-10-13; additions A (SAF-T) and B (shifts)
approved the same day (decisions at the end). Built phase by phase in
the order 1 → 2 → 3 → 7 → 6 → 8 → 8b → 4 → 5 → 9 → 10 → 11 (tax per
product needs the country config; credit sales need FT/RC; SAF-T reads
the fiscal documents). Reference files: `docs/saft-ao/` (XSD, decrees,
exemption table, examples). After each phase: lint,
typecheck, unit + e2e tests, new tests for the business logic, README,
commit and push.

**Progress:**
- **Phase 1 (bugs) is built** (2026-10-13). Account switch: every
  cached query is reset when the signed-in person changes
  (`features/auth/user-scope.ts`) and the permissions query is keyed by
  person. Dropdowns: `CommandItem` matches `data-[disabled=true]`.
  Tests: web unit `user-scope.test.ts` (4), desktop e2e
  `angola-phase1.spec.ts` (2; each fails without its fix).
- **Phase 2 (one combobox) is built** (2026-10-13).
  `components/ui/combobox.tsx` replaces every Radix `<Select>` (the
  component and `@radix-ui/react-select` are gone) and the POS customer
  picker. Its own filter ignores case and accents and matches name,
  secondary text (codes, rates) and keywords (`combobox-filter.ts`);
  `allowOther` adds "Outro: <typed text>"; `clearLabel` adds a "none"
  entry (category, store). Fixed on the way: a combobox is named by its
  label, not its text, so unlabelled ones fall back to an aria-label; Radix
  selected the search text on open, so the 2nd key typed replaced the
  1st. Tests: web unit `combobox-filter.test.ts` (5), desktop e2e
  `angola-phase2.spec.ts` (3). "Outro" gets its first real use with banks
  (phase 7).
- **Phase 3 (checkout + shifts) is built** (2026-10-13). Migration
  `20261013120000_angola_phase3_checkout` (its partial unique index on
  final consumers isn't in the Prisma schema: strip it from future
  `migrate diff` output). As planned, plus:
  - Manager override: `overrides` module (global), `X-Override-Token` on
    guarded routes, `{ permission, token }[]` on sales, offline approvals
    on till uploads (guard accepts `offlineOverride` only with the till's
    key). A wrong approver PIN is a 403 with `code` WRONG_PIN/PIN_LOCKED,
    never 401 (the web client treats 401 as an expired session). Every
    approval also carries the approver's id, so a sale that falls back to
    the outbox uploads them as offline approvals. Desktop IPC
    `approval:approvers` / `approval:check` check PINs offline without
    signing anyone in.
  - Shifts: online sales need an open shift opened by that cashier on that
    till; offline uploads (even old ones without a shift) are kept, an
    unknown shift is a 409 the outbox retries. Close: by the opener or a
    manager (forced, audit-logged), optional note/coin count
    (`features/shifts/denominations.ts`; moves to the country config in
    phase 7), flagged over `Business.shiftDifferenceThreshold`, report can
    list every sale, and the cashier is signed out after. Log out with a
    shift open goes into the close flow (`features/shifts/close-request.ts`).
    A shift someone else left open shows a panel; managers can close it.
  - Price change at the till (`PriceDialog`, `SaleLineItem.originalUnitPrice`),
    customer card (`GET /customers/:id/card`), products as tiles or a list,
    held orders keep their approvals.
  - Tests: API unit 131 (incl. sales shift/override/price, shift helpers,
    guard), API e2e 130 incl. `angola-phase3.e2e-spec.ts` (11) with shared
    `test/cleanup.ts` + `test/shift-helper.ts`; web unit 98 (+ held
    orders, quantity, denominations); desktop e2e incl.
    `angola-phase3.spec.ts` (4); the desktop helpers open a shift and
    `logOut` finishes the close flow.
- **Phase 7 (country config, company data) is built** (2026-10-13).
  Migration `20261013180000_angola_phase7_country_config` (money columns
  Decimal(14,2); existing stores keep `pricesIncludeTax` off, new ones
  start on). Notes:
  - `packages/shared/src/countries/` (types, `ao.ts`, generated
    `ao-exemptions.ts`, helpers); the API copy in `apps/api/src/countries/`
    must stay byte-identical (`countries.spec.ts`). Exemptions are generated
    from the AGT JSON by a script (legal text verbatim, our labels).
  - Still to confirm: the IS (S01–S03) and IEC (I01–I16) exemption texts
    (placeholders marked `unconfirmed`, never offered), the day of the
    month the SAF-T invoicing file is due (15th as a placeholder), and the
    province codes of the four provinces created in 2024 (CD, CB, IB, ML).
  - Tax rates are per business (`TaxRate`), seeded from the config on first
    read; owner edits. The IVA-inclusive pricing itself comes with tax per
    product in phase 6; phase 7 only stores the setting.
  - pt-AO: built at runtime from pt-PT (`i18n/ao-spelling.ts` +
    `pt-ao-overrides.ts`); the API applies the same rules to messages and
    emails (`common/i18n/ao-spelling.ts`, byte-identical, tested).
  - Tests: API unit 146 (config, IBAN, pt-AO), API e2e incl.
    `angola-phase7.e2e-spec.ts` (8), web unit 101 (spelling), desktop e2e
    `angola-phase7.spec.ts` (5).
- **Phase 6 (products, tax, units, stock) is built** (2026-10-14).
  Migration `20261014090000_angola_phase6_products`. Notes:
  - Pricing (`packages/shared/src/pricing.ts`, byte-identical API copy):
    `taxIncluded` option, tax per line rounded up (decision 6), quantities
    counted in thousandths. This also changed the rounding for stores
    pricing without tax (round → ceil, as decided). `Sale.pricesIncludeTax`
    records the mode; with it, total = subtotal − discounts. Revenue in
    reports is now `total − taxTotal` (net in both modes).
  - Tax per line: `lineTax()` in the country helpers (regime exemption
    beats the product). Product keeps `taxRate` in step with its
    `taxRateId`; sale lines snapshot rate, code, exemption, unit, unit cost.
    Offline uploads send `offline.pricesIncludeTax`; older tills that don't
    get the store's setting.
  - Stock: every change goes through `stock/stock.ts#recordMovement` (row
    lock, weighted average in `stock/costing.ts`, `StockMovement` row with
    unit cost, balance and average after). Existing stock got an OPENING
    movement at its cost price when the migration ran; stock at earlier
    dates isn't known. FIFO later: lots can hang off movements.
  - Quantities are `Decimal(14,3)` and come back from the API as strings.
  - Photos: `ProductPhoto` (bytea), served publicly at
    `/product-photos/:id` by a random id that changes on every upload.
  - Still open: weight/price-embedded scale barcodes (decision 8: later);
    a Unit column in the CSV import; the AGT inventory types (draft).
  - Tests: API unit 161 (pricing parity incl. tax-in, costing, sales tax
    and units, transfers at average cost), API e2e 156 incl.
    `angola-phase6.e2e-spec.ts` (18), web unit 110 (pricing with IVA,
    decimal quantities, product tax choice), desktop e2e
    `angola-phase6.spec.ts` (5).
- **Phase 8 (fiscal documents) is built** (2026-10-15). Migration
  `20261015090000_angola_phase8_fiscal_documents` (with the immutability
  triggers: they aren't in the Prisma schema, so `migrate diff` won't show
  them; test clean-up sets `pos.allow_fiscal_delete`). Notes:
  - `src/fiscal/`: `signature.ts` (SignatureProvider, RSA-SHA1, test
    vectors with the test key in `fiscal/testing/`, never valid in
    production), `fiscal.service.ts` (series, numbering, hash chain, FR /
    NC / PF, annulment), `document-lines.ts` (amounts without tax per line).
    Issued only where the store's country has a fiscal config (Angola).
  - Numbering on the till: the till sends `fiscal: { series, number }`; the
    server refuses a number ahead (409 FISCAL_NUMBER_AHEAD, the queue
    waits: 409s are now retried) or used (422 FISCAL_NUMBER_USED with the
    next number; the till adopts it and retries once). A till that never
    read its series doesn't number (the server does), so a reinstall can't
    reuse numbers. The hash is computed on the server when the sale
    arrives (the private key stays there); an offline receipt has the
    number but not the 4 hash characters.
  - Annulment reasons: the till's cancel reasons map to a Portuguese text
    (`ANNULMENT_REASONS`). The original spec's "reason I/N" isn't in the
    documents we have: to confirm.
  - The AGT QR link is longer than QR version 4 holds: error correction M,
    smallest version that fits, drawn as inline SVG (prints immediately).
  - New businesses still default to USD even in Angola (registration):
    to change with the onboarding.
  - Tests: API unit 174 (hash vectors, chain, lines, dates), API e2e incl.
    `angola-phase8.e2e-spec.ts` (12), web unit 118 (amount in words, till
    numbering, queue waits on 409), desktop e2e `angola-phase8.spec.ts` (3).
- **Phase 8 follow-ups from the owner** (2026-10-15): see below
- **Phase 8b (SAF-T export) started** (2026-10-15):
  - API: `SaftExportService` builds SAF-T XML manually, no external lib
    dependencies, with proper Header, MasterFiles (Customer, Supplier,
    Product, TaxTable), SourceDocuments (SalesInvoices). Endpoint
    `POST /fiscal-documents/saft/export` returns XML file for download.
  - Web: Reports page with SaftExportDialog for date range and store
    selection, radio buttons for Facturação / Inventários type. Desktop
    and web both build.
  - Translation keys added in en, pt-PT, pt-BR.
  - Still to do:
    - Validate XML against SAFTAO1.01_01.xsd (libxml2-wasm or similar)
    - SAF-T Inventários export (draft, pending circular from AGT)
    - Accountant export (Excel/CSV)
    - Handle N annulment text (58 chars) vs SAF-T Reason (50 char limit)
    - Real phone scans of 58 mm and 80 mm thermal prints

- **Phase 8 follow-ups (from the owner, 2026-10-15):**
  - Annulment reasons are AGT's (DS.120 4.1.6 documentCancelReason, DP
    71/25 art. 8.º n.ºs 8-9): I (wrong customer identification) and N
    (document never sent/delivered). Cancel reasons `ANNUL_I` / `ANNUL_N`;
    any other cancel of an FR is refused (make a return). The wording is in
    the country config (`annulmentReasons`); N's is 58 characters, longer
    than SAF-T Reason's 50: phase 8b exports it truncated or by code.
  - Signing moved to the till (`apps/desktop/src/fiscal-signing.ts`): key
    from `GET /fiscal-documents/signing-key` (till key only, audit-logged,
    blocked for the page by the forwarder), DPAPI via safeStorage, signs
    via IPC. Documents record `signedBy` (TILL/SERVER) and `chainVerified`;
    `FiscalChainAlert` holds breaks. One software key for every till (AGT
    certifies the producer's key); rotation is a new SAFT_KEY_VERSION.
  - QR: PNG 350 px, quiet zone, byte mode; version 8. Logo off
    (`QR_CENTER_LOGO`), to confirm with AGT. Real phone scans of 58/80 mm
    prints still to do by hand.
  - Currency/defaults from the country at sign-up (AOA, pt-AO,
    Africa/Luanda, regime); migration `20261015120000_angola_country_defaults`
    fixes existing Angolan businesses; AOA prints "Kz" (`currencyLabel`).

## Decisions (from the owner, 2026-10-13)

1. **Regime Simplificado**: documents are exempt: IVA 0%, taxCode ISE,
   exemption M00 "IVA – Regime Simplificado" on every line. The 7% on
   turnover actually received only appears in reports (IVA summary).
   **Regime de Exclusão** works the same with M04 "IVA – Regime de
   Exclusão".
2. **Rates** are data in the AO config (admin can edit), never tied to
   products in code; the user picks one per product (name first, rate as
   secondary text):
   - 14% Taxa geral (NOR), the default for Regime Geral.
   - 5% Taxa reduzida (RED): cesta básica (annex of Lei 14/23); from OGE
     2026 also industrial equipment sold by the manufacturer with AGT
     approval.
   - 7% Taxa intermédia (INT): hotel and restaurant services. Flagged
     "verify validity" (temporary measure).
   - 1% Cabinda (taxCountryRegion "AO-CAB"): only offered when the store
     is in Cabinda.
3. **Not certified yet**: "DOCUMENTO SEM VALIDADE FISCAL" watermark until
   a certificate number is configured. Phase 9 behind a feature flag,
   against the homologation endpoint.
4. **Imposto de Selo**: later. The tax model supports several taxes per
   line (IVA / IS / IEC / NS, S01–S03, I01–I16) now; IVA is the only UI.
5. **Series**: one per till per document type per year (e.g.
   `FR POS1-2026/57`), gap-free, numbered on the till so it works offline.
   Registrable with AGT later (solicitarSerie). A new till gets a new
   series; a series is never reused or renumbered.
6. **Prices include IVA** (store setting, default ON). The net unit price
   is derived because documents and AGT need it. Per line:
   `tax = ceil-to-cent(gross × rate / (100 + rate))`, `net = gross − tax`,
   so base + tax always equals the shelf price. With the setting off:
   `tax = ceil-to-cent(net × rate / 100)`.
7. **Shifts**: one open shift per till at a time. Cashiers sharing a till
   each open their own shift and close it with a blind count before the
   next opens theirs. Several tills in one store work independently
   (tested).
8. **Decimal quantities** (3 decimals) with a unit per product (un, kg,
   g, l, m, cx). "un" stays whole numbers. Scale/weight barcodes: later.
9. **Warehouse** = the store for now; a separate warehouse entity later.

## Phases

### 1. Bugs
- Account switch keeps old permissions: the permissions/business queries
  are not keyed by user and stay fresh for 5 min, so `ProtectedRoute`
  copies the previous person's cached map into the store. Key them by
  user and drop user-scoped queries when the signed-in person changes.
- Dropdown items ignore the mouse: cmdk 1.x always sets
  `data-disabled="false"` and our `CommandItem` uses
  `data-[disabled]:pointer-events-none`. Use `data-[disabled=true]`.

### 2. One searchable combobox
Shared `<Combobox>` (cmdk): type to filter, mouse or arrows + Enter, Esc
closes, label + secondary text (code), optional "Outro" free text,
form-friendly. Replaces every Radix `<Select>` and native select.

### 3. Checkout
Typed quantity on a line and a `3*<barcode or name>` shortcut; held
orders ("Deixar pendente" / "Vendas pendentes") kept on the till (no
stock, no number), resuming one holds whatever is in the till first;
amount received + live Troco, blocked when short (unless split),
"Pagamento"/"Troco" printed; `trackStock` flag (non-tracked items never
move stock, never in low-stock); "Consumidor Final" (NIF 999999999) as a
real customer per business, used when none is chosen; list/grid view;
customer card (contact, NIF, totals, last sales; balances come in 4).
Product photos wait for phase 6 (no image storage yet).

**Manager override.** New permissions `SELL_ON_CREDIT`, `CHANGE_PRICE`,
`CASH_OUT`, `DISCOUNT_ABOVE_LIMIT` (owner + manager by default; the
maximum discount then applies to whoever lacks it). Returns/credit notes
keep `PROCESS_RETURN`, annulment keeps `VOID_SALE` (no duplicate
permissions). A user without the permission gets a popup: pick an
approver who has it, type their PIN. Online the server checks it and
issues a single-use, 5-minute token bound to that permission and cashier
(`ManagerOverride` row: action, cashier, approver, time, details), sent
as `X-Override-Token`; the permissions guard and the sale's discount /
price checks accept it once. Offline the till checks the PIN against its
saved staff list and the upload carries the approver, recorded as an
offline override. The cashier stays signed in; the popup never touches
the shift. Every override is also in the audit log.

**Shifts enforced (addition B).** Found: shifts are opt-in
(`Business.shiftsEnabled` defaults off), the API saves a sale with
`shiftId: null` when the till sends no `shiftClientId`, and a return
loses its shift when it's missing or closed. Changes:
- Always on: the setting goes, existing businesses are migrated. The
  till opens a shift with the opening float (fundo de caixa) before any
  sale, return or payment; the API refuses those without an open shift on
  that till (an offline upload whose shift is still syncing waits in the
  outbox, it's never dropped). One open shift per till; every document
  and payment records shift, cashier and till. Exception: a return with
  no cash back (to the customer's balance, by transfer) can be done from
  the back office without a shift, linked to user and store (decision
  A/B 5); a cash refund needs an open shift at a till.
- The shift belongs to the cashier who opened it. Another person signing
  in on that till can't sell until it's closed; a manager can force-close
  an abandoned shift (entering the count; logged as forced).
- Cash in / cash out with a reason (e.g. to the safe); cash out needs
  `CASH_OUT` or a manager override.
- Closing ("Fechar turno", or Log out — a cashier can't log out with a
  shift open, Log out goes into the close flow): blind count, optionally
  by note/coin (denominations in the country config), without seeing the
  expected amount. Then expected = float + cash sales − cash change/refunds
  + cash in − cash out; counted, expected and difference (sobra/falta)
  stored; card, transfer and credit-sale totals shown for reference; the
  shift ends, the cashier is signed out, and the close report (Fecho de
  turno) prints, optionally with the full list of sales.
- App closed or crashed with a shift open: it stays open and resumes for
  the same cashier (the shift is kept on the till and on the server).
- Differences above a configurable threshold (business setting) are
  flagged; the Shifts page lists open/closed shifts by cashier and till
  with differences and the flag (Reports in phase 10).
- Tests: expected-cash calculation, sales refused without a shift, one
  open shift per till, close flow with blind count, crash/resume,
  force-close, logout-goes-to-close.

### 7. Country config & company settings
Typed `CountryConfig` registry (`packages/shared/src/countries/ao.ts`):
currency, number format, regimes, rates, exemption tables (M/S/I),
banks, legal forms, document types, QR URL. `Store.country` +
`Store.ivaRegime` + `pricesIncludeTax` (regime change admin-only,
logged); `Business.legalForm`, `commercialRegistration`; alphanumeric
NIF; `BankAccount` table; `pt-AO` locale falling back to `pt-PT`
(Angola keeps "Factura"). Money columns widen to Decimal(14,2).
For SAF-T (8b): structured addresses (street, building, city, postal
code, province, country) on business, store, customer and supplier;
CAE on the business; supplier NIF; payment methods transfer and
Multicaixa; cash denominations (notes/coins) for the blind count;
"e-invoicing active" setting; SAF-T deadlines.

### 6. Products
Category create/edit/delete (reassign on delete); scanner-safe barcode
field; duplicate barcode check; tax chosen by name
(`taxCode`, `taxRate`, `exemptionCode`); unit of measure + decimal
quantities. Product photos (grid with photos). For SAF-T (8b): SAF-T
product type P/S/O/E/I, inventory product type, store costing method
with the weighted average cost per store (book value), stock at a date.
Photo → barcode → Open Food Facts: last, ask first.

### 8. Fiscal documents
`DocumentSeries`, `FiscalDocument` (type, series, sequence, documentNo,
status N/A, cancel reason I/N, seller/buyer snapshot, totals, refs),
`FiscalDocumentLine`, `FiscalDocumentLineTax`. Every completed sale → one
FR (cash) or FT (credit); returns → NC referencing document + line;
Proforma (non-fiscal) convertible. Immutable (no update/delete routes +
DB trigger). Old `INV-…` invoices stay readable as legacy. Cancel becomes
annulment with reason I/N only; anything else is an NC. Number to words
(pt), AGT QR (v4, ECC M, 350 px), A4 + 80/58 mm layouts.

### 8b. SAF-T (AO) exports and accountant export (addition A; after 8)
**SAF-T (AO) Facturação** (`TaxAccountingBasis` "F"), built against
`docs/saft-ao/xsd/SAFTAO1.01_01.xsd` (namespace
`urn:OECD:StandardAuditFile-Tax:AO_1.01_01`) with the field rules of
Decreto Executivo 317/20. Every generated file is validated against the
XSD in tests (libxml2 via `xmllint-wasm` or similar, no network).
- Header (company, NIF, address, fiscal year, period, AOA, software:
  ProductCompanyTaxID, ProductID, ProductVersion,
  SoftwareValidationNumber "0" until certified).
- MasterFiles: Customer (incl. Consumidor Final 999999999), Supplier,
  Product, TaxTable (rates + exemption codes in use).
- SourceDocuments: SalesInvoices (FT, FR, ND, NC, … with lines, taxes,
  exemption code/reason, References for NC, Settlement, Payment
  mechanism, totals), WorkingDocuments (proformas/orçamentos: WorkType
  PF/OR), Payments (RC), PurchaseInvoices (with Deductible per base).
- Required monthly while e-invoicing isn't live (our case until
  certification). Business setting "e-invoicing active" turns the
  monthly reminder off; the export stays available on demand.

**Gaps against the XSD / decree** (filled in phases 7/6/8 as noted):
- Hash + HashControl on every sales document, payment and working
  document (mandatory). HashControl is "0" while the software isn't
  validated; the printed document shows the 4 Hash characters. The hash
  chain per series is built in phase 8 (algorithm: see open question 1).
- `Period`, `SystemEntryDate`, `SourceID` (user), `InvoiceStatusDate`,
  `SourceBilling` (P/I/M): phase 8 document fields.
- Structured addresses (street, building, city, postal code, province,
  country) on Business, Store, Customer, Supplier — today one free-text
  line. Province from the AGT list (the DP annex has it). Phase 7.
- `EACCode` (CAE) on the business: phase 7.
- Supplier NIF; on purchases the supplier's document type, number, date,
  the 4 hash characters from it, IVA per base with deductible % and type,
  IVA cativo (withholding): phase 4 (purchase payments) / 7.
- Product: `ProductType` P/S/O/E/I (derived default: tracked → P, not
  tracked → S, editable), `ProductGroup` = category,
  `ProductNumberCode` = barcode: phase 6.
- Payment mechanism codes (NU cash, CC/CD cards, TB transfer, MB
  Multicaixa ref., OU other): our PaymentMethod needs transfer and
  Multicaixa (open question 4). Phase 7.
- Money columns Decimal(14,2) (phase 7); currency exchange fields only
  for non-AOA documents (later).

**SAF-T de Inventários** — NOT in this XSD (Circular n.º
05/GACA/GJ/DSF/AGT/2026; XML, JSON or CSV/Excel via the Portal do
Contribuinte). Every company submits it (stock at 31 Dec, due 15 Feb); a
company with no stock submits a "no stock" file. Data model + draft
exporter with the known fields: product code, description, inventory
product type, quantity at 31 Dec, unit, total book value, costing
method. Only stock-tracked products. The exact format sits behind an
adapter; **draft until the owner provides the circular.** Needs:
- Product "inventory type" (mercadoria, matéria-prima/subsidiária,
  produto acabado/intermédio, subproduto/desperdício, produto em curso;
  list to confirm against the circular): phase 6.
- Store "costing method" (custo médio ponderado / FIFO) and the book
  value it implies: weighted average cost per store updated on every
  purchase (and FIFO cost layers, see open question 3); stock at a date
  from the stock movements: phase 6.

**Exportar para contabilista** (Reports; instead of SAF-T
Contabilidade, which we don't build): Excel/CSV for a period — sales
documents sheet and purchases sheet, one row per document: date, number,
type, customer/supplier NIF and name, net, IVA per rate, exemption code,
total, payment status (purchases columns follow the IVA return's "Anexo
de Fornecedores": deductible %/value, IVA cativo); plus a payments
received/made sheet. The SAF-T Facturação file stays the main thing
accountants import, so it gets the most care.

**UI**: Reports → "Ficheiros SAF-T": type (Facturação / Inventário),
period (month / year-end), company or store → generate, download;
who generated it and when is logged. Dashboard reminders for upcoming
deadlines (monthly file while e-invoicing is off; inventory by 15 Feb),
deadlines in the country config.

**Exemption table check** (`docs/saft-ao/examples/TaxExemptions.json`,
v2.0.0 of 2021-01-07, 39 codes, vs the table in the original request):
- M94 exists in the file (art. 16.º nº1 e): reimportação de bens) but
  not in the request's M90–M93: include it.
- M02 reads "Transmissão de bens e serviços não sujeita" (request:
  "…serviço…").
- M18 reads "…alínea i) do nº1 artigo 12.º…" (missing "do"); M80–M94
  write "alinea" without the accent and omit "do CIVA".
- M85/M86 are art. 14.º nº2 a)/b) (not nº1).
- M00/M04 note they replaced the 2020 "regime transitório / não
  sujeição" (Lei 42/20).
- The file has no IS (S01–S03) or IEC (I01–I16) codes.
Which wording is printed is open question 2.

### 4. Credit & payables
FT on credit, RC for payments, balances, credit limit;
`CustomerPayment`/`SupplierPayment` with allocations; purchase
`paidAmount`/`paymentStatus`; balances on Customers/Suppliers pages.

### 5. Purchases, history, printing
Purchase filters + print/export; sales history with "issue document";
per-store print settings (copies, paper,
printer) overridable per print; "2ª Via" from a reprint counter; silent
printing in the Windows app, Chrome `--kiosk-printing` documented for
browsers.

### 9. AGT (feature flag)
`agt` module with the 7 services, RS256 JWS (software + document),
keys from env/secret files only, DB-backed transmission queue with
backoff and 429/E98 handling, per-document status/requestID/errors,
rejected-documents screen with correct-and-resend (status C), pending-sync
indicator. SAF-T exports: see 8b.

### 10. Reports
Sales by period/product/category/cashier/payment/document type, margin,
IVA summary (by rate/exemption; Simplificado 7% on turnover received),
stock valuation, low stock, customers/suppliers balances, purchases, AGT
status; PDF + CSV.

### 11. UI
Wider sidebar with larger icons; per-user display size scaling the root
font size (printed documents are in mm/pt and unaffected).

## Decisions on additions A/B (from the owner, 2026-10-13)
1. **SAF-T hash chain** (Decreto Executivo 74/19; 312/18 only requires
   an asymmetric algorithm and a private key known only to the
   producer). The standard used by certified AO/PT software:
   - RSA + SHA-1, 1024-bit key, Base64 output.
   - Message: `InvoiceDate (YYYY-MM-DD);SystemEntryDate
     (YYYY-MM-DDThh:mm:ss);InvoiceNo;GrossTotal (2 decimals, dot);previous
     document's hash` (empty for the first document of the series).
   - Chained per series; signed and unsigned documents never mixed in a
     series.
   - Printout: hash characters 1, 11, 21 and 31 as a prefix of the
     certification line, e.g. "pqf3-Processado por programa validado nº
     77/AGT/2019".
   - HashControl "0" until certified, then the private key version.
   - Behind a `SignatureProvider` interface with test vectors, so a
     detail can change during certification. Private key in secrets,
     never in the repo; the public key goes to AGT at certification.
   - Separate from the phase 9 e-invoicing JWS RS256 signatures; both
     exist.
2. **Exemption wording**: the e-invoicing table and TaxExemptions.json
   use the same wording. That text goes on printed documents and in SAF-T
   `TaxExemptionReason` (test: 6–60 characters); the dropdown shows the
   plain-language description. M94 ("Isento nos termos da alinea e) do
   nº1 do artigo 16.º") is included. The table is data with valid from/to
   dates so codes can be retired without code changes.
3. **Costing**: weighted average cost only (the setting exists with that
   one option). Stock movements are designed so FIFO lots can be added
   later without a painful migration.
4. **Payment methods → PaymentMechanism** (mapping in the country
   config): Numerário NU; Multicaixa / TPA CD; Cartão de crédito CC;
   Referência Multicaixa MB; Transferência bancária TB; Cheque CH; Mobile
   money (Multicaixa Express, Unitel Money…) OU.
5. **Returns**: a return/credit note that gives cash back happens in an
   open shift at a till. A credit note with no cash (to the customer's
   balance, refund by transfer, correcting an invoice) can be issued from
   the back office without a shift: needs `PROCESS_RETURN` ("returns and
   credit notes") or a manager override, linked to user and store, audit
   logged. No fake shifts for back-office users.

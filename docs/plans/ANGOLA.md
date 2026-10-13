# Angola launch: fiscal documents, IVA, checkout, credit, AGT

**Status:** approved 2026-10-13; additions A (SAF-T) and B (shifts)
added the same day, waiting for the owner's OK. Built phase by phase in
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
  and payment records shift, cashier and till. The back-office Returns
  page asks for a shift too (or the return is done at a till).
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

## Open questions (2026-10-13, additions A/B)
1. **Hash algorithm.** Decreto Presidencial 312/18 (the signing rules)
   is a scan. Proposal: the Portuguese-style chain the SAF-T AO fields
   imply — RSA-SHA1 signature over
   `InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;<previous Hash>`
   per series, base64 (172 chars), HashControl "0" until certified, 4
   characters printed. Built in phase 8 with our own key; confirm the
   exact message format (or send the text of 312/18).
2. **Exemption wording**: print the AGT e-invoicing spec text (the
   request's table) or the SAF-T file's? Proposal: one table with the
   e-invoicing spec wording, plus M94.
3. **Costing method**: weighted average now and FIFO (cost layers on
   every purchase, sale, return and transfer) later, or both now?
   Proposal: both selectable now is a lot of stock code; average first.
4. **Payment methods**: add "Transferência bancária" (TB) and
   "Multicaixa / TPA" (CD), and map today's "Mobile money" to OU?
5. **Returns from the back office** need an open shift under the new
   rule; OK that they're done at a till (or the back office opens a
   shift for that person)?

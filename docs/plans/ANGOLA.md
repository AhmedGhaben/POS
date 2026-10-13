# Angola launch: fiscal documents, IVA, checkout, credit, AGT

**Status:** approved 2026-10-13. Built phase by phase in the order
1 → 2 → 3 → 7 → 6 → 8 → 4 → 5 → 9 → 10 → 11 (tax per product needs the
country config; credit sales need FT/RC). After each phase: lint,
typecheck, unit + e2e tests, new tests for the business logic, README,
commit and push.

**Progress:**
- **Phase 1 (bugs) is built** (2026-10-13). Account switch: every
  cached query is reset when the signed-in person changes
  (`features/auth/user-scope.ts`) and the permissions query is keyed by
  person. Dropdowns: `CommandItem` matches `data-[disabled=true]`.
  Tests: web unit `user-scope.test.ts` (4).

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
Typed quantity on a line; held orders kept on the till (no stock, no
number); amount received + live Troco, blocked when short (unless split);
manager override (single-use server-issued token per action, offline
checked against the till's saved PINs/permissions, audit-logged) with new
permissions SELL_ON_CREDIT, ANNUL_DOCUMENT, CHANGE_PRICE,
ISSUE_CREDIT_NOTE; one shift per till at a time, several tills tested;
`trackStock` flag; "Consumidor Final" (NIF 999999999) default customer;
list/grid view; customer card.

### 7. Country config & company settings
Typed `CountryConfig` registry (`packages/shared/src/countries/ao.ts`):
currency, number format, regimes, rates, exemption tables (M/S/I),
banks, legal forms, document types, QR URL. `Store.country` +
`Store.ivaRegime` + `pricesIncludeTax` (regime change admin-only,
logged); `Business.legalForm`, `commercialRegistration`; alphanumeric
NIF; `BankAccount` table; `pt-AO` locale falling back to `pt-PT`
(Angola keeps "Factura"). Money columns widen to Decimal(14,2).

### 6. Products
Category create/edit/delete (reassign on delete); scanner-safe barcode
field; duplicate barcode check; tax chosen by name
(`taxCode`, `taxRate`, `exemptionCode`); unit of measure + decimal
quantities. Photo → barcode → Open Food Facts: last, ask first.

### 8. Fiscal documents
`DocumentSeries`, `FiscalDocument` (type, series, sequence, documentNo,
status N/A, cancel reason I/N, seller/buyer snapshot, totals, refs),
`FiscalDocumentLine`, `FiscalDocumentLineTax`. Every completed sale → one
FR (cash) or FT (credit); returns → NC referencing document + line;
Proforma (non-fiscal) convertible. Immutable (no update/delete routes +
DB trigger). Old `INV-…` invoices stay readable as legacy. Cancel becomes
annulment with reason I/N only; anything else is an NC. Number to words
(pt), AGT QR (v4, ECC M, 350 px), A4 + 80/58 mm layouts.

### 4. Credit & payables
FT on credit, RC for payments, balances, credit limit;
`CustomerPayment`/`SupplierPayment` with allocations; purchase
`paidAmount`/`paymentStatus`; balances on Customers/Suppliers pages.

### 5. Purchases, history, printing
Purchase filters + print/export; sales history with "issue document";
shift print with all sales; per-store print settings (copies, paper,
printer) overridable per print; "2ª Via" from a reprint counter; silent
printing in the Windows app, Chrome `--kiosk-printing` documented for
browsers.

### 9. AGT (feature flag)
`agt` module with the 7 services, RS256 JWS (software + document),
keys from env/secret files only, DB-backed transmission queue with
backoff and 429/E98 handling, per-document status/requestID/errors,
rejected-documents screen with correct-and-resend (status C), pending-sync
indicator. Later: SAF-T(AO) and inventory file export.

### 10. Reports
Sales by period/product/category/cashier/payment/document type, margin,
IVA summary (by rate/exemption; Simplificado 7% on turnover received),
stock valuation, low stock, customers/suppliers balances, purchases, AGT
status; PDF + CSV.

### 11. UI
Wider sidebar with larger icons; per-user display size scaling the root
font size (printed documents are in mm/pt and unaffected).

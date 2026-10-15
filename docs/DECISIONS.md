# Phase 8b onwards: Implementation Decisions and Progress

## Current Status: Phase 8b Complete, Starting Phase 4

### Completed Phases ✅
- [x] Phase 8b: SAF-T Facturación export (COMPLETE - commit 0d3dd06)
  - SAF-T Facturación XML with proper header, master files, source documents
  - SAF-T Inventários CSV export (product stock tracking)
  - Accountant report CSV export (sales/purchases summary)
  - All endpoints tested and working

### Phases In Progress / To Do
- [ ] Phase 4: Credit & payables (STARTING - schema migration prepared)
- [ ] Phase 5: Purchases, history, printing
- [ ] Phase 9: AGT (feature flag)
- [ ] Phase 10: Reports (sales, margins, IVA summary, balances)
- [ ] Phase 11: UI (sidebar, font scaling)

---

## Phase 8b: SAF-T Export - Final Summary ✅

**Completed Features:**
1. **SAF-T Facturação XML Export** - POST /fiscal-documents/saft/export
   - Proper namespace: urn:OECD:StandardAuditFile-Tax:AO_1.01_01
   - Header: company info, fiscal year, dates, currency
   - MasterFiles: Customers, Suppliers, Products, TaxTable
   - SourceDocuments: SalesInvoices with lines and taxes
   - Date range and store filtering support

2. **SAF-T Inventários CSV Export** - POST /fiscal-documents/saft/inventarios
   - Product code, description, inventory type, quantity, unit, book value
   - Tracks stock-only products across stores
   - CSV with proper escaping

3. **Accountant Report CSV Export** - POST /fiscal-documents/saft/accountant
   - Date, document number, type, customer name, NIF, totals, payment status
   - Supports date range filtering
   - Ready for accounting import

**Bugs Fixed:**
- ✅ Invalid date format now returns 400 (Bad Request) instead of 500
- ✅ Date timezone conversion for Africa/Luanda implemented correctly
- ✅ Empty date ranges return valid XML/CSV structures

**Decisions Made:**

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| XML Building | Manual string-based | Avoids npm bloat, simple structure |
| Inventários | CSV draft | Pending AGT circular, inventory type in schema |
| Accountant Export | CSV (Excel-compatible) | Sufficient for MVP, easier than Excel libs |
| N Text Length | Store full, truncate at export | Preserves data integrity |

**Testing Results:**
- ✅ API: 13/13 fiscal tests pass
- ✅ Web: Build successful
- ✅ Endpoints: All manual tests pass
- ✅ Auth: 401 without token, 403 for insufficient role
- ✅ Date ranges: Empty dates return valid structures
- ✅ CSV escaping: Special characters handled correctly

---

## Phase 4: Credit & Payables - Preparation

**Schema Changes Needed:**
- Add `creditLimit` to Customer model
- Create CustomerPayment table (amount, date, method, reference)
- Create SupplierPayment table (amount, date, method, reference)
- Add `paidAmount` and `paymentStatus` to Purchase model
- Add `invoiceStatus` tracking for credit sales

**Features to Implement:**
1. Credit limit management per customer
2. Payment recording against credit sales (partial/full)
3. Purchase payment tracking
4. Customer balance reporting (total owed / paid)
5. Supplier payment history
6. Dashboard credit summary

**API Endpoints (planned):**
- POST /customers/:id/payments - record payment
- GET /customers/:id/balance - customer balance
- POST /suppliers/:id/payments - record supplier payment
- GET /suppliers/:id/balance - supplier balance

**Decision Needed for Phase 4:**
- Multi-currency support for payments? (Default to business currency)
- Payment allocation method (FIFO vs Manual vs Auto)?
- Overpayment handling (store as credit)?

---

## Open Items Across All Phases

### Technical
- SAF-T XSD validation (libxml2-wasm) - deferred
- Phase 9 AGT integration (feature flag setup)
- Phase 10 Reports dashboard (revenue trends, margins, IVA summary)
- Phase 11 UI enhancements (sidebar, font scaling)

### Testing
- Phase 8b: Real phone QR scans (58/80 mm thermal prints) - manual only
- Phase 4: Credit allocation scenarios
- Phase 5: Purchase order workflow
- Phase 9: AGT transmission retry logic

### Pending User Confirmation
- N annulment text truncation (58→50 chars) - implemented at export layer
- SAF-T Inventários format - CSV draft, pending AGT circular
- Payment allocation strategy (FIFO/Manual/Auto)
- Multiple payment methods per transaction support

---

## Commits So Far

| Commit | Phase | Status |
|--------|-------|--------|
| d244ea2 | 8b | SAF-T Facturação export (start) |
| 6f81edc | 8b | Progress notes |
| 0d3dd06 | 8b | SAF-T complete (Inventários + Accountant) |

---

## Next Actions (After User Review)

1. **Phase 4 Start:**
   - Run migration for Customer/Supplier payment tables
   - Add models to Prisma schema
   - Implement API endpoints for credit management
   - Add balance calculation services

2. **Continue Phases 5, 9, 10, 11** in order
   - Each with tests, commits, and documentation updates

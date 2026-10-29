# Prompt 1c continuation

Recovery baseline: `7adbd25` on `rescue/pos-codex-20261029`.
The earlier item 1–9 commits and unfinished item 10 groundwork are preserved.
No push, deployment, production migration or production data changes are authorized.

## Item 10 — bulk stock counts: completed

- Reused `20261028140000_stock_counts`, the DTOs and CSV/XLSX reader.
- Added owner/manager count preview and apply endpoints under a store.
  StoreAccessGuard checks live store access; products are also checked against
  that store's business inside the apply transaction.
- Save all includes every edited product, including rows hidden by a filter.
  A preview shows current, counted and difference quantities; import errors
  block the entire apply. CSV/XLSX support SKU or barcode, English/Portuguese
  headings, decimal comma/point, at most 5000 product rows and 5 MB files.
  Barcode text preserves leading zeroes. XLSX decompression is bounded.
- Blank, negative, excessive precision/range, duplicate, unknown, ambiguous,
  inactive/non-stock and fractional whole-unit rows are rejected.
- One transaction saves the count, changed ADJUSTMENT movements and its audit
  record. Stock rows are locked before balances are read, in product order.
  Existing costing is reused; unchanged products create no movement. The UI
  supplies original balances, so concurrent stock changes reject the whole
  count with 409 and require another review. Failed counts leave no record.
- File contents are redacted from generic request audit metadata.
- Strings added in en, pt-PT, pt-BR; pt-AO derives from pt-PT as before.

Validation on 29 October 2026:

- Fresh temporary PostgreSQL 18 cluster, loopback port 55439,
  database `pos_recovery_1c`, synthetic test user, trust authentication local
  to this temporary cluster. All 49 migrations applied successfully here only.
- API unit suite: 47 suites / 303 tests passed.
- Web unit suite: 45 files / 234 tests passed.
- New stock-count API integration suite: 7 tests passed, covering rollback,
  role/business/store isolation, audit/costs, stale and simultaneous counts,
  CSV validation and XLSX preview/apply. Bank/count parser subset: 9 passed.
- API, web and desktop TypeScript checks passed; touched API/web ESLint passed.
- Desktop web bundle built in a temporary directory (existing bundle warnings).
- New opt-in UI suite: browser (Edge Chromium) and real Windows Electron,
  both passed. Each uses a fresh business on the isolated API, Portuguese,
  1024×768 and 1366×768; Save all, invalid CSV blocking, valid CSV application.
  Early harness failures (saved user language and re-filling unchanged values)
  were corrected; the final two-test run passes.
- API build and UI services use temporary output/ports 55440 and 55441;
  existing demo/production services and databases were left alone.

Manual check: Inventory → edit several quantities → Save all → review → Apply.
Then import CSV `SKU,Quantity` with one row per product; inspect differences.
An invalid/duplicate row must disable Apply. Change stock elsewhere after
preview: applying must fail without applying any of the count.

## Item 11 — back-office shift report parity: completed

- Both back-office preview and PrintArea now request the shared report's full
  sales list: number, time, payment method and total, including cancellations.
  Existing payment breakdown, product breakdown, float/count/difference and
  notes use the same template and server summary as the cashier's report.
  The cashier's existing optional sales-list checkbox remains available.
- Tests: report rendering/document-language subset 11 passed; existing shift
  API integration suite 7 passed on the isolated database. API/web/desktop
  TypeScript checks passed; touched web ESLint passed.
- Browser and Windows Electron UI suite: 2 passed, extended to create two
  sales (cash and card), close the shift, compare close/back-office summaries,
  verify sales/product/cash reconciliation and compare preview with print DOM.
  Temporary desktop web bundle rebuilt successfully.
- Manual check: Shifts → open a closed shift → every sale must be listed;
  print preview must contain the same sales and cash/product breakdowns.

## Item 12 — fiscal-number display cleanup: completed

- Shift report / All sales printout now prints FR/FT references without also
  printing the internal receipt number. Sale time, method, amount and cancelled
  markings remain. Historical sales without a fiscal document keep a fallback.
- Older invoice list, past-sale picker, issue dialog and A4 sale-reference
  field use the shared fiscal-number helper. Invoice reads include existing
  fiscal summaries; no stored number, signature, series or snapshot is changed.
  The older invoice's own INV number remains its existing number.
- Audited sales history, CSV, report tables, returns picker, receipts, customer
  history and email paths. Fiscal references were already used there. Internal
  numbers remain stored and searchable; the existing Recent sales screen's
  secondary support reference is preserved as requested by Prompt 1b.
  Internal references in offline IDs, audit metadata, React keys and historical
  fallback paths remain intact. Legal reference creation logic is unchanged.
- New labels translated in en, pt-PT, pt-BR, with derived pt-AO coverage.
- Tests: new isolated fiscal-display API suite 2 passed, including unchanged
  fiscal document data after reads, invoice list/detail references and search
  by fiscal/internal number. Invoice unit subset 7 passed. Final combined API
  integration run: 4 suites / 18 passed (counts, shifts, fiscal display and
  new-product inventory). Final full web suite: 47 files / 240 passed.
- Browser and Windows Electron UI: 2 passed, now additionally inspecting the
  actual CSV Blob, sales history and shift print DOM: fiscal numbers present,
  corresponding internal numbers absent. Runs use the isolated test database.
- API/web/desktop TypeScript checks passed; touched ESLint checks passed.
  Desktop unit tests: 29 passed. Production browser/PWA and desktop web bundles
  built successfully into temporary directories; existing bundle-size and
  mixed jspdf import warnings remain. No full desktop suite or remote CI claim.
- Manual check: close a shift with cash and card sales → Shifts → preview/print
  → verify fiscal references; Sales → Export CSV → verify the same references.
  Search by an internal reference must still find that sale. A historical sale
  with no FR/FT must still show its fallback number.

## Local milestones

- Item 10: `9a99136` — save and import atomic bulk stock counts.
- Item 11: `5340365` — full sales in back-office shift reports.
- Item 12: the commit containing this final progress update.

## Next steps

- No remaining implementation in the approved items 10–12.
- Review item 8's product decision below before changing price policy.
- The isolated UI suite is opt-in (`POS_RECOVERY_UI_TESTS=1`,
  `POS_TEST_API_URL` and `POS_TEST_WEB_URL` aimed at test services,
  `POS_DESKTOP_WEB_DIR` aimed at the test bundle). Run only
  `recovery-1c.spec.ts` to avoid the preserved old diagnostic.
- Temporary API/web services and the temporary PostgreSQL cluster are stopped
  at the end of this continuation; database files are retained in the OS temp
  directory (`pos-recovery-1c-pg`) for inspection. No existing service is stopped.

## Pending decisions and preserved work

- Item 8: zero cost prices are currently permitted, and zero selling prices
  use the prior agent's explicit free-item workflow. The literal brief rejects
  zero costs and asks before introducing free items. Product decision pending;
  this continuation does not modify that policy.
- Prompt 1b rounding, fiscal OR quotes and AGT inventory circular remain outside
  this continuation. Accounting/regulatory deferred features remain deferred.
- `apps/desktop/e2e/zz-probe.spec.ts` is the preserved prior diagnostic with a
  hard-coded old temporary path. It is excluded by selecting the new UI spec
  explicitly; no claim is made that the entire desktop suite passes.
- PR/remote CI/merge are not performed: current instructions prohibit pushing.

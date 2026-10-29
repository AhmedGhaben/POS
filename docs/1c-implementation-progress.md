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

## Remaining milestones

1. Item 11: include the full sales list in back-office preview and print;
   verify parity with the shared close-shift report.
2. Item 12: audit fiscal-number display on shift lists, printouts, exports
   and remaining invoice-related views. Do not change numbering/signing.

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

# Prompt 1c continuation

## Post-audit inventory fixes

### Item 6 - archive stock lookup and confirmation: completed

- Product form disables Archive/Archive anyway during loading, refetching,
  missing results and errors. Failed lookups display a translated blocking
  error with Retry. Stock reads have a 10-second timeout and validate the
  response shape; invalid/missing data cannot become confirmed zero stock.
- Clicking Archive performs a fresh lookup. Nonzero stock opens the existing
  confirmation with the exact per-store quantities reviewed; verified zero
  stock archives normally. A failed refetch cannot fall back to cached `[]`.
- PWA catalog caching now excludes product `/stock` reads. Catalog/offline
  selling caches and outbox behavior otherwise remain unchanged.
- API archive PATCH now requires `archiveStock` (storeId/quantity snapshot,
  including `[]` for zero). A serializable transaction compares every nonzero
  store quantity before updating the product. Missing, stale or duplicate
  snapshots return 409; serialization conflicts also require reload/review.
  The UI resets confirmation and reloads on rejection. No migration needed.
  Older clients that omit the snapshot receive a safe 409 and must update.
- Existing owner/manager permissions, restore behavior, permanent-delete
  stock/history/fiscal-reference safeguards and fiscal logic are unchanged.
  API fixtures that archive products now explicitly acknowledge stock.
- Verification: web 50 files / 257 tests passed; API unit 47 suites / 303
  tests passed; isolated API integration 4 suites / 89 tests passed (product
  edits/archive/delete, new-product inventory, Angola phase 6 and accounting).
  API full-source TypeScript (including tests), web TypeScript, desktop
  TypeScript/unit tests (29 passed), touched-file ESLint and diff checks pass.
- Edge and real Windows Electron: `archive-stock.spec.ts` 2 passed. Both
  exercise HTTP 500, a real 10-second application timeout, disabled Archive
  during loading/failure, retry success, accurate positive stock, cancelled
  confirmation, delete-with-stock refusal, stale confirmation 409/reload,
  cached-zero lookup failure, zero-stock archive and unused-product deletion.
- Existing offline-selling browser/Electron regressions: 4 passed, including
  offline checkout, reconnect sync and unchanged Electron fiscal numbers.
  Desktop and browser/PWA bundles build successfully into temporary folders;
  existing bundle-size/jspdf mixed-import warnings remain.
- Test isolation: fresh temporary cluster `pos-archive-test-pg`, loopback
  55469, database/user `pos_archive_test`, UTC. The 49 existing migrations were
  applied there only, without seed. Test API/web/fault proxy use
  55470/55471/55472. No existing demo/production database or real credentials.
  Temporary services/cluster are stopped; temporary data is retained for inspection.
- Initial validation caught an incorrect UUID assumption for CUID store ids,
  missing API translations, and test interception unsupported by Electron's
  custom protocol. These were corrected; final scoped checks pass. Electron
  tests use an HTTP fault proxy and close the timed-out connection on recovery.
  Its existing main-process forwarder does not propagate renderer aborts
  upstream, so a timed-out upstream request can linger until the server/network
  closes it. The archive UI remains blocked safely; transport cancellation is
  unchanged and outside this fix.
- Full desktop suite/`zz-probe.spec.ts` remain unverified. Item 8's zero-cost/
  free-item policy and the previously recorded non-UTC accounting date risk
  remain pending, unchanged. No Prompt 2 or unrelated implementation started.


### Item 5 — immediate warning-only stock while offline: completed

- Stock authority is now derived in `useStockLevels` from OS connectivity,
  server reachability, snapshot age and a runtime-only connection epoch.
  Disconnecting immediately downgrades cached online stock to warning-only,
  so the existing add/increase/overStock/Charge paths cannot enforce it offline.
- An outage increments the epoch. Returning online does not re-authorize a
  pre-outage snapshot, even after an outage too brief to render or when an
  older request completes later. Reconnection triggers an immediate stock
  refetch; a successful snapshot from the new epoch restores enforcement.
- Online stock limits and `allowSellingWithoutStock` retain their existing
  meaning. No changes to the sync engine, offline outbox/payload/idempotency,
  accounting rules, fiscal numbering/signatures or issued-document storage.
  No new UI strings or schema changes.
- Web: 49 files / 249 tests passed, including 9 new connectivity/snapshot
  tests and existing outbox, pricing, numbering and signature/hash coverage.
- API: 3 integration suites / 76 tests passed on an isolated database:
  offline sales, Angola phase 3 and the full accounting suite. Relevant API
  unit subset (sales, stock costing, signatures, document lines): 55 passed.
- Browser/Windows UI: 4 passed in `offline-stock.spec.ts`: OS-offline and
  server-unreachable cases in both Edge Chromium and real Windows Electron.
  Every case begins with fresh authoritative zero stock blocking online,
  then adds an item, raises its quantity with the button and typed input,
  charges offline, observes the pending outbox record and syncs on reconnect.
  Tests assert one server sale with the same client id, `createdOffline`,
  quantity 3 and stock -3. A second uncharged cart becomes blocked after fresh
  stock arrives; online overselling is tested both enabled and disabled.
- Electron uses a registered Angolan till and the existing native signing
  path; its synced fiscal document number matches the printed offline one.
  Browser checkout uses a synthetic non-fiscal (US) fixture: browsers lack
  the native signing key required for Angolan offline fiscal documents. That
  existing restriction remains intact; no mock signer or unsigned AO bypass.
- API/web/desktop TypeScript checks, touched-file ESLint and git whitespace
  checks passed; desktop unit tests 29 passed. API/desktop compiled and both
  browser/PWA and desktop web bundles built into temporary output directories.
  Existing bundle-size/mixed jspdf import warnings remain.
- Isolation: fresh temporary cluster `pos-offline-stock-pg`, loopback 55459,
  database/user `pos_offline_test`, UTC database setting. All 49 existing
  migrations applied there only. API/web/proxy use ports 55460/55461/55462;
  no existing demo or production database/services are used. New UI suite
  requires `POS_OFFLINE_STOCK_TESTS=1` and explicit isolated API/database URLs.
- Temporary services and cluster are stopped after verification; temp data
  retained for inspection. No push, merge or deployment. The full desktop
  suite, archive-confirmation gap and prior non-UTC accounting risk remain
  separate outstanding work; no archive or unrelated fix started.

### Task 1 — cross-business product isolation: completed

- `InventoryService.adjust` resolves the target store's business before
  looking up the product. Foreign and missing product IDs return the same
  404, before product-specific validation or stock writes. StoreAccessGuard
  continues to check the caller's store access independently.
- Added isolated API regression coverage: foreign stocked/non-stock products,
  unknown IDs, foreign store access, no changes to inventory/movements/audit
  records on rejection, valid absolute counts, reorder levels, actor/cost
  attribution, unchanged counts and fractional-unit validation.
- Validation: 2 integration suites / 6 tests passed (new isolation suite and
  existing new-product inventory suite); API TypeScript and touched ESLint pass.
- Test data uses a new temporary PostgreSQL cluster in `pos-inventory-fixes-pg`
  under the OS temp directory, loopback port 55449, database/user
  `pos_inventory_test`. All 49 existing migrations applied there only. No seed,
  existing demo database, production database or fiscal implementation changed.
- Local commit: `e82b950`.

### Task 2 — absolute inventory adjustment concurrency: completed

- Single-row adjustment now upserts/locks the inventory row before reading
  the balance and calculating the difference, including concurrent first
  counts when no row exists. The transaction retains that lock through its
  stock movement, cost calculation and reorder-level update. Counts remain
  absolute; repeated equal counts create no extra movement.
- Applied the same lock-before-balance-read correction to product-import
  counts, another operational absolute-stock writer. Its earlier existence
  lookup is retained only to select OPENING versus ADJUSTMENT. No schema,
  fiscal numbering/signing/storage, accounting rules or offline policy changed.
- Inspected stock writers: operational purchases, sales, sale cancellations,
  returns and transfers use the row lock in `recordMovement`; bulk counts
  already lock before reading. Demo seeding was not run or changed and remains
  a provisioning operation, not something to run alongside live stock writers.
- New integration suite: 16 passed. Existing-row tests hold a real PostgreSQL
  row lock, start one writer, observe it waiting in pg_stat_activity, then
  queue the second writer before releasing the lock. This forces actual
  contention and checks serialized absolute results, movement quantities,
  balances, actor and costs, rather than relying on request timing.
- Coverage: identical/different simultaneous counts, concurrent first counts,
  adjustment after bulk count, stale bulk-count rollback after adjustment,
  bulk counts without a baseline, both orderings with a real sale, unchanged
  counts, insufficient-stock sale rejection, concurrent product import, and
  the PURCHASE/RETURN/SALE_VOID/TRANSFER_IN/TRANSFER_OUT shared movement writer.
- Final UTC database run: 6 integration suites / 88 tests passed (isolation,
  concurrency, new-product inventory, bulk counts, product import and the full
  accounting suite). All 47 API unit suites / 303 tests passed. API build and
  full-source TypeScript checks, including integration tests, and touched-file
  ESLint passed.
- Earlier broad run: 87 passed, 1 failed in accounting daily-summary test
  `accounting.e2e-spec.ts:578` (today's document was already linked). Reproduced
  the same failure with source from both Task 1 commit `e82b950` and pre-fix
  baseline `651b292`, then restored the current fixes byte-for-byte.
  The temporary Windows PostgreSQL cluster inherited Europe/Moscow. Its DATE
  comparison against UTC-midnight timestamptz treats the same calendar day as
  earlier; configuring **only this temporary test database** to UTC makes the
  full accounting suite pass (54/54). Non-UTC database compatibility is a
  confirmed pre-existing accounting risk, left unfixed in this scope; see
  `integration.service.ts` daily-summary cutoff and `accounting-dates.ts`.
- Limits: tests establish serialization per stock row. Existing multi-product
  lock-order deadlocks or long lock waits can still cause transaction rollback;
  no global lock ordering or automatic retry architecture was introduced.
- No further inventory, offline-selling or archive fixes are started here.
  Temporary PostgreSQL is stopped at the end; its files remain in OS temp.

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

# Prompt 1c continuation

## Post-audit inventory fixes

### Fiscal inventory-export timezone boundary correction (2026-10-29)

- Reproduced before editing application code on a fresh Moscow test database:
  2025-12-31T22:30Z gives 10 units at average cost 5; the movement at 23:30Z
  gives 15 units at average cost 6, but already belongs to 1 January in Luanda.
  The 31 December export incorrectly returned 15 units / 90 Kz rather than
  10 / 50. The new failing regression and prior-build reproduction confirm
  a pre-existing defect, not an item 8 regression.
- Root cause: Prisma binds the correctly calculated business-local cutoff Date
  as timestamptz. Comparing it to UTC-stored timestamp-without-time-zone
  stock_movements.occurredAt implicitly applies the database session timezone
  to stored values. The only application correction is the parameter expression
  `occurredAt < (cutoff AT TIME ZONE 'UTC')` in SaftExportService.inventario.
  This retains the exclusive upper boundary and leaves the indexed column,
  store/calendar calculations, movement order, balances, weighted costs and
  inventory layout unchanged. No schema, migration, timezone default or stored
  date is changed. Fiscal signing, numbering and issued-document storage are
  unchanged; exports keep their existing audit logging only.
- Reviewed related comparisons in the service: its other raw query aggregates
  integer ledger year/period fields; calendar DATE predicates use the existing
  dateColumnValue through Prisma; timestamp ORM predicates use the existing
  export period. No additional correction was needed. Existing fiscal export
  and accounting boundary suites pass under every tested database timezone.
- Added 18 database-backed regressions: the exact 10-versus-15 reproduction;
  movements one millisecond before, exactly at and after local midnight;
  January month-end, year-end, leap day and New York spring/autumn DST dates;
  explicit Africa/Luanda, America/New_York and Asia/Tokyo store overrides;
  the default UTC store value's existing Angola-country fallback; multi-store
  aggregation with different local cutoffs; default prior-year selection;
  invalid dates/no-stock output; unchanged movement snapshots, current stock,
  fiscal-document/series and accounting state after reads.
- Fresh PostgreSQL 18 cluster `pos-fiscal-boundary-pg`, loopback 55559,
  synthetic user `pos_fiscal_test`. Four fresh databases:
  `pos_fiscal_boundary_{utc,luanda,moscow,new_york}_test`, with default session
  timezones UTC, Africa/Luanda, Europe/Moscow and America/New_York respectively.
  All 49 existing migrations applied only there. Tests assert the actual
  session timezone and create/clean their own synthetic business fixtures.
  No existing database, till, historical books or prior export file accessed.
- Validation: **3 integration suites / 42 tests passed in each timezone**
  (168 passing executions): fiscal-inventory-timezones, angola-phase8b and
  accounting-timezones. Full API unit **49 suites / 324 passed**. API TypeScript
  including tests, touched API/test ESLint and diff checks passed. The initial
  pre-fix reproduction was the only failing run; no final failures remain.
  Full API integration, browser and desktop suites were not rerun for this
  one-comparison API correction. OS-temp logs:
  `pos-fiscal-boundary-before.log`, `pos-fiscal-boundary-{utc,luanda,moscow,new_york}-e2e.log`
  and `pos-fiscal-boundary-unit.log`.
- This resolves the pre-existing export blocker described in the item 8 section
  below. Remaining historical risk: files previously exported with non-UTC DB
  sessions may have incorrect cutoff balances and may need reviewed regeneration
  or reconciliation. Nothing historical was rewritten or automatically repaired.
  The draft inventory format's previously documented regulatory review and other
  release checks remain unchanged. No Prompt 2, push, merge or deployment.
  The temporary PostgreSQL cluster was stopped after validation; synthetic
  database files and logs remain in OS temp for inspection.

### Item 8 approved pricing policy (2026-10-29)

- Product decision resolved by the owner: purchase cost 0 Kz is allowed for
  free stock/bonuses/gifts/samples; selling at 0 Kz requires manager approval
  and a mandatory justification. This supersedes the historical pending-policy
  notes below. Existing nonnegative purchase-cost validation, free-item catalogue
  flag/form/import and normal price-change controls were preserved.
- Missing checkout protection implemented for catalogue zero prices, zero-price
  overrides and lines made free through discounts. Every such sale requires an
  online single-use approval, including for users already granted CHANGE_PRICE.
  Uses the existing PIN workflow and CHANGE_PRICE permission, plus a dedicated
  `sale.zero-price` action, active OWNER/MANAGER role and store-access checks.
  The existing second-person approval rule remains: a cashier's/owner's own
  login or an ordinary price-change token does not silently authorize it.
- Approval is bound to business, requesting cashier, store, clientId, quantities,
  effective prices and discounts. The server requires a nonblank justification
  (at most 500 characters), rechecks the manager at use and atomically consumes
  the grant. A `ZERO_PRICE_SALE_APPROVED` audit record contains sale ID, approving
  manager ID, justification and reviewed cart; existing approval audit includes
  the manager name. Approval-use auditing now uses the caller's transaction too,
  so a failed sale rolls back the claim and its audit records together.
- Checkout shows the reviewed products, manager PIN prompt and mandatory reason.
  Labels/errors translated in en, pt-PT, pt-BR (pt-AO derived). Price-dialog zero
  confirmation remains; authorization occurs at checkout for the complete cart.
  Server DTO/direct-request enforcement rejects missing, forged, ordinary,
  expired, reused, mismatched-cart/store/key grants and inactive/non-manager
  approvers. Existing payment, stock, fiscal and accounting algorithms unchanged;
  no schema/migration or fiscal-number/signature/document-storage changes.
- Offline approver IDs are not cryptographic server-verifiable proof. Zero-price
  sales are therefore blocked offline, even with a saved online grant; no offline
  fallback/outbox sale is created. Normal paid offline sales remain unchanged.
  An uncertain online request is retained locally with its exact clientId and
  signed payload, and retried online after reconnect; a changed cart is refused
  until the original pending checkout is resolved. PINs/private keys are never
  stored in this pending payload. Known client rejections release the pending
  request; transport/unknown failures retain it. Local storage must be available.
- Passing evidence: final focused policy API suite **11/11** (including cashier
  permission overrides, free catalogue items, zero overrides, full discounts,
  no-write refusals, rollback, idempotency and costed gift accounting). API unit
  **49 suites / 324 passed**; web **51 files / 267 passed**; desktop unit **29**.
  Real Edge browser and Windows Electron policy regressions **2/2**: mandatory
  justification, PIN approval, audit identity/reason, fiscal receipt, stock
  movement, then offline refusal with retained cart and no queued sale.
  API/web/desktop TypeScript, strict touched desktop E2E TypeScript and touched
  API/web ESLint pass. Temporary API and desktop UI builds succeed (existing
  bundle-size/jspdf warnings). Existing offline-stock/unreachable-server/sync
  and native fiscal numbering/signing UI regressions **8/8 passed**; combined
  relevant browser/Electron coverage is **10/10**. Full UTC API run: **41 suites /
  376 passed** (before the final costed-gift case was added; the final focused
  11-case run includes it). Full desktop suite was not rerun in this milestone.
- Initial development failures were corrected: Prisma Role is not a TS enum
  namespace; translations were added to satisfy API message coverage; the new
  test looked up a document by issuer SourceID instead of saleId. None remains
  in the final item 8 runs.
- Isolated PostgreSQL 18 cluster `pos-free-policy-pg`, loopback 55549, synthetic
  user `pos_free_test`; fresh `pos_free_policy_test` (Europe/Moscow) and
  `pos_free_policy_utc_test` (UTC). All 49 existing migrations and synthetic
  fixtures applied only here. Test-only deadlock_timeout 100ms retained for the
  contention regression. Temporary API 55550, Vite 55551/55553 and fault proxy
  55552, temporary build outputs, repository test signing key; no real credentials.
  Final logs in OS temp: `pos-free-policy-final-unit.log`,
  `pos-free-policy-final-web.log`, `pos-free-policy-full-api.log` (Moscow),
  `pos-free-policy-utc-full-api.log` (UTC). Temporary services and the cluster
  were stopped after validation; only synthetic data/builds/logs remain.
- Separate confirmed pre-existing defect, not changed: the full API suite under
  Europe/Moscow has **374 passed / 1 failed** (before the last two policy cases
  were added). `angola-phase8b.e2e-spec.ts:254` expects 10 units / 50 Kz at
  Luanda year-end but gets 15 / 90. `fiscal/saft-export.service.ts:457` compares
  UTC-stored timestamp-without-time-zone occurredAt with a Date/timestamptz
  parameter. Reproduced using the prior compiled contention baseline on fresh
  synthetic rows: 2025-12-31T22:30Z adds 10 units at cost 5; 23:30Z adds 5 at
  cost 8 (already 1 January in Luanda). Prior build exports 10/50 under UTC and
  15/90 under Moscow. The same export source is unchanged in this milestone.
  This affects historical stock export cutoffs on non-UTC sessions and remains
  a separate high-priority launch blocker requiring its own correction/review.
  No historical data or issued documents were accessed or changed.
- Rollout compatibility: old clients cannot perform newly unauthorized free
  sales. Any already queued zero-price offline documents from older clients
  require an explicitly reviewed recovery path; the server cannot authenticate
  their unsigned approver IDs. Their existence was not checked in any existing
  database or till. Do not delete/rewrite issued documents to bypass this rule.
  Existing packaged-updater/hardware/release checks remain outside this task.

### Bank-upload percent-encoding validation correction (2026-10-29)

- Reproduced the audit's `data:text/csv,%E0%A4%A` request on this branch before
  changing application code: the new regression expected HTTP 400 and received
  HTTP 500. The request DTO validates strings; BankService.parse decoded the
  payload before its readTable error handler. decodeURIComponent threw URIError.
  CSV/XLSX preview is separate from mapped statement import and has no writes.
- Small correction: catch only URIError in the payload-decoding block and return
  the existing translated unreadable-file BadRequestException. Unexpected
  decoding exceptions still propagate. The shared readTable/CSV/XLSX readers,
  permissive CSV preview, column mapping, 5 MB size limit, statement writes,
  reconciliation and accounting entry logic are unchanged. No fiscal or schema
  changes, and no changes to existing successful/invalid workbook behavior.
- Regression coverage: malformed UTF-8 escapes, bare/truncated percent escapes
  and non-hex escapes; sanitized HTTP 400 without internal details; unchanged
  statement, statement-line, journal-entry and audit counts after rejection.
  Valid percent-encoded Unicode/literal-percent CSV round-trips through mapped
  import. Base64 CSV/XLSX, corrupt/truncated/sheetless/expanded workbooks and
  invalid movement rows retain their previous behavior. Unexpected decoder
  errors propagate; an injected database failure remains a sanitized HTTP 500
  and creates no import rows. The existing bank accounting tests additionally
  verify auto/manual matching, fee posting and duplicate-post safeguards.
- Validation: full API unit **49 suites / 324 tests passed**; relevant API
  integration **2 suites / 62 tests passed** (`prompt1c-verification` and full
  `accounting`, including bank reconciliation). API TypeScript including tests,
  touched-file ESLint and diff checks passed. The pre-fix reproduction is the
  only expected failing run; no failures remain in final runs. The deliberate
  server-failure test logs its synthetic error; its HTTP 500 assertion passes.
- Fresh isolated PostgreSQL 18 cluster `pos-bank-validation-pg`, loopback 55539,
  synthetic user `pos_bank_test`, database `pos_bank_validation_test`; default
  session timezone Europe/Moscow. All 49 existing migrations applied only here.
  Suites created and cleaned up their own fixtures; no existing/demo/production
  database or credentials used. Logs retained in OS temp:
  `pos-bank-validation-before.log`, `pos-bank-validation-unit.log` and
  `pos-bank-validation-e2e.log`. Temporary PostgreSQL stopped after validation.
- No browser/Electron or full API integration rerun claimed for this narrow
  API-only decoder change. Item 8's policy decision and previously documented
  release/updater/hardware checks remain outstanding. No push, merge, deploy,
  Prompt 2 or historical accounting-data access performed.

### Multi-till checkout contention correction (2026-10-29)

- Reproduced on the unchanged application baseline using a fresh temporary
  PostgreSQL cluster: opposite-order two-product sales returned 201/500 with
  SQLSTATE `40P01` (deadlock); a row held for 6.5 seconds produced HTTP 500
  with Prisma `P2028` (expired interactive transaction). Both losers rolled
  back. Checkout's transaction contains stock movements, sale/payment rows,
  fiscal counter/document/signature writes and credit allocations. The old
  unbounded row wait could outlive that transaction and reach the till's
  8-second transport fallback. No existing database was inspected or changed.
- Added one shared transaction wrapper with transaction-scoped advisory
  locks per store. Multiple stores are locked in sorted order. Checkout,
  cancellation, single adjustments, bulk counts, purchases, returns,
  transfers and stock-bearing product imports use it before their writes.
  Row locks and existing counted-quantity/stale-preview semantics remain.
  Product metadata edits/archive/deletion do not create stock movements;
  checkout's bounded waits also cover conflicting locks from those paths.
  Seed/backfill scripts are not concurrent runtime writers and were unchanged.
- Each lock wait is limited to 750ms, active statements to 2 seconds, with
  at most three attempts and a shared 5-second default transaction budget
  (pool acquisition bounded to 250ms). Existing 60-second count/import body
  budgets remain. Only confirmed aborted PostgreSQL deadlock/serialization/
  lock-timeout failures (`40P01`, `40001`/Prisma `P2034`, `55P03`) are replayed.
  Statement cancellation (`57014`) and Prisma expiry/pool failures are mapped
  without replay; unknown errors/commit outcomes are never automatically
  replayed. Imports have mutable result maps, so their bodies are not replayed.
- Exhaustion returns HTTP 409 `{code: "STOCK_BUSY", retryable: true}` with
  an English/Portuguese message asking the cashier to retry. This is a known
  reachable-server refusal. Cash and credit checkout explicitly preserve it
  instead of taking the generic offline fallback, including a defensive test
  for that code with HTTP 500. The cart stays intact and Charge is available.
  Existing outbox 409 handling retains queued sales as pending; no production
  sync-engine change was needed. Caller-provided clientId is preserved across
  explicit retries; existing generated keys and lost-response recovery remain.
- Regressions: overlapping carts in both product orders, simultaneous same-key
  requests, sale vs stale bulk count and absolute adjustment, opposite transfers,
  real deadlock recovery, prolonged row-lock exhaustion, and injected aborts
  after fiscal writes for cash FR and credit FT. Checks include exact balances,
  movement counts, rolled-back numbers, one document per accepted key and
  idempotent accounting integration. Existing legacy-invoice concurrency and
  replay tests remain in the full integration run. Fiscal rules, numbering,
  signing algorithms, accounting rules and schema/migrations are unchanged.
- Isolated setup: PostgreSQL 18 cluster `pos-contention-fix-pg` in OS temp,
  loopback 55529, synthetic user `pos_contention_test`; fresh UTC databases
  `pos_contention_test` and `pos_contention_full_test`. All 49 existing migrations
  and synthetic seeds were applied only there. Test DB `deadlock_timeout=100ms`
  deliberately exercises deadlock detection before the application's 750ms
  bound; the external test blocker uses a transaction-local 5-second detector.
  Production PostgreSQL settings are not changed. Temporary API 55530,
  Vite 55531/55533 and fault proxy 55532 use temporary build outputs and the
  repository's synthetic fiscal signing key.
- Passing validation: final full API integration 40 suites / 363 tests,
  including the nine new stock-contention regressions and accounting/timezone,
  legacy-invoice, fiscal, import and offline integration coverage. API unit
  48 suites / 314 tests; web 51 files / 262 tests;
  desktop unit 29 tests. Real Edge browser and Windows Electron contention
  recovery 2/2; existing browser/Electron offline stock, unreachable-server,
  reconnect/sync and native fiscal-number/signature regressions 8/8.
  API/web/desktop TypeScript, strict touched desktop E2E TypeScript, touched
  API/web ESLint, API compilation and temporary desktop web build passed.
  Existing bundle-size/mixed-import warnings remain.
- Initial failures were test/implementation development feedback, not hidden
  passes: PostgreSQL void results require executeRaw for advisory locking;
  new test fixtures needed the shared payment enum/actual document field;
  UI outbox assertions now exclude the legitimate synced shift-opening entry.
  Final reruns pass with no remaining failures. Full API log:
  `pos-contention-final-e2e.log` in OS temp. Desktop coverage here is the ten
  relevant contention/offline/fiscal cases, not another full desktop run.
- Tradeoff: writers in one store serialize even when products differ; long
  counts/imports can make tills receive a safe busy refusal. Different stores
  remain independent except transfers/shared rows. This is a correctness fix,
  not a throughput/load certification. Older server versions/raw SQL writers
  do not participate in advisory locking: upgrade all API instances together;
  bounded row waits/retries still protect checkout. Network loss and machine
  failure retain the existing idempotent outbox behavior.
- Scope stops here. Item 8's zero-cost/free-item policy, malformed percent-encoded
  bank-upload validation and packaged updater verification remain as previously
  reported; no unrelated fix, historical reconciliation, Prompt 2, deployment,
  push or production-data action was performed.
- Temporary API/Vite services and this task's PostgreSQL cluster were stopped
  after validation. Only synthetic test data/builds/logs remain in OS temp.

### Final comprehensive verification (2026-10-29)

- Verification report and item 1-12 matrix: `docs/1c-final-verification.md`.
  Separate planning-only document:
  `docs/1c-historical-accounting-reconciliation-plan.md`. No existing books
  were accessed; historical review/repair requires separate authorization.
- This milestone changes tests/configuration/documentation only. Application
  source, migrations, fiscal signing/numbering/storage, accounting rules,
  stock writers and offline outbox remain at the verified `ffae264` baseline.
- Preserved `zz-probe.spec.ts` byte-for-byte and excluded it through Playwright
  testIgnore: it is a logging diagnostic with a personal absolute screenshot
  path, no assertions and unsafe teardown, not regression coverage.
- Test-only corrections: fiscal tests use the current A4 tab and explicitly
  select Receipt when asserting slip content (format persistence is intended);
  TCP fault proxies avoid Chromium-blocked ephemeral ports (6667 reproduced
  as ERR_UNSAFE_PORT); Portuguese fixtures set both device and user language;
  archive fixture accepts the isolated test database name and has explicit
  array types. New browser fixtures choose the device role and account for
  the NIF included in customer option labels. Stock tests explicitly disable
  overselling and await the changed authoritative levels before clicks.
- Added browser/Electron coverage for Portuguese split rows/sidebar at
  1024x768, 1366x768 and 1280x800; quote buyer name/NIF/address and one-off NIF;
  bidirectional print toggle and persistence; accountant navigation; SKU
  suggestions/overwrite; current price policy; hide-zero persistence.
  Enhanced stock-count UI tests exercise valid/invalid XLSX as well as CSV.
- Added 5 API regressions for bank CSV/XLSX parse/map/import, explicit skipped
  invalid rows, corrupt/sheetless/truncated/expanded XLSX, all-invalid CSV
  import rejection and old archive request compatibility. Snapshot-less
  archive requests are safely rejected for both zero and stocked products;
  current snapshot requests succeed. The report documents the upgrade path
  and distinguishes emulated old payloads from an actual old binary update.
- Passing completed checks: API integration 39 suites / 354 tests; API unit
  47 suites / 303 tests; web 50 files / 257 tests; desktop unit 29 tests.
  Added browser/Electron UI 4/4; archive/offline fault checks 6/6.
  API/web/desktop TypeScript, strict touched E2E TypeScript, API-test lint and
  diff checks pass. Temporary API and desktop UI builds succeed; existing
  bundle-size/jspdf warnings remain.
- Full desktop final clean result: **150 passed, 0 failed, 11 skipped**.
  Eight skipped opt-in cases passed separately; the three packaged updater
  cases remain NOT RUN. Across runs, 158 distinct regression cases pass
  (recovery cases are not double-counted). Earlier failures were classified
  and corrected as test-only issues above, not hidden or counted as passes.
  Final JSON: `pos-1c-desktop-clean-final.json` in OS temp; supplemental UI,
  fault and API JSON reports are listed in the final verification document.
- Confirmed remaining application defects through isolated diagnostics:
  opposite-order two-product actual sales produce [500,201] (40P01 deadlock).
  Loser rollback is complete; manual retry and clientId replay produce no
  duplicates, with two sales/two fiscal documents and stock [8,8]. Holding a
  stock row 6.5 seconds produces 500 with no sale and unchanged stock. Global
  writer lock ordering/retry/readable timeout handling remain a concurrent
  multi-till sign-off blocker; no inventory fix was implemented here.
- Malformed percent-encoded bank upload URL returns 500 instead of 400
  (decodeURIComponent before parse error handling); no statement is created.
  Normal base64 uploads and bounded malformed XLSX tests pass. This P2
  validation defect is reported for separate correction/explicit acceptance.
- Item 8 still needs the owner's decision: cost zero allowed; sell zero only
  with free-item flag/workflow. Verified, not silently changed. Packaged
  updater/actual old-binary upgrade, physical hardware, real email and AGT
  submission are not tested here. Do not give unconditional launch sign-off.
- Isolation: fresh `pos-1c-final-pg` cluster on loopback 55509, synthetic user
  `pos_1c_test`, new UTC databases `pos_prompt1c_desktop_test` and
  `pos_prompt1c_api_test`; the final full desktop rerun uses a third fresh
  UTC database `pos_prompt1c_desktop_clean_test`. Each received 49 existing
  migrations and synthetic
  fixtures. API/web/fault ports 55510/55511/55512/55472. Temporary services
  and cluster are stopped after verification, with artifacts retained. No existing demo or
  production database, real credentials, push, merge, deploy or Prompt 2.


### Accounting SQL timezone correction: completed

- Fixed the genuine non-UTC PostgreSQL session defect previously reproduced
  on `651b292`: SQL DATE comparisons implicitly promoted calendar dates to
  session-local instants. Today's documents could be summarized early; date
  ranges could omit their first/last day.
- Added accounting-only `sqlDate` (validated calendar string cast to DATE)
  and `sqlUtcTimestamp` (instant converted to UTC-naive timestamp) helpers.
  Applied them to document/payment integration start dates, daily summaries,
  timestamp-source integration, pending counts and IVA date predicates.
  Columns remain uncast in comparison predicates, preserving index use.
- Purchase IVA fallback now converts UTC-stored createdAt to the business's
  local calendar before taking its date. Explicit supplier document dates
  remain authoritative. `dateValue()` is unchanged for Prisma date writes.
- Preserved the existing clock policy: books, integration start/range bounds
  and summary eligibility use the business-country clock (AO: Africa/Luanda).
  Explicit store overrides still determine fiscal document/source transaction
  dates. Purchase IVA's missing-date fallback uses the business clock, even
  when the store overrides its zone. Per-store summary closing would be a
  separate product-policy change; it is not introduced here.
- Added `accounting-timezones.e2e-spec.ts`: 11 actual database/service/API
  regressions, run unchanged against UTC, Europe/Moscow, Africa/Luanda and
  America/New_York; the suite checks its configured session timezone.
  Coverage includes Luanda midnight, month/year boundaries and leap day,
  summary eligibility, repeated integration, delayed offline arrivals,
  inclusive start dates, first/last-day document/payment pending counts,
  UTC timestamp boundaries for purchases/expenses/shifts/cash/stock,
  IVA charged/deductible/cativo totals, business-local purchase fallback,
  period-close refusal and retry, and explicit store overrides.
  Issued fiscal documents are compared unchanged after integration; posting
  date, transaction date, year and period are checked against their dates.
- Final verification: accounting E2E (original 54 + new 11) **65/65 in
  each of UTC, Europe/Moscow, Africa/Luanda and America/New_York**. UTC's
  accounting suites also pass within the full API run: **38 suites / 349
  tests passed**, including fiscal/signing/SAF-T, offline sales, archive,
  stock counts, isolation and adjustment concurrency. API unit: **47 suites /
  303 tests passed**. Full-source API TypeScript (including tests), touched
  ESLint, whitespace checks and API build into temporary output pass.
  No remaining failures in the final runs. Jest retains the existing
  force-exit/open-handle advisory from the integration test configuration.
- Repeat the matrix with `POS_ACCOUNTING_TEST_TIMEZONE` set to the assigned
  PostgreSQL timezone and an explicit isolated `DATABASE_URL`; run
  `jest --config test/jest-e2e.json --runInBand accounting.e2e-spec.ts
  accounting-timezones.e2e-spec.ts`. The full suite requires synthetic seed
  fixtures in its own fresh database. JSON reports remain in the OS temp
  directory as `pos-accounting-{moscow,luanda,newyork}-e2e.json` and
  `pos-accounting-full-seeded-e2e.json` (UTC full suite).
- Isolation: fresh temporary cluster `pos-accounting-date-fix-pg`, loopback
  55489, synthetic user `pos_accounting_test`. Four new timezone databases
  `pos_accounting_{utc,moscow,luanda,newyork}_test` received all 49 existing
  migrations. A fifth fresh UTC database `pos_accounting_full_test` contains
  the repository's synthetic seed fixtures required by older API suites.
  No existing demo/production database, real credentials or fiscal data used.
  The temporary cluster is stopped; test databases/builds/reports are retained
  under the OS temp directory for inspection.
- Initial validation caught test fixture assumptions (default service type
  versus goods account) and the old suites' seeded-data dependency. Fixtures
  were corrected and the full run moved to the new seeded test database.
- No migration, historical data repair, fiscal numbering/signing/storage,
  stock writer or outbox changes. Existing records are never rewritten by
  this fix. If accounting ran with non-UTC database sessions, review prior
  partial summaries, missing start-date records, IVA boundary totals and
  closed periods separately; corrected queries can reveal previously hidden
  pending records. No automatic historical correction is attempted.
- Item 8's zero-cost/free-item decision, full desktop suite/zz-probe coverage
  and the existing Electron upstream-cancellation limitation remain separate
  outstanding work. No Prompt 2, push, merge or deployment.


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

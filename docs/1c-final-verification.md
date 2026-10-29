# Prompt 1c final verification - 2026-10-29

Historical verification snapshot at `560dc60`: the checkout contention
findings below are superseded by the subsequent correction and regression
evidence in `1c-implementation-progress.md` (Multi-till checkout contention).
Other outstanding decisions/limitations below remain unchanged.

Recommendation: **do not give unconditional Prompt 1c / multi-till launch
sign-off yet**. Functional regressions have broad passing coverage, but
multi-product contention causes real checkout failures, and item 8 still
requires the owner's product decision. This verification makes test-only
corrections; no application behavior or fiscal logic is changed.

## Environment and evidence

Branch: `rescue/pos-codex-20261029`, application baseline `ffae264`.
Fresh temporary PostgreSQL cluster `pos-1c-final-pg`, loopback 55509, synthetic
user `pos_1c_test`; fresh UTC databases `pos_prompt1c_desktop_test` and
`pos_prompt1c_api_test`; final clean desktop rerun uses the additional fresh
UTC database `pos_prompt1c_desktop_clean_test`. All 49 existing migrations
and synthetic seed fixtures were applied there only. No existing demo/production database accessed.
Temporary API 55510; browser servers 55511 (direct) and 55512 (fault proxy
55472); desktop UI/API builds and machine-readable reports are in OS temp.
Electron uses the repository's test signing key. Email credentials and an
update feed are not configured. All retained data belongs to this verification.

| Status | Check | Evidence / limitation |
|---|---|---|
| PASSED | Full desktop suite | Final clean rerun: 150 passed, 0 failed, 11 skipped; eight opt-in cases passed separately, three packaged-update cases remain NOT RUN. |
| PASSED | Added browser + Electron UI | 4/4 in `prompt1c-verification.spec.ts` and enhanced `recovery-1c.spec.ts`; Portuguese 1024x768 / 1366x768 and sidebar 1280x800. |
| PASSED | Archive/offline fault regressions | 6/6 in `archive-stock.spec.ts` / `offline-stock.spec.ts`, both Edge and real Windows Electron. |
| PASSED | Full API integration | 39 suites / 354 tests, including accounting/timezone, bank parser, old-client compatibility, isolation, concurrency, bulk counts, fiscal/signing, offline sync and display. |
| PASSED | API unit | 47 suites / 303 tests. |
| PASSED | Web unit | 50 files / 257 tests. |
| PASSED | Desktop unit | 29 tests. |
| PASSED | Types / lint / builds | API full-source TypeScript including tests, web/desktop TypeScript, strict check of touched desktop E2E files, API test lint, diff checks, API and desktop UI compilation. Existing bundle-size/jspdf warnings remain. |
| FAILED | Multi-product deadlock diagnostic | Actual sale requests: HTTP 500 and 201; PostgreSQL 40P01. Atomic rollback verified. Manual retry and replay succeed without duplicates. This failure is outside the passing automated-suite counts. |
| FAILED | Lock-wait checkout diagnostic | Holding one stock row 6.5 seconds produces HTTP 500 after about 6.5 seconds; zero sales saved and stock unchanged. |
| FAILED | Malformed bank data URL | `data:text/csv,%E0%A4%A` returns 500, not a validation 400; no statement created. Outside the passing suite counts. |
| NOT RUN | Packaged updater tests | 3 conditional tests require a packaged executable and signed/local update feed; no installer/update feed built or installed in this verification. |
| NOT RUN | Physical devices / real email / AGT | Printer/display/drawer tests use PDF/network simulations; no real email credentials or regulatory submission. |
| NOT RUN | Historical books | Separate read-only plan only; no existing business records inspected. |
| EXCLUDED | `zz-probe.spec.ts` | Preserved unchanged; default Playwright testIgnore excludes this logging-only diagnostic: hardcoded personal scratchpad path, no assertions, no failure-safe teardown. It is not a passing regression test. |

Across the full run and separate opt-in runs, 158 distinct regression cases
pass; three packaged-updater cases are not run. The two recovery cases appear
in both full and supplemental UI runs and are not double-counted. Earlier
full-run failures are classified below and their corrected tests pass in the
final clean run; the product diagnostics remain FAILED, not waived.

Final machine-readable reports (OS temp): `pos-1c-desktop-clean-final.json`,
`pos-1c-final-ui.json`, `pos-1c-fault-regressions.json`,
`pos-1c-final-api-e2e.json`. Temporary services/cluster are stopped after
verification; artifacts are retained. No push, merge or deployment.

The current accounting suite is rerun on UTC here. The unchanged accounting
correction's four-timezone evidence is recorded under `ffae264`: 65/65 in each
of UTC, Europe/Moscow, Africa/Luanda and America/New_York. The other three
PostgreSQL timezone environments were not rerun in this verification.

## Prompt 1c requirements matrix

| Item | Result | Runtime evidence |
|---|---|---|
| 1 Split payments | PASSED | Browser/Electron: real Portuguese labels, two and three payment rows, clipping assertions at 1024x768 and 1366x768. |
| 2 Sidebar | PASSED | Browser/Electron back-office navigation and horizontal-overflow checks; full desktop also checks enlarged text and 125% zoom. |
| 3 Accountant navigation | PASSED | Real synthetic ACCOUNTANT login in both runtimes: Back to POS absent. API accountant permissions remain covered. |
| 4 A4/receipt toggle | PASSED | Both directions and choice retained after reload in both runtimes; fiscal number shown in A4. Desktop print/PDF regressions also run. |
| 5 Stock warnings / offline | PASSED | Fresh zero stock blocks online; OS-offline and server-down both allow add/increase/charge, outbox sync and same fiscal number on reconnect. Overselling policy tested both ways. Hide-zero preference survives reload in both runtimes. |
| 6 Archive/delete | PASSED with rollout note | 500, real timeout, retry, cached zero, stale confirmation, stock quantities, normal archive and permanent-delete safeguards in both runtimes. API rejects legacy snapshot-less requests. See update path below. |
| 7 Quote buyer | PASSED | Saved name/NIF/address in A4 quote and one-off NIF edits in browser/Electron; quote does not create a sale. Shared quote rendering unit coverage preserved. |
| 8 Prices | NEEDS DECISION | Negative costs/prices rejected; cost zero currently allowed; sell zero requires free-item flag/workflow. Verified in UI/API/import coverage. Literal positive-cost requirement and free-item approval remain unresolved; behavior deliberately unchanged. |
| 9 SKU prefixes | PASSED | Suggested SKU and manual overwrite in both runtimes; API concurrent counter and business/category isolation tests pass. |
| 10 Bulk stock count | PASSED | Save all and preview in both runtimes, invalid/valid CSV and XLSX preview; API atomicity, movement/audit and stale-baseline rejection tests pass. |
| 11 Shift parity | PASSED | Back-office report equals closing summary, payments, cash/difference, products, sales list and print content in browser/Electron. |
| 12 Fiscal display | PASSED | Shift/print/sales list and actual CSV Blob use fiscal numbers; native fiscal/signature/offline tests preserve issued numbering. |

## Failures found and classification

**Test-only issues corrected:** obsolete A4-invoice button selector; fiscal
helper assuming every new sale opens Receipt even after A4 was remembered;
Windows ephemeral proxy port 6667 blocked by Chromium (test proxy now avoids
known blocked ephemeral ports); fixture device-role/language consistency and
customer option label including its NIF; stock tests explicitly disable
overselling and wait for the changed authoritative inventory response before
clicking. Strict E2E compilation also added a
missing fixture-array type. No production fix was made for these test issues.

**Confirmed application defects retained:**

1. **Multi-product lock order / wait handling: concurrent launch blocker.**
   `stock/stock.ts:38` locks one inventory row at a time. Bulk counts sort
   product IDs (`inventory/inventory.service.ts:57`), while sales take cart
   order (`sales/sales.service.ts:338`), imports take row order and transfers
   lock source/destination in request order (`transfers/transfers.service.ts:73`).
   Two carts [A,B] and [B,A] can each hold their first row and wait for the
   other. A diagnostic barrier after the first real upsert forced this with
   actual sale requests: [500,201], one sale/two movements/stock [9,9]. The
   failed request issued no fiscal document. Manual retry returned 201;
   replaying its clientId returned the same sale, leaving two sales/two
   documents and stock [8,8]. A separate held-row test produced 500 after
   6.5 seconds, with stock 10 and no sale. Atomicity is preserved; availability
   and the user-facing failure are the problem. There is no deadlock retry.
   Recommend one consistent (storeId,productId) prelock order across writers,
   bounded whole-transaction retry for identified transient failures, and
   readable contention errors. Verify reverse carts, count/sale, imports,
   opposite transfers, timeouts, clientId replay and fiscal transaction rollback
   before multi-till launch. These are separate implementation work.
2. **Malformed bank upload URL: validation defect (P2).**
   `accounting/bank.service.ts:26` decodes percent-encoded data before the
   parsing try/catch. A URIError escapes as HTTP 500. Normal base64 CSV/XLSX
   uploads and bounded corrupt/expanded workbook handling pass. No statement
   is written by the failing parse. Move decoding into validated error handling
   in a separately approved fix; do not mask it as a passing malformed-input test.

The bank CSV reader intentionally remains permissive for preview (stock
count CSV uses strict parsing). Invalid bank dates/amounts are reported as
skipped rows; an entirely invalid import returns 400 with no new statement.

## Older archive clients: safe failure and update path

Legacy `PATCH /products/:id {isActive:false}` returns 409, for both stocked and
zero-stock products, without changing the product, movements or audit count.
The message currently says "Stock must be reloaded and reviewed before
archiving"; it does not automatically explain a binary upgrade. Do not loop
blind retries or bypass the guard with database changes.

- Web: load the matching current web bundle/API, close old tabs and complete
  the normal web/service-worker update, then reopen the product editor.
- Installed Electron: install a release containing `01fe5ee` or later and
  restart. Reloading the old embedded bundle alone cannot add the new payload.
  Packaging/versioning/installer distribution is a release task, not done here.
- Custom API clients: GET product stock, present nonzero per-store quantities
  for confirmation, then PATCH with the reviewed `archiveStock` snapshot;
  send [] only for verified zero. On 409, reload/review again. Current-client
  zero and positive snapshot requests were tested successfully.
- A real old packaged binary/PWA upgrade was not exercised: old request shape
  was emulated at the API. Document this rollout requirement before release;
  clearer in-app "update this client" guidance is a remaining UX improvement.

The existing Electron protocol forwarder (`apps/desktop/src/protocol.ts:125`)
does not propagate renderer aborts upstream. A timed-out upstream request can
linger until the connection/server closes it. Archive UI timeout/retry tests
pass safely; transport cancellation remains unchanged. No production load
frequency or real old-PWA/installer upgrade was measured here.

## Required before sign-off

1. Resolve multi-writer deadlocks/lock-wait UX, or explicitly constrain and
   accept the deployment risk; no unconditional concurrent/multi-till approval.
2. Decide item 8's positive-cost and free-item policy, then verify the approved
   behavior consistently in form/API/import/till overrides.
3. Fix or explicitly accept the malformed bank upload validation defect.
4. Complete release validation for packaged updater and archive-client upgrade
   path. Hardware/email/AGT checks remain deployment-specific, not silently
   counted as passing here.
5. If existing books may have used non-UTC sessions, separately authorize the
   read-only investigation described in `1c-historical-accounting-reconciliation-plan.md`.
   This verification authorizes no historical repairs or production access.

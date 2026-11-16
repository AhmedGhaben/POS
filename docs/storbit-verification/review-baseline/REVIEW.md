# STORBIT baseline and Windows Electron crash investigation

Recorded 14 November 2026, Europe/Moscow. Implementation is blocked; this is not a verified baseline or redesign sign-off.

Branch: `ui/storbit-visual-v2`. HEAD: `229ce1519c421290a425c25a652a21feadc40e53`.
No tracked source changes existed at inspection, and no application source changes were made in this session. Existing untracked handoff, verification, .claude and .local-desktop files were preserved. No push, merge, migration, release or deployment was performed.

## Electron exception 0x80000003

The preserved `electron-crash-context.md` contains Electron's launch stderr and process termination, including:

> FATAL:electron\shell\browser\win\install_dir_access.cc:52

Electron reports that sandboxed processes cannot read its installation directory because the ACL has an AppContainer package SID entry but no ALL APPLICATION PACKAGES entry. The process then exits with decimal `2147483651`, hexadecimal `0x80000003`. This identifies an Electron fatal installation-access check, rather than a checkout/fiscal assertion failure. An earlier stderr message reports OS encryption failure (0x2); the explicit fatal message identifies the launch blocker. No dump/stack analysis was performed, and the generic exception code alone would not establish this cause.

The crash context records 04:01:22 local time. It was preserved from a test-results artifact already present when the investigation began; it is not falsely presented as a fresh isolated reproduction. The current baseline run independently fails Electron launch-dependent setup (see electron-e2e.log). The current directory ACL was captured read-only in electron-install-acl.txt; it lacks ALL APPLICATION PACKAGES, but does not display the package SID described by the earlier process. Therefore the precise ACL state inside that crashed process and which environment operation produced it remain unverified. No ACLs or sandbox flags were changed.

Regression classification: **pre-existing in the unchanged source baseline, not introduced by this redesign**. There are no redesign source edits. Previous session-baseline/electron-e2e.log already records launch/setup failure. The oldest baseline/electron-e2e.log records 146 passed, 1 failed, 17 skipped, 1 did not run, including a separate Portuguese receipt completion failure. Thus Electron has worked in an earlier environment/run; this does not establish that the current execution environment or Windows installation is healthy. Historical logs are contextual evidence, not new test results or proof of identical environment.

Windows launch remains unresolved. Do not bypass it with --no-sandbox or change main/preload/IPC, business or fiscal code. Restoring a supported Electron installation/access environment and rerunning the full suite is required before Windows sign-off.

## Fresh before-change commands and results

Each named log in this directory records its command output. Completed commands include EXIT_CODE. Interrupted commands have no final suite summary; partial output must not be counted as a completed suite.

| Command | Result |
| --- | --- |
| `npm.cmd run lint` | Exit 0; 0 errors, 4 existing React fast-refresh warnings. |
| `npm.cmd run test --workspace apps/api -- --runInBand` | Exit 0; 49 suites passed, 324 tests passed, 0 failed; 0 snapshots. No skipped tests reported. |
| `npm.cmd run test --workspace apps/desktop` | Exit 0; 8 suites, 29 passed, 0 failed, 0 skipped/cancelled/todo. |
| `npm.cmd run test --workspace apps/web` | Exit 1 before test collection; esbuild cannot read ../../../.. (access denied) and cannot resolve vitest.config.ts. No test pass/fail/skip counts available. |
| `node_modules/.bin/tsc.cmd -p apps/api/tsconfig.json --noEmit` | Exit 0. |
| `node_modules/.bin/tsc.cmd -p apps/web/tsconfig.json --noEmit` | Exit 0; project-reference build is separately covered by attempted workspace build, not equivalent to full web build success. |
| `node_modules/.bin/tsc.cmd -p apps/desktop/tsconfig.json --noEmit` | Exit 0. |
| `npm.cmd run build` | Interrupted with Ctrl+C after API and desktop stages advanced successfully; web stage had reached tsc -b && vite build without final result. Not passed. |
| `npm.cmd run test:e2e --workspace apps/api` | Interrupted with Ctrl+C; partial output includes isolated-local-test-database guard failures and some passing suites. No final totals. No migrations/seeding or database configuration changes were made. |
| `npm.cmd run test:e2e --workspace apps/desktop` | 165 tests discovered; interrupted with Ctrl+C after repeated launch-dependent setup failures. No complete totals; Windows critical workflows not verified. |

The interrupted commands were stopped once the environment blockers and Electron crash were understood, to avoid repeated crash attempts. These are incomplete checks, not successful full-suite runs. Final post-redesign checks were not run because implementation never started.

## Scope, visuals and outstanding verification

Styling entry points identified: apps/web/src/styles/globals.css (light/dark tokens, touch and protected print rules), apps/web/tailwind.config.ts, shared apps/web/src/components/ui components, layout shells/sidebar, and feature presentation classes. The print rules must remain untouched. No styling, behavior or protected application files changed; only review evidence was added.

The supplied original PNG remains reference-only. No logo surface, app icon, Electron packaging, merchant branding or fiscal document was replaced. Final reviewed vector/dark/light/transparent and icon artwork is still missing as described in the handoff.

No before/after screenshots were captured in this session. Light/dark, English/Portuguese, 1024x768 and 1366x768, contrast, keyboard/barcode focus, touch, modal scrolling and overflow remain unverified. No accessibility pass is claimed.

Critical checkout/split payments, till/held orders, offline/resync/idempotency, fiscal signatures/QR/IVA/print outputs, inventory/concurrency, accounting/reports/SAF-T, roles/navigation/store switching and Windows Electron manual workflows remain unverified. Unit-test passes do not replace these checks. No behavioral differences caused by a redesign were observed because no redesign was applied; functional equivalence is not certified.

**LOCAL UI IMPLEMENTATION ONLY — NOT DEPLOYED. Implementation not started; blocked at baseline verification.**

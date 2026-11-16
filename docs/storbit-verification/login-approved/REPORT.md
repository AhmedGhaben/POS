# STORBIT approved login implementation - final local verification

LOCAL UI IMPLEMENTATION ONLY - NOT DEPLOYED. Implementation repairs completed; manual visual acceptance and release gates remain outstanding.

## Current results (resume, 14 November 2026)

This section supersedes the stopped handoff retained below as historical evidence. Branch and HEAD remain ui/storbit-visual-v2 / 229ce1519c421290a425c25a652a21feadc40e53. All pre-existing uncommitted work was preserved. No commit, push, merge, deploy, reset, discard, security weakening, production-data access or real hardware access occurred.

### Repairs completed

- Fixed the new render test to identify the email/password controls by ID, then assert type, required and autocomplete independently. Password-toggle assertions likewise no longer depend on attribute ordering. These are server-rendered control-contract tests, not simulated browser interaction tests.
- Repaired damaged Portuguese accents in the newly added/changed login copy in pt-PT and pt-BR, and the regional-option separators in LoginLayout.tsx. Files were explicitly read/written as UTF-8; all non-login translation values were programmatically compared before/after and preserved. Added regression assertions for the exact accented headline, replacement-character absence and damaged question marks in the affected copy. pt-AO derives from pt-PT and is included in the passing render tests.
- No authentication handler, session policy, API, business logic or desktop source changed during this resume.

Resume source changes: apps/web/src/routes/login.test.tsx, apps/web/src/locales/pt-PT/auth.json, apps/web/src/locales/pt-BR/auth.json, apps/web/src/components/layout/LoginLayout.tsx (regional separators only). Documentation/evidence updates are confined to this verification directory. The previous implementation file list remains below.

### Fonts, logos and colors

Searched repository font assets, dependency filenames, Windows system fonts and the current user's font directory for Poppins. No usable Poppins binaries found. Retained existing local Poppins lookup with Inter/system fallback; no downloads, dependencies or licensing assumptions introduced. Bundled Inter Regular/SemiBold retain their SIL OFL notice. Poppins rendering remains unavailable/unverified.

Re-inspected both original wordmark images visually; production copies are byte-identical to supplied files. Both are 2172x724 RGBA PNGs with alpha range 0..255. Dark mode uses storbit-logo-light.png; light mode uses storbit-logo-original.png via the existing ThemeProvider. No recoloring, redrawing or proportion changes.

SHA-256:
- Original: 863d32ad93f5cd83179af4105f7be9d42b59d3e530c2c0f2f9b32efecf1a0c30
- Light: f57e6d88bb563934003c19dedc413b9ce103577d9122f95327a97279b08d09e2

Source assertions confirmed dark button default #EDEBFF, hover #DCD6FF, pressed #C9BFFF, text/arrow #0F1221 and focus outline #B84DFF. The button has no background image; light-mode button remains solid #0F1221/white. Asset/source evidence: asset-source-verification.json. This verifies declarations and original assets, not browser-computed rendering.

### Final checks on repaired source

| Exact command | Result | Evidence |
| --- | --- | --- |
| npm.cmd run test --workspace apps/web | PASS: 52 files; 274 passed, 0 failed, 0 skipped (original 267 plus 7 login cases) | web-final.log |
| npm.cmd run lint | PASS: 0 errors, 4 existing react-refresh warnings in badge, button, form and ThemeProvider | lint-final.log |
| npm.cmd run build | PASS: workspace API, desktop and web builds | build-final.log |
| npm.cmd run build:desktop --workspace apps/web | PASS: desktop renderer | renderer-final.log |
| node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit | PASS, exit 0 | typecheck-web-final.log |
| node node_modules/typescript/bin/tsc -p apps/api/tsconfig.build.json --noEmit | PASS, exit 0 | typecheck-api-final.log |
| node node_modules/typescript/bin/tsc -p apps/desktop/tsconfig.json --noEmit | PASS, exit 0 | typecheck-desktop-final.log |
| git diff --check | PASS, exit 0; existing LF/CRLF notices only | diff-check-final.log |
| npm.cmd run test --workspace apps/desktop | 27 passed, 2 failed, 29 total; 0 skipped/cancelled; both failures due to loopback EACCES, detailed below | desktop-resume.log |
| npm.cmd run test --workspace apps/api -- --runInBand | BLOCKED: all 49 suites fail before execution; 0 tests executed due to EPERM on Jest cache renames | api-resume.log |

Build warnings remain: mixed static/dynamic jspdf imports and large bundle chunks. Web render tests emit React Router's server-rendering useLayoutEffect warnings; these are not lint errors or failing tests. No tests were deleted, skipped or weakened to hide failures. The corrected assertion still verifies the intended control contract.

### Exact desktop failure diagnosis

Both failures are in apps/desktop/src/hardware/hardware.test.ts, suite Tcp9100Transport:

1. `delivers the exact bytes to a network printer`: failed before byte delivery because connect to its synthetic loopback server returned `connect EACCES 127.0.0.1:3406`. Test source creates a stand-in net.Server bound to 127.0.0.1 on an ephemeral port; no real printer involved.
2. `a refused connection is a clear TransportError`: expects the ECONNREFUSED mapping `refused the connection` after closing that synthetic server, but the OS denied the connection with `connect EACCES 127.0.0.1:3408` instead. TransportError itself was produced; the permission error prevented the expected refusal path.

Inspection of hardware.test.ts and transports.ts confirms these tests exercise only loopback sockets and cannot reach their intended delivery/refusal conditions in this sandbox. This is environment permission evidence, not an identified login regression. Desktop/API/shared-package source diffs are empty. No network permission changes, bypasses, mocks replacing the desktop assertions or production logic edits were made. Full 29/29 desktop verification remains required on the host.

API initialization again fails with EPERM renaming transform-cache map files under the managed sandbox temporary directory. No API assertions ran, so the supplied 324/324 host baseline is not reproduced. No cache-permission repair loop attempted.

### Remaining verification / host handoff

Per the owner's explicit instruction, Edge screenshot automation was NOT retried. Prior verify.cjs and results.json remain preserved as historical blocked evidence. No new screenshots or running-app visual claims. Inspect /login in a normal host browser at desktop 1366x768 and 1024x768 and mobile 390/320 widths, both themes, English and Portuguese, keyboard focus, password visibility, error/loading states, logo proportions, touch targets and overflow. Existing pos-theme/pos-language settings select themes/languages; no production theme selector was added.

Host commands still required where sandbox execution was blocked:
- npm.cmd run test --workspace apps/desktop (expect all 29, including both Tcp9100Transport cases)
- npm.cmd run test --workspace apps/api -- --runInBand (supplied baseline 324)

Existing API E2E, Windows Electron E2E and critical manual checkout/till/offline/fiscal/inventory/accounting/permissions workflows remain outstanding release gates. No Docker/Electron troubleshooting or release sign-off performed. Missing bundled Poppins remains a typography limitation. Remember-me remains absent because the existing implementation has no such control and its persistence policy was intentionally preserved.

All source remains uncommitted: the existing 26 tracked modified files and untracked directories/assets/components/tests/styles/evidence remain in place. No protected business changes introduced. Repaired implementation is ready for the requested normal-browser manual review; it is not a claim of full end-to-end or visual verification.

---

## Historical stopped handoff (superseded by current results above)

# STORBIT approved login implementation - stopped handoff

LOCAL UI IMPLEMENTATION ONLY - NOT DEPLOYED. Partial implementation; no verification or release sign-off.

## Repository protection

Branch: ui/storbit-visual-v2
HEAD: 229ce1519c421290a425c25a652a21feadc40e53 (unchanged).
Initial tree: 23 tracked modified files, plus untracked .local-desktop, brand/font assets, design references, handoffs and verification materials. Preserved; no reset, clean, stash, commit, push, merge or deployment.
Final tree: 26 tracked modified files (the previous 23 plus three auth locale files), existing untracked directories and the new login files/evidence listed below. No API, desktop or shared-package tracked diffs. Existing POS/shared-component work predates this task and remains untouched.

## This task's files

Presentation:
- apps/web/src/components/layout/LoginLayout.tsx (new)
- apps/web/src/styles/storbit-login.css (new, scoped to .storbit-login)
- apps/web/src/routes/login.tsx (existing dirty file extended; replaced the earlier CTA class only within login, leaving its global definition and all other earlier work intact)
- apps/web/src/locales/en/auth.json
- apps/web/src/locales/pt-PT/auth.json
- apps/web/src/locales/pt-BR/auth.json
- apps/web/public/brand/storbit-logo-original.png (new byte-for-byte copy)
- apps/web/public/brand/storbit-logo-light.png (new byte-for-byte copy)
Documentation/testing:
- docs/brand-reference/README-CODEX.md (existing untracked reference updated)
- apps/web/src/routes/login.test.tsx (new, seven render cases)
- docs/storbit-verification/login-approved/verify.cjs (new isolated browser harness)
- docs/storbit-verification/login-approved/results.json (browser launch failure evidence)
- docs/storbit-verification/login-approved/REPORT.md (this report)
Protected business logic: no changes made by this task.

## Implemented

Desktop uses the sole approved HTML reference's 46.5/53.5 split, two-tone panels, original wordmark, approved English headline and introduction, authentication heading, account/recovery links and a static illustrative mini dashboard with visible SAMPLE DATA. No dashboard data hooks or API calls were added.
Mobile at <=760px uses a compact brand header, short introduction, gradient divider and form immediately beneath; dashboard is hidden and no duplicate logo is rendered. Control sizes and natural document scrolling are specified in CSS.
Existing ThemeProvider chooses the exact original PNG variant. Light primary button is solid #0F1221 with white text. Dark default/hover/pressed are #EDEBFF/#DCD6FF/#C9BFFF, text/arrow #0F1221, focus #B84DFF. No theme selector added.
One language group offers EN and Portuguese regional choices through the existing useLanguage hook. Existing pt-PT, pt-BR and pt-AO choices remain available. This differs visually from the reference's two simple buttons to preserve all existing language choices.
The original submission handler, login API call, navigation, session/token storage, till PIN branch, validation, input IDs, autocomplete and loading handling remain unchanged. Password visibility was added as explicitly requested, using a type=button control and accessible name/pressed state. Error text now has role=alert.
Remember-me was absent from the existing login. The existing store always persists sessions. No fake checkbox or session-policy change was introduced; the reference's checkbox remains unimplemented.

## Assets and typography

Read README-CODEX, full approved HTML, brand tokens and full implementation handoff including Section F and its owner amendment. Did not recreate the removed HTML.
Actual board filename: storbit-brand-board.png.png.
Visually inspected the supplied board and both wordmark files. Both wordmarks preserve the original lettering/star composition; files are RGBA, 2172x724, with alpha range 0..255. Integrated exact copies without redrawing, filtering or recoloring. This does not constitute vector/icon packaging approval; existing separate release gates remain.
Inter Regular/SemiBold local WOFF files and their existing SIL OFL notice are available. Reused the existing screen-only font declarations. Poppins is not bundled; existing local Poppins lookups fall back to Inter/system. Authentic Poppins rendering is NOT verified. No external font dependency added.

## Checks actually run

| Command | Result |
| --- | --- |
| npm run test --workspace apps/web (PowerShell shim) | Blocked by AuthorizationManager; used npm.cmd without changing execution policy |
| npm run lint (PowerShell shim) | Same shim restriction |
| npm.cmd run test --workspace apps/web, before changes | 51 files, 267 passed, 0 failed |
| npm.cmd run lint, before changes | Passed: 0 errors, 4 existing warnings |
| npm.cmd run build, before changes | Passed workspace API/desktop/web build and TypeScript steps |
| npm.cmd run test --workspace apps/web, first implementation | 51 files, 267 passed, 0 failed |
| npm.cmd run build:desktop --workspace apps/web, first attempt | Failed on new translation namespace type; corrected UI-only type error |
| npm.cmd run build, after type correction | Passed, including web/desktop/API TypeScript; existing chunk-size and mixed jspdf import warnings |
| npm.cmd run build:desktop --workspace apps/web, after type correction | Passed; existing bundle warnings |
| npm.cmd run lint, after implementation | Passed: 0 errors, 4 existing warnings |
| node docs/storbit-verification/login-approved/verify.cjs | BLOCKED before page load: sandbox-enabled Edge closed with temporary profile/Crashpad errors; 0 of 16 cases executed, no screenshots |
| npm.cmd run test --workspace apps/web, with new tests | 51 files passed, 1 failed; 273 tests passed, 1 failed, 274 total; all original 267 still passed, 6/7 new tests passed |
| npm.cmd run test --workspace apps/desktop | 29 tests: 27 passed, 2 failed, 0 skipped/cancelled; 8 suites. Failure cause not established. No desktop source changed. STOP condition against owner-supplied 29/29 baseline |
| npm.cmd run test --workspace apps/api -- --runInBand | 49 suites failed to initialize; 0 tests executed; EPERM renaming Jest transform-cache files in sandbox temporary storage. Not 324 failing assertions |
| git diff --check | Passed, exit 0; existing Git LF/CRLF notices only |

The final build/lint passes preceded the last small CSS, logo-dimension, subtitle-localization and test-file edits. Consequently they are not claimed as verification of every final byte. No more builds were started after the stop condition. API and desktop 324/324 and 29/29 are supplied host results, not reproduced here.

## Required stop and unfinished items

Stopped further implementation when desktop returned 27/29 rather than the supplied 29/29. No protected code was changed to force tests green. No permission escalation or security bypass attempted.
The new web failure is an over-specific assertion at login.test.tsx:22 expecting adjacent id then type attributes. React renders type before id; the intended control exists. This new test still needs correction and rerun; tests were not weakened or deleted.
Final inspection also identified encoding damage in newly added Portuguese strings: accented characters became question marks during the PowerShell-to-Python transfer. Regional option separators also contain question marks. Existing locale values outside the added/changed login copy remain intact. These new strings require UTF-8 repair before acceptance. English copy is preserved.
The browser harness has not executed any assertions. Password-toggle interaction, error/loading behavior, keyboard focus, button interaction states, theme rendering, alignment and overflow require browser verification. Code/CSS inspection and server rendering are not visual verification.
No before/after screenshots captured. Neither theme nor mobile layout has been visually verified in the running application. Poppins remains unavailable. Remember-me remains absent to preserve session policy.
API E2E, Windows Electron E2E and the critical manual checkout/till/offline/fiscal/inventory/accounting/permissions workflows remain BLOCKED/NOT RUN, as before. No Docker/Electron troubleshooting was attempted. No production data, hardware or real merchant services were accessed.

## Final status

Partial, reviewable local implementation only; not ready for acceptance or release. Existing earlier work and all new changes remain uncommitted. No commit, push, merge, deploy or release occurred.

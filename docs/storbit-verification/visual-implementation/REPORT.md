Latest styling pass: see [STYLING-PASS-REPORT.md](STYLING-PASS-REPORT.md). Historical reports below are preserved.

Latest continuation: see [RESUME-REPORT.md](RESUME-REPORT.md). The stage-1 account below is historical and preserved.

# STORBIT local visual implementation — stage 1

LOCAL UI IMPLEMENTATION ONLY — NOT DEPLOYED. Partial implementation, no full verification or release sign-off. Branch `ui/storbit-visual-v2`, HEAD `229ce1519c421290a425c25a652a21feadc40e53`; edits are in the working tree, not a completed implementation commit. Existing untracked artifacts were preserved.

## Authorization and stopping point

The owner amended Section F to permit starting local visual work despite missing API E2E and Windows Electron E2E. The amendment is recorded in docs/STORBIT-UI-IMPLEMENTATION-HANDOFF-v2.md. E2E remains mandatory before merge/push/deployment/release sign-off; none is authorized here. The owner also explicitly required stopping when a previously passing check regresses. Stage 1 produced new desktop/API unit-check failures relative to the supplied baseline, so further implementation stopped. No environment repair, rerun workaround, test change, Docker operation, database command or Electron launch was attempted.

## Implemented scope and files

All eight application files changed are styling/presentation only:

- `apps/web/src/styles/globals.css`: appended screen-only UI tokens, neutral actions, purple accent/focus, light/dark surfaces and typography stacks. Original CSS retained as a prefix, including root, print/calibration and touch rules. No gradient introduced.
- `apps/web/src/components/layout/{AuthLayout,BackOfficeShell,PosShell}.tsx`: presentation classes attach UI theme/typography to existing shells. This reaches public authentication pages, POS, back-office modules and device screens through their existing shells. Routes, hierarchy, control order and dimensions unchanged.
- `apps/web/src/components/ui/button.tsx`: visible offset keyboard focus ring; neutral variants unchanged.
- `apps/web/src/components/ui/input.tsx`: white/card surface and subtle shadow; existing height/labels/handlers unchanged.
- `apps/web/src/components/ui/card.tsx`: heading font stack class.
- `apps/web/src/components/ui/tabs.tsx`: card-surface active tab and restrained purple text within themed shells.

No API, Electron, fiscal, receipt, printing, accounting, pricing, permission, state, handler or data edits. No protected application files changed. Shell styling applies broadly, but individual product/cart/payment panels, portal surfaces, login CTA and detailed back-office component treatment have NOT yet been implemented. Do not present inherited token coverage as completed screen-by-screen redesign.

Reviewed references: approved component library board, neutral POS board and back-office operations board. Original logo PNG remains reference-only; no brand surface/logo/icon was replaced. Final approved vector/dark/light/transparent exports and icon confirmation remain missing. Inter/Poppins files are not present in the repository; named font stacks use available local/system fallbacks, with no new dependency/network request. Exact font rendering and multilingual fit are NOT verified.

## Supplied baseline versus fresh stage-1 results

Logs are under `stage-1/`; commands were run once and results below reflect final command exits. Parallel commands were awaited before reporting. No tests were deleted, weakened or skipped to obtain passes.

| Command | Owner-provided baseline | Fresh result |
| --- | --- | --- |
| `npm.cmd run build` | Passed | PASSED, exit 0; workspace compilation, web/PWA generation complete. Existing bundle/import warnings retained. |
| `npm.cmd run build:desktop --workspace apps/web` | Passed | PASSED, exit 0; desktop renderer built. |
| `npm.cmd run lint` | 0 errors, 4 warnings | PASSED, exit 0; 0 errors, same 4 React refresh warnings. |
| `npm.cmd run test --workspace apps/web` | 267/267 | PASSED, exit 0; 51 files, 267 tests passed. |
| `npm.cmd run test --workspace apps/api -- --runInBand` | 324/324 | BLOCKED, command exit 1; Jest reports 49 suites failed to run, 0 tests executed, 0 snapshots. All fail during transform-cache writing with EPERM rename in sandbox AC/Temp/jest. This is NOT 324 failing assertions and not a fresh unit pass. |
| `npm.cmd run test --workspace apps/desktop` | 29/29 | FAILED, exit 1; 29 tests: 27 passed, 2 failed, 0 skipped/cancelled/todo. Failures are Tcp9100Transport loopback fake-printer connection checks. |
| `git diff --check` | — | PASSED; line-ending conversion notices only. |
| API database E2E | Missing | BLOCKED/NOT RUN as explicitly retained by owner amendment. |
| Windows Electron E2E | Missing | BLOCKED/NOT RUN; no launch attempted. |
| Browser/manual critical workflows, before/after screenshots | Unverified | NOT RUN; no screenshots or functional equivalence claim. |

Exact new desktop errors:

- `The network printer 127.0.0.1:7177 connect EACCES 127.0.0.1:7177` in “delivers the exact bytes to a network printer”.
- Expected `/refused the connection/`, received `The network printer 127.0.0.1:7182 connect EACCES 127.0.0.1:7182` in refused-connection TransportError test.

API error: `EPERM: operation not permitted, rename` when Jest atomically renames transform-cache files under `C:/Users/ASUS/AppData/Local/Packages/sandbox.{5942dedc-cae0-417a-825b-053b39de9600}/AC/Temp/jest/`. Full exact paths/stacks are in api-unit.log. These messages point to execution-environment access, but no root-cause repair or source regression attribution was attempted. Both checks differ from the supplied passing baseline and prevent advancing to stage 2 under the owner's stop instruction.

## Static visual checks and remaining work

Computed token contrast ratios (HSL converted to sRGB, WCAG relative luminance; normal solid colors, not rendered screenshots): light text/background 16.58:1, muted/background 5.70:1, action text/background 15.50:1, accent text/background 8.71:1; dark equivalents 17.32:1, 9.34:1, 15.58:1, 8.01:1. White/destructive 6.33:1 light and 6.22:1 dark. These selected text pairs exceed 4.5:1, but do not establish full rendered accessibility or disabled/hover contrast.

Print/touch stylesheet prefix preservation was checked after newline normalization. No new print selectors or print content were added. Functional and deterministic fiscal-output comparison remains NOT RUN. Dialog portals outside shells still use their original theme tokens until a later reviewed visual stage; portal/document boundaries need specific visual review.

No observed behavioral differences can be certified without workflow testing. Layout, Portuguese/English, 1024x768/1366x768, keyboard/barcode focus, touch, modal scrolling/overflow and print-preview review remain unverified. Later stages should finish reusable/portal components, POS detail, login-only gradient CTA and other screens only after the new unit-check failures are resolved or the owner explicitly revises that stop condition. Do not silently treat the existing E2E waiver as a waiver for new unit-test failures.

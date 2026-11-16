# STORBIT remaining styling pass

LOCAL UI IMPLEMENTATION ONLY — NOT DEPLOYED. Branch `ui/storbit-visual-v2`; HEAD `229ce1519c421290a425c25a652a21feadc40e53`, changes uncommitted. Existing visual changes and evidence preserved. No push/merge/deployment, Docker/database commands, Electron launch, browser retry or environment-repair plan.

## Stage 1: palette, portal surfaces, typography and original logo

- Login CTA: reduced the dark overlay from 60% to 30%, retaining the original coral/orange/violet ramp with substantially brighter saturation. White text contrast at the three ramp stops is 6.47:1, 4.98:1 and 10.31:1 using sRGB luminance. Linear RGB-channel interpolation has its highest luminance at a stop, so the calculated minimum is 4.98:1. Rendered states still require visual review. Colorful gradients remain exclusive to login submit; all operational actions remain neutral or existing semantic destructive/status styles.
- Screen-only chart palette: purple series `#7140b8` light / `#bb96ef` dark, with matching neutral ink/grid/axis surfaces. No chart component code, datasets, aggregations, formatting, axes, tooltip logic or exports changed. Existing original root/chart tokens remain intact for non-themed and print contexts.
- Dialogs, dropdowns, sheets, popovers (including combobox/date/numeric-keypad consumers), command-dialog consumers and toasts now attach UI token/font classes at the portal boundary. Existing focus/animation/scroll/placement/close behavior unchanged. Inline menus already inherit the shell theme.
- Inter 400/600 is bundled locally, unmodified, with full SIL OFL copyright/license notice. Files copied from the existing Prisma installation; no package changes or runtime external font requests. Embedded copyright/family metadata inspected; glyph tables checked for Portuguese accented letters, euro and narrow no-break space. Static fonts use normal browser weight matching for intermediate/heavier weights.
- Poppins Medium/SemiBold/Bold local-face lookup added with explicit fallback; Poppins is NOT bundled. No Poppins files found in the repo or Windows font directory. Official upstream binary download attempt failed DNS resolution (`raw.githubusercontent.com`); no permission/network repair attempted. Need approved Poppins binaries plus their license before exact typography sign-off. Never label fallback Inter as Poppins.
- Original approved PNG copied byte-for-byte to `public/brand/storbit-original-reference.png`, shown at preserved aspect ratio on a white plate in the shared authentication card. Suitable for this temporary reference asset even on a dark surrounding page. No recoloring, fake transparency, SVG redraw, favicon, app icon, packaging, store logo or document branding changes. Approved production light/dark vector and transparent exports, icon-only confirmation and OS icon exports remain missing.

## Stage 2: reusable forms, back office and POS

- Shared cards: subtle screen-only shadow; shared table headers and row-hover treatment. Table styling explicitly excludes `.a4-doc` and `.receipt-slip` descendants because report document rendering reuses the same Table primitive.
- Shared heading stacks cover existing h1/h2/h3, excluding document descendants; existing font sizes/layouts remain.
- Textareas/native selects: neutral card surfaces, existing dimensions. Native selects/check/radio controls get visible purple focus; invalid fields keep semantic destructive borders. Existing disabled/error/loading behavior and labels retained.
- POS empty cart gets a restrained dashed surface, active cart neutral card/hover treatment and tabular totals; product list mode now matches grid focus/surface styling. No product/cart/payment/till state, selection, totals, handlers, layout order or dimensions changed.
- Reports, accounting, inventory, products, customers/suppliers, employees and settings inherit the same shared shell/cards/forms/tables/portals. This is reusable styling coverage, not a claim that each screen/role/state has been visually signed off.
- Print-preview dialogs with document descendants keep the original inherited document tokens. Only their outer screen chrome gets the new solid light/dark surface; legal preview font classes remain explicit system/monospace. No new theme tokens are injected into those dialogs' document subtree. Original paper/calibration/touch CSS remains an unchanged prefix; no print stylesheet, document component, fiscal calculation, receipt layout or export code was edited. Actual deterministic fiscal/print output comparison is still NOT RUN.

## Checks

Logs in `finish-stage-1/` and `finish-stage-2/`; old evidence retained.

| Command/check | Stage 1 | Stage 2/final |
| --- | --- | --- |
| `npm.cmd run build` | PASSED, exit 0 | PASSED, exit 0 |
| `npm.cmd run build:desktop --workspace apps/web` | PASSED, exit 0 | PASSED, exit 0 |
| `npm.cmd run lint` | PASSED, exit 0; 0 errors/4 existing warnings | PASSED, exit 0; 0 errors/4 existing warnings |
| `npm.cmd run test --workspace apps/web` | PASSED, exit 0; 51 files/267 tests | PASSED, exit 0; 51 files/267 tests |
| `git diff --check` | — | PASSED; Git LF/CRLF conversion notices retained |
| `node docs/storbit-verification/visual-implementation/presentation-audit.cjs` | — | PASSED, exit 0 |
| Host API 324 + desktop 29 + web 267 baseline | Owner-supplied 620 passing tests | API/desktop not rerun here; no protected source touched |
| API E2E | BLOCKED/NOT RUN | BLOCKED/NOT RUN |
| Windows Electron E2E | BLOCKED/NOT RUN | BLOCKED/NOT RUN |
| Browser screenshots and rendered visual comparison | NOT RUN; do not retry sandbox harness | NOT RUN |
| Manual section F POS/hardware/accessibility workflows | NOT RUN | NOT RUN |

Existing Vite chunk-size and static/dynamic import warnings remain; no suppression/refactor. Local desktop renderer build includes fonts and original PNG. No tests weakened, deleted or skipped to produce passes.

Presentation review compares all changed TSX against HEAD after normalizing line endings and whitespace-only JSX, removing className attributes and the first presentation-string argument to cva. The sole markup allowance is the original-logo plate in AuthLayout. All remaining AST output matches, including event handlers, hook/state logic, conditions, labels and selectors. Manual diff review confirms only styling/approved original-image presentation. The first audit attempt was sensitive to whitespace introduced around the logo; corrected audit and initial failure logs both retained. This static audit supplements tests, not proof of functional equivalence.

Audit also confirms original root/print/touch CSS prefix unchanged, approved PNG checksum identical, and both bundled WOFF checksums identical to sources. Full font provenance/license is in `apps/web/public/fonts/storbit/README.md` and `Inter-OFL.txt`. Only CSS, presentation classes/approved image markup, assets and documentation changed; no dependencies, business/API/DB/fiscal/accounting/receipt/printing/permission/offline/state source edits.

## Remaining review and assets

Bundled Poppins remains an explicit asset blocker; only installed Poppins renders today, otherwise the documented fallback applies. Need real visual review of all light/dark surfaces at 1024x768/1366x768, English/Portuguese, touch/focus/barcode, portal scroll/close/overflow, font loading/fallback, error/loading/disabled states and brand plate. Unit/build success is not a screenshot or accessibility sign-off. API/Electron E2E and all critical manual/fiscal/hardware comparisons remain mandatory before merge, push, deployment or release sign-off under the owner's narrow amendment. No claim of completed verification or full release readiness.

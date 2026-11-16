# STORBIT — UI-Only Implementation Handoff (Safety-Locked v2)

**Approved:** Visual identity, POS treatment, merchant-back-office direction and UI component board (13 November 2026). **Not yet implemented, functionally regression-tested or deployed.**

## A. Non-negotiable execution contract

**Task = purely cosmetic re-skin of the existing React/Tailwind/shadcn + Electron POS / merchant back-office.** Preserve functionality exactly as-is, including workflows, keyboard/barcode interactions, data, error handling, fiscal documents and business rules. Do not add/delete features, rewrite screens, change UI information architecture, rename technical identifiers or improve unrelated code.

**Allowed:** CSS variables/Tailwind theme tokens; colors, fonts, sizes, spacing, borders, radii, shadows and other presentation-only properties; cosmetic component classes; visual states; reference-only image assets. Minor presentation markup changes are allowed **only if** semantically equivalent and all existing controls, identifiers, accessibility labels and test selectors remain intact.

**Forbidden without a separate, explicit owner request:** Changes to API, Prisma/database/migrations, NestJS, Electron main/preload/IPC logic, React hooks or handlers, state management, keyboard shortcuts, form validation, permissions, route behavior, checkout/split payments, stock rules, offline queue/sync, accounting, IVA/fiscal rounding, invoice and SAF-T generation, numbering/signing, QR data, receipt and A4 print content/layout, AGT identifiers, labels affecting document meaning, package dependencies or product/business legal identities. No production-data access, push, merge, release, deploy or auto-updater publishing.

If a requested visual change cannot be achieved without touching protected behavior, **leave it unchanged, record the blocker, and ask the owner** rather than working around this boundary.

## B. Approved appearance

- Original **lowercase black `storbit` wordmark + small pink/coral four-point star**. Preserve lettering proportions and positioning from supplied original image, not rejected concepts. Do not substitute plain Poppins text or manufacture an unreviewed SVG and call it the final logo.
- Back office: light/off-white base, neutral table/form surfaces, subtle borders and shadows, restrained purple selection/focus. Keep existing screen organization and data density.
- POS: preserve current dark-mode checkout and existing light-mode choice; no decorative colored corner gradients. Keep cashier workflow fast, scan/search field prominent, and totals/receipt states easy to distinguish.
- **Colorful gradient CTA only on login.** All operational buttons (Charge/Pay, Open till, Print, Save, Export, Create, Generate, Clear cart and so on) must be neutral solid/outlined/ghost, in both themes. Meaningful success/danger/warning colors still allowed for status signals; do not make errors indistinguishable.
- Brand hues for marketing/login reference: Coral `#FF3366`, Orange `#FF7A00`, Violet `#7A00FF`, Purple `#B84DFF`, Pink `#FFB3E6`, Charcoal `#0F1221`, Slate `#64748B`, Off-white `#F7F8FC`. These are **not** automatically safe UI text colors. Establish semantic light/dark tokens with measured contrast.
- Typography direction: Poppins for headings and brand, Inter for dense UI, figures and tables, with tested multilingual/Portuguese fallback. Follow existing licensing/asset-loading constraints.
- Reusable component styling: buttons, input/search, selects, date pickers, tabs, navigation/sidebar/header, table rows, badges, cards, alerts, drawers/modals, quantity steppers, print-preview chrome, empty/loading/disabled/error states. Preserve touch mode.

## C. Logo production-asset gate (important)

Existing approved source file: `storbit_original_star_logo.png`, **1395×438 RGB PNG**, cropped from the concept presentation, with a white/light background. It is **not transparent vector art** and is not production-ready for arbitrary backgrounds or Windows icon packaging.

1. Use the original PNG only as a **temporary visual reference**, or as a temporary image in a suitable light-background brand slot if appearance is verified. Do not stretch, fake transparency, blur or recolor the screenshot to masquerade as a final asset.
2. Before final logo integration, obtain an owner-reviewed faithful vector redraw and exports: horizontal light/dark SVG + transparent PNG, suitable mark-only SVG, favicon sizes, Windows `.ico`, Electron app packaging sizes. **The icon-only mark still needs explicit confirmation**; a generic star alone is not automatically approved as the desktop identity.
3. In this visual-only task, **do not touch Electron package/icon/build configuration**, alter OS shortcuts/window title/installer metadata, change store/business logo uploads, or replace merchant branding on legally relevant receipts and A4 documents. Leave these as separate reviewed branding tasks.
4. Report exactly which brand surfaces were updated with approved available assets and which are blocked awaiting production artwork.

## D. Mandatory before-change baseline

1. Inspect `git status`, current branch and `HEAD`; preserve unrelated changes. Create a dedicated local UI branch or worktree without merging the existing Prompt 1c recovery work or disturbing its history. Do not silently overwrite dirty files.
2. Identify UI styling entry points, shared component usage, light/dark themes and actual package scripts. **Do not guess commands or claim tests ran if they did not.**
3. Before modifying code, run the appropriate existing baseline checks using the repository's documented scripts: lint, TypeScript, relevant builds, API unit/integration (including fiscal/accounting), web unit/browser, desktop unit and Electron E2E; record commands, pass/fail/skip counts and environment limitations.
4. Capture original screenshots and behavior at **1024×768 and 1366×768**, light and dark where available, English and Portuguese labels, keyboard/barcode focus and touch mode. Use isolated synthetic data.
5. If baseline tests fail or an environment is missing, clearly distinguish pre-existing failure from regression. **Do not call it a verified baseline or modify business logic to make tests pass.**

## E. Implementation method

1. Change shared **style tokens and presentation-only components** in small separate local commits, then style login, back-office surfaces, and POS in a controlled order. Do not copy invented totals, NIFs, customer emails, product details, fake fiscal statuses or merchant data from AI concept renders.
2. Inspect every diff for changes to JS behavior, event handlers, validation, permissions, API requests, state updates, billing/fiscal data and routes. Avoid snapshots that hide a functional change.
3. Prefer neutral accessible buttons. Only login CTA can display the approved coral/orange/violet gradient.
4. Maintain layout dimensions and scrollability needed for existing cashier interactions, dense tables and receipt previews; avoid redesigned information hierarchy or moving important actions.
5. No new feature requests or feature refactors bundled with styling. Do not opportunistically change existing bugs in this branch.

## F. Mandatory after-change test matrix and STOP conditions

Run **the same commands used for baseline** again at final UI `HEAD` (not only at an earlier commit). Add focused UI visual/assertion checks for the changed components. At minimum check:

| Area | Regression verification |
| --- | --- |
| Navigation/access | Every existing module/route, store switch, permission/role visibility, sign-in/out and error states work identically. |
| Checkout | Barcode keyboard input/focus, search/categories, add/modify/remove products, quantity/discount, tax display, tender/partial/split payments, exact total, payment submission and disabled states. |
| Till and shifts | Open till, opening float, cash-in/out, hold/resume, recent sales, close till, cash counts/differences and reports. |
| Offline | Network loss, offline sale queue, reconnection/sync, idempotency, correct stored receipt number and no duplicate sales. |
| Fiscal/print | Same invoice/FR/FT IDs, tax totals, signatures, QR payload, watermark/legal text, receipt/A4 rendering and print actions; **no legal/tax document changes**. Compare deterministic outputs where feasible. |
| Inventory | Products, stock changes/counts/import previews, transfers, purchases, returns, concurrency/lock and store isolation. |
| Finance/back office | Reports & SAF-T downloads, accounting postings/exports, customers/suppliers, employees, expenses, permissions, dates and currency formatting. |
| Usability/a11y | Both themes, 1024×768 and 1366×768, Portuguese/English, focus/keyboard, touch targets, disabled/errors, modal scroll/close, contrast and overflow. |
| Build | Typecheck, lint, web build, Electron desktop build and existing automated unit/integration/E2E suites. |

**STOP / no sign-off** if a previously passing test now fails; if the changed file list contains protected business/API/fiscal logic; if data/receipt/QR/tax output differs; if a critical workflow is untested/blocked; if contrast is illegible; or if the app only works in one theme/viewport. Do not delete or weaken tests, casually update snapshots or suppress warnings to obtain green results. Fix UI-only regressions, rerun the full relevant suite and report remaining blockers.

## G. Final handoff required from Codex

Return: (1) branch + `HEAD`; (2) files changed with classification (styling / behavior / protected); (3) baseline vs final test commands and **exact** results with pass/fail/skip counts; (4) which tests were not run and why; (5) before/after screenshot links; (6) accessibility/viewport findings; (7) logo assets used versus still missing; (8) a list of any observed behavioral differences; (9) explicit release status **LOCAL UI IMPLEMENTATION ONLY — NOT DEPLOYED**, unless the owner separately authorizes a release.

**Important:** "All tests passed" is not proof every feature is correct. Test results must be documented, with substantive manual E2E checks for the highest-risk POS paths and fiscal outputs.

## H. Paste-ready Codex starter instruction

> Read `STORBIT-UI-IMPLEMENTATION-HANDOFF-v2.md` in full. This is a **strictly visual-only** STORBIT redesign in the existing POS/merchant back-office; no functionality, database, API, state, fiscal, print, accounting, inventory or offline changes are authorized. First perform a read-only inspection and **baseline tests**, listing test commands/results and existing styling entry points before making changes. Use founder-approved lowercase wordmark + pink star only as approved reference; the PNG is temporary, not a final SVG or Windows icon. Apply restrained purple/neutral surfaces, no POS decorative gradient corners, no colorful operational buttons; **only login may have a gradient CTA**. Work in a separate local branch with small styling-only commits. Run the same full test suites again **at final HEAD**, plus representative Windows Electron/browser manual regression flows (checkout, split payment, offline/resync, held orders, till, print/QR/IVA, accounting, reports, roles, store switch, Portuguese/light-dark/touch) and before/after screenshots. Do not alter/weaken tests or protected code to obtain passes. If a regression or untestable critical area remains, stop and report it; do not claim completion. Do **not** push, merge, migrate, release or deploy. Return exact evidence and diff summary for owner review.

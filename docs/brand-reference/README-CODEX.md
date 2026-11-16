# STORBIT — Codex Login Reference Pack

Status: Approved visual direction, reference only. No production code has been changed.

## Place these files under `docs/brand-reference/`

- `storbit-login-approved-reference.html` — responsive desktop/mobile reference; open locally in a browser. This is an illustration only, not working authentication.
- `storbit-brand-tokens.css` — official palette and font stacks, for reference. Reconcile with existing application tokens rather than importing blindly.
- `README-CODEX.md` — this handoff.
- `storbit-brand-board.png.png` — supplied original identity board (note the double `.png` extension).
- `storbit-logo-original.svg` or `storbit-logo-original.png` — **YOU MUST PROVIDE** the original transparent logo. Do not invent/retrace it from a screenshot.
- `actual-pos-dashboard.png` — OPTIONAL screenshot of the existing POS with only synthetic data and no customer details.

## Design priorities

1. Desktop 46/54 split: brand on off-white, login on white.
2. Only one original STORBIT logo on the left.
3. Charcoal headings and solid charcoal Sign in button.
4. Restrained coral/orange/violet accents, not large gradients.
5. Credible mini dashboard marked SAMPLE DATA.
6. Compact mobile brand header and form-first layout; dashboard hidden on mobile.
7. One EN/PT selector per viewport, integrated with existing i18n.
8. Password visibility, labels, focus and error states.
9. Poppins headings; Inter UI. Load fonts from approved local assets when available.
10. Preserve real authentication and till PIN workflows; don't introduce mock backend or fake success.

## Implementation restrictions

Expected local branch: `ui/storbit-visual-v2`. Preserve uncommitted work. No backend, API, database, Prisma, fiscal, IVA, receipts, printing, hardware, permissions, offline sync or routing behavior changes. No push/merge/deploy. Existing API and desktop E2E and manual workflow checks remain release gates.

## Logo note

The supplied transparent PNG files are the approved login wordmarks: `storbit-logo-original.png` for light mode and `storbit-logo-light.png` for dark mode. Preserve the files unchanged; do not recreate the lettering or star.

## Review

Run web tests, build, lint, inspect diffs and visually review both desktop and mobile with safe synthetic data. Do not confuse successful unit tests with completed end-to-end or visual verification.

## Current approved assets

The sole approved login reference is `storbit-login-approved-reference.html`. The supplied `storbit-logo-original.png` and `storbit-logo-light.png` supersede the placeholder note above for this login implementation; use the original files without alteration. The board filename is `storbit-brand-board.png.png`. Local Inter is licensed; Poppins remains unavailable as a bundled asset.

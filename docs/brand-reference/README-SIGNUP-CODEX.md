# STORBIT — Approved signup references (14 November 2026)

## What these images are

- `storbit-signup-dark-approved.png`: owner-approved dark desktop Create Account visual concept.
- `storbit-signup-light-approved.png`: matching owner-approved light desktop visual concept.

These are **visual references**, not production application screens. Do not place the complete screenshot behind a fake clickable form. Render real inputs, real navigation, accessible labels and actual translations.

This set is complementary to the existing approved login specification `docs/brand-reference/storbit-login-approved-reference.html`. That existing login file remains the primary reference for login, and the two new images are the references for signup. Preserve the current auth system.

## Key visual decisions

- Desktop split: ~46% left / ~54% right, matching the approved login.
- Brand panel: one exact original STORBIT transparent logo at upper left (use supplied actual local files, not any approximate wordmark seen in the generated mockups); left headline `Start your STORBIT workspace today.`; supporting text about sales, inventory and store operations together. Short, concise three-benefit row (fast setup; multi-store ready; unified sales and inventory) and an engaging storefront-onboarding illustration, or a faithful lightweight illustrative equivalent.
- Signup panel: heading `Create your account.` with first name, last name, business name, first store name, email and password, maintaining the existing registration flow and API. Light primary button solid charcoal `#0F1221` with white label; dark primary button solid lavender `#EDEBFF` with `#0F1221` label, hover `#DCD6FF`, pressed `#C9BFFF`, focus ring `#B84DFF`.
- Dark background close to existing login: brand left deep navy charcoal; form right near-black charcoal. Light background: off-white left `#F7F8FC`, white right. Use brand palette #FF3366, #FF7A00, #7A00FF, #B84DFF, #FFB3E6, #0F1221, #64748B.
- Typography: Poppins headings if an approved locally available licensed font exists, otherwise report fallback; Inter for UI. Do not pretend a font is installed.
- Header top right: discreet shared Light / Dark / System control and existing language selector. Reuse *one* existing theme preference and existing i18n; no separate signup-only theme state.
- Mobile: original logo, appearance and language controls in compact header; short intro then functional form; no large illustration or three-benefit row above form; ensure no overflow or clipped content at 390x844. No fixed content height; scroll naturally.
- Form mockups include a **Confirm password** field. May add this as **client-only match validation** (not sent to the server) if safely wired with proper tests. Mockups also show a terms/privacy checkbox, but **do not invent legally-binding consent, nonexistent policy URLs, or backend changes**. If approved and existing live policy URLs/consent mechanisms exist, reuse those; otherwise omit the legal checkbox and explicitly list it as a pending product/legal decision. Don't silently make registration depend on nonexistent policies.
- Existing logo images: `storbit-logo-original.png` for light and `storbit-logo-light.png` for dark; locate actual files and preserve their original geometry and coral star. The screenshots contain generated approximations—never extract or recreate the logo from them. Don't rely on deleting the old white-backed asset to fix stale references: update references in signup and any other auth screens using the old layout.

## Lightweight animation specification

All animation is cosmetic only, client-side, short, one-time (no constant looping, videos, timers polling, new dependencies or network calls).

1. Signup illustration or decorative benefits fade in and translate up ~6-12px within ~350-500ms; benefits enter with a small stagger of 80-120ms. No bouncing or glowing/pulsing forever.
2. Login sample dashboard (already implemented) should, if practical without risk, fade/slide in in ~350ms and its static synthetic chart reveal in ~600-850ms. Optional metric counters count from zero to final sample values once within ~650-1000ms, preserving `SAMPLE DATA` and exact final amounts. If counters introduce complexity/accessibility problems, prefer a simple CSS reveal. Never read real merchant data or keep counting.
3. Keep the actual form fully usable immediately; avoid animating form validation or moving inputs while a user types.
4. CSS `opacity` and `transform`, simple SVG stroke animation for the chart; never animate expensive layout/shadows continuously. Honor `prefers-reduced-motion: reduce`; use static final appearance when disabled, and make sure animation cannot hide text on failed JS.
5. Mobile: hide desktop illustration and dashboard animation; use tiny optional fade only. No continuous animation.

## Functional and release guardrails

Existing branch expected `ui/storbit-visual-v2`, local HEAD previously `229ce1519c421290a425c25a652a21feadc40e53`; verify rather than assume. Existing modified/untracked files are valuable. No git reset/clean/stash, commit/push/merge/deploy, real data, production operations, fiscal/API/database/checkout changes or sandbox weakening. Existing login was manually reported to work after API started, desktop API 29/29 + 324/324 host tests, web 274/274 Codex tests; these are prior baselines, not proof of post-change tests. Keep till PIN, auth/session, signup validation, redirects, all existing language variants, themes and refresh behavior.

After implementing: focused web tests, full web tests, builds, lint, type checks and `git diff --check`. Report exact old/new file changes and unresolved details. Do not retry Edge sandbox failures; request owner-operated browser screenshots on normal Windows at desktop light/dark + mobile light/dark. Stop on a genuine regression. No release signoff until separate critical API/Electron E2E and manual gates are cleared.

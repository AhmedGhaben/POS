# STORBIT signup and authentication animation implementation

LOCAL UI IMPLEMENTATION ONLY — NOT DEPLOYED.

Branch: `ui/storbit-visual-v2`. HEAD: `229ce1519c421290a425c25a652a21feadc40e53` (unchanged). Existing modified and untracked work retained. No commit, push, merge, deployment, reset, clean, stash or security-permission changes.

## Implemented

- Create Account uses the existing login visual system: 46.5/53.5 split, theme tokens, original upper-left logo, solid charcoal/light-lavender primary action, heading and supporting introduction. The left panel contains a lightweight local SVG storefront and three translated benefits. No screenshot backdrop, recreated wordmark, external assets, dependencies or merchant-data requests.
- All six original fields, trimming, length/email/password constraints, API call, timezone/language metadata, session handling, pending/error handling and `/welcome` replacement redirect remain. Confirm Password adds only a client match check; `registrationValues` strips it before the existing API call. The mismatch uses the existing translated reset-password message. Native form semantics and existing field labels/IDs are retained; API errors now have an alert role.
- Shared native Light / Dark / System select beside the existing EN/PT controls, using `pos-theme`. Existing explicit light/dark choices stay explicit. System resolves against OS appearance and subscribes to changes with cleanup. Existing application toggle remains supported and picks the opposite explicit appearance. No auth/session handler changes. Theme preference is independent of login state and survives navigation/reload through the same provider/storage key.
- Dashboard and storefront enter once over 400ms from 8px below. Login chart draws once over 750ms; benefits stagger by 100ms. Sample values and SAMPLE DATA remain unchanged. No counters, timers, loops or data requests. Animation applies only on desktop with `prefers-reduced-motion: no-preference`; reduced motion renders final static content and disables transitions. Inputs are never animated. Desktop decorations are hidden on mobile, with natural document scrolling and stacked password fields. Narrow headers place appearance/language controls on a second row to preserve logo space.

## Files added or edited in this task

Presentation: `apps/web/src/components/layout/SignupLayout.tsx`, `AuthAppearanceControls.tsx`, existing untracked `LoginLayout.tsx`, existing untracked `apps/web/src/styles/storbit-login.css`, `apps/web/src/routes/signup.tsx`.

Shared appearance behavior: `apps/web/src/theme/ThemeProvider.tsx`, `theme-preference.ts`.

Client confirmation validation: `apps/web/src/routes/signup-schema.ts` and signup form wiring. No backend or business-rule changes.

Translations: existing modified `apps/web/src/locales/en/auth.json`, `pt-PT/auth.json`, `pt-BR/auth.json`; signup/appearance additions only; earlier login translations retained. pt-AO derives from pt-PT as before.

Focused tests: `apps/web/src/routes/signup.test.tsx`, `apps/web/src/theme/ThemeProvider.test.ts`, `ThemeProvider.test.tsx`. Evidence: this directory. Existing POS, back-office, shared-component and other dirty files remain outside this task. API, desktop and packages have no tracked source diff.

## Verification scope and limits

Fresh pre-change web baseline: 52 files, 274 passed, 0 failed, 0 skipped. Other pre-change checks were not freshly rerun; prior login report records passing builds/typechecks and lint with four warnings. These supplied/historical results are not current baseline runs.

Final results and command exit codes are recorded below after completion. Tests cover schema constraints, password matching, confirmation exclusion, real server-rendered fields, logo references, translated controls/language storage, preference restoration and OS-theme resolution. These are Node/schema/server-render checks, not live browser clicks, successful backend registration, OS change event delivery or authenticated browser persistence verification.

Original production logo files remain byte-identical to supplied assets (SHA-256 checked): original `863d32ad93f5cd83179af4105f7be9d42b59d3e530c2c0f2f9b32efecf1a0c30`, light `f57e6d88bb563934003c19dedc413b9ce103577d9122f95327a97279b08d09e2`.

## Reference deviations and remaining review

The approved PNGs were inspected, but no running-browser screenshots or computed-layout/contrast acceptance were performed. Edge automation was not retried. The decorative SVG is a simpler flat storefront/onboarding equivalent, rather than the rendered 3D artwork; it contains no wordmark. Legal checkbox and policy links are omitted: no approved existing terms/privacy integration was found; product/legal integration is pending. Password fields stay masked; signup does not add the optional eye controls depicted in the mockup. The actual six original fields plus confirmation are present. Poppins remains unavailable as a bundled font; existing local lookup uses the established Inter/system fallback. No new font or logo assets were generated. Small mobile screens use a two-row header for usable controls.

## Owner-run screenshot and interaction instructions

1. In a normal Windows shell at the repository root, run `npm.cmd run dev:web -- --host 127.0.0.1` and open the local URL Vite prints. Use the existing local API only for synthetic registration/login checks; no real merchant data is needed for screenshots.
2. Open `/signup` and `/login`. Capture each at 1366×768 and 1024×768, Light and Dark selected through the new Appearance control. Also capture 390×844 and 320×740 mobile sizes. Save with route-size-theme-language filenames, e.g. `signup-390x844-dark-en.png`.
3. Repeat key captures with pt-PT and pt-BR; check pt-AO labels too. Confirm one authentic logo, no header/form overlap, no horizontal overflow, readable errors, full vertical scrolling and visible primary/footer actions. Desktop shows illustration/dashboard; mobile hides them.
4. Use Tab/Shift+Tab and arrow keys on appearance/language controls. Switch appearance, reload, navigate between auth routes, sign in with a synthetic local account, and confirm appearance remains. Select System and change OS appearance, confirming immediate response. Verify a previously saved explicit Light or Dark remains selected when OS appearance changes.
5. Submit empty/invalid fields and mismatched passwords; confirm localized errors and no registration request. Submit matching valid synthetic values; verify existing API error/loading/success and `/welcome` behavior. Confirm no `confirmPassword` in the network payload. Recheck existing login, recovery link, password visibility and till-PIN flow where available.
6. With normal motion, observe the one-time dashboard/chart/illustration/benefit entrances. Enable reduced motion in OS/browser tools and reload: static final preview, usable form immediately, no entry animation. Keep SAMPLE DATA and final amounts unchanged.

API/Electron E2E and critical checkout/till/offline/fiscal/accounting/manual release gates remain unverified from the prior handoff. This task does not retry or repair those environments and does not authorize release.

## Final command results

| Command | Result |
| --- | --- |
| `npm.cmd run test --workspace apps/web` | PASS: 55 files, 299 passed, 0 failed, 0 skipped; fresh baseline 52 files / 274 passed. `web-final.log` |
| `npm.cmd run lint` | PASS, exit 0: 0 errors, 4 existing react-refresh warnings (badge, button, form, ThemeProvider). `lint-final.log` |
| `npm.cmd run build` | PASS, exit 0: API, desktop and web workspace builds. `build-final.log` |
| `npm.cmd run build:desktop --workspace apps/web` | PASS, exit 0. `renderer-final.log` |
| `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit` | PASS, exit 0. `typecheck-web.log` |
| `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.build.json --noEmit` | PASS, exit 0. `typecheck-api.log` |
| `node node_modules/typescript/bin/tsc -p apps/desktop/tsconfig.json --noEmit` | PASS, exit 0. `typecheck-desktop.log` |
| `git diff --check` | PASS, exit 0; existing LF/CRLF notices only. `diff-check-final.log` |

The first workspace build encountered `ENOTEMPTY` while Nest tried to remove generated API build output, and the initial UI typecheck found newly introduced generic/translation typing errors. The UI errors were corrected without relaxing checks; the repeated workspace build passed without manual output deletion or permission changes. Initial PowerShell `npm` invocation was blocked by execution policy; subsequent checks used `npm.cmd`, with no policy modification. Final command logs above supersede intermediate failed runs.

Build warnings remain for mixed static/dynamic jspdf imports and large chunks. Tests emit React Router server-render useLayoutEffect warnings; they are not failures. No test was weakened or skipped. No API/desktop unit suites, browser automation, successful backend registration, hardware tests or screenshots were run during this task. There is no full functional/visual/release sign-off.

Final branch and HEAD are unchanged. No commit, push, merge or deployment.

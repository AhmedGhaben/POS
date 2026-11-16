# Signup and auth appearance: local implementation

LOCAL UI IMPLEMENTATION ONLY - NOT DEPLOYED.

Branch `ui/storbit-visual-v2`, HEAD `229ce1519c421290a425c25a652a21feadc40e53`, unchanged. Initial tree had 28 tracked modified files plus valuable untracked work, including partial signup/theme/animation implementation. Preserved that work and extended the relevant auth files. No reset, clean, stash, discard, commit, push, merge or deploy. No API, desktop, database or shared-package source changes. Existing unrelated POS/shared styles remain untouched.

## Implemented

- `apps/web/src/components/layout/SignupLayout.tsx`: real 46.5/53.5 two-panel layout; approved headline, supporting description, lightweight original SVG storefront with onboarding checklist shapes and three translated benefits. A single original PNG wordmark at upper left follows resolved appearance.
- `apps/web/src/routes/signup.tsx` and `signup-schema.ts`: existing six registration fields retained plus client-only confirmation. Existing required/trim/length/email validation retained. Explicit registrationValues projection excludes confirmation from the request; timezone/language, API function, session assignment, error handling, pending state and /welcome replacement redirect retained.
- `apps/web/src/components/layout/AuthAppearanceControls.tsx`, `LoginLayout.tsx`: both auth pages use native keyboard-operable appearance select beside existing EN/PT regional language controls. Existing login submission, password visibility and till PIN behavior retained.
- `apps/web/src/theme/ThemeProvider.tsx`, `theme-preference.ts`: same pos-theme preference and application-root provider, explicit Light/Dark choices preserved, System follows OS changes with cleaned-up media listener. Preference survives navigation and remounts. Existing operational toggle still selects explicit opposite resolved appearance.
- `apps/web/src/styles/storbit-login.css`: shared solid charcoal/light and lavender/dark CTA states; scoped signup form/benefits/illustration styles. Natural document scrolling, no fixed page height; decorative illustration and benefits hidden on mobile. Narrow mobile header puts selectors below logo; single-row header starts at 480px to avoid overlap.
- `apps/web/src/locales/{en,pt-PT,pt-BR}/auth.json`: signup and appearance copy; repaired damaged Portuguese characters. pt-AO continues inheriting pt-PT.
- Tests: `routes/signup.test.tsx`, `theme/ThemeProvider.test.ts`, `theme/ThemeProvider.test.tsx`; existing `routes/login.test.tsx` retained. Verification logs and this report are under this directory.

The auth layouts, schema, selector, styles and theme changes were partly present at session start; this is the final feature file inventory, not a claim that every line was newly created in this session. Additional concurrent on-disk auth refinements encountered during verification were preserved.

## Animations

Desktop only and only with prefers-reduced-motion:no-preference: dashboard/storefront opacity and 8px rise for 400ms, synthetic normalized SVG chart stroke draws once in 750ms, benefits enter over 400ms with 100ms stagger. No counters, loops, polling, live merchant requests, video or dependencies. Forms remain static and usable. Reduced motion displays final state with animations/transitions disabled; mobile dashboard/illustration/benefits are hidden.

## Tested

| Command | Result |
| --- | --- |
| npm.cmd run test --workspace apps/web | 55 files, 299 passed, 0 failed, 0 skipped; web-verified-session.log |
| npm.cmd run build:desktop --workspace apps/web | Exit 0; renderer-verified-session.log |
| npm.cmd run build | Exit 0, API/desktop/web completed; build-verified-session.log |
| npm.cmd run lint | Exit 0, 0 errors, 4 existing react-refresh warnings; lint-final-session.log |
| node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit | Exit 0; typecheck-web-final-session.log |
| node node_modules/typescript/bin/tsc -p apps/api/tsconfig.build.json --noEmit | Exit 0; typecheck-api-final-session.log |
| node node_modules/typescript/bin/tsc -p apps/desktop/tsconfig.json --noEmit | Exit 0; typecheck-desktop-final-session.log |
| git diff --check | Exit 0; diff-check-final-session.log; existing LF/CRLF notices only |

Initial saved web baseline: 52 files / 274 passing. Session lint baseline: 0 errors / 6 warnings; extracting preference helpers restores prior 4-warning level. First workspace attempt exposed partial signup type errors (transformed form input/output typing and translation keys); repaired without changing backend contract. Final results supersede that intermediate failure. PowerShell also surfaced Vite stderr warnings as a nonzero wrapper status; a fresh cmd-captured workspace build explicitly returned exit 0. Existing mixed jspdf import and large bundle warnings remain.

Focused tests cover field validation, mismatch path, exact request projection, seven real inputs, original logo selection in both modes, four languages, localized labels, absence of invented legal checkbox, persisted choices and OS resolution. These are Node/server-render and unit tests, not browser interaction tests. Original logo production/source SHA-256 pairs match: original 863d32ad93f5cd83179af4105f7be9d42b59d3e530c2c0f2f9b32efecf1a0c30; light f57e6d88bb563934003c19dedc413b9ce103577d9122f95327a97279b08d09e2.

## Deviations and remaining verification

Approved PNGs inspected visually; running application has NOT been visually verified. No new browser screenshots, Edge retry or permission changes. Storefront uses lightweight flat SVG instead of generated 3D/person artwork; no invented storefront wordmark. Same illustration in both themes with theme-aware checklist surface. No password visibility toggles added to signup. Legal checkbox omitted because no approved Terms/Privacy links or consent mechanism exists; product/legal integration pending. Poppins binary remains unavailable; Inter/system fallback retained. No optional metric counters.

API/Electron E2E and critical POS/fiscal/manual release gates remain outstanding as documented in the login report. This task does not claim release readiness or successful real signup/login against a running API.

## Owner browser screenshots and interaction checks

1. On the normal Windows host, run `npm.cmd run dev:web` from the project root and open the Vite URL, /login and /signup. Use the existing local development API only for synthetic account submission checks.
2. Capture each route at 1366x768 and 1024x768, then 390x844 and 320x844, selecting Light then Dark. Save full-page screenshots named route-size-theme-language.png. Confirm exactly one correctly proportioned original logo, unobscured header selectors, no horizontal overflow, and natural vertical scrolling to submit/footer and validation errors.
3. Repeat relevant screenshots in EN, PT Portugal, PT Brasil and PT Angola. Tab through language/theme, all inputs, links and submit; use arrow keys to select appearance. Confirm focus remains visible.
4. Choose each explicit theme, refresh, navigate between auth pages and sign in with a synthetic local account; verify appearance persists. Select System and change Windows appearance while the page is open; confirm it follows. Explicit choices must ignore subsequent OS changes.
5. Submit blank/invalid values, short password and mismatching confirmation. Confirm localized messages; matching confirmation must submit only existing API fields plus existing timezone/language and redirect to /welcome on success. Check API error/loading behavior locally.
6. At desktop size, reload to inspect single fade/rise and chart draw, unchanged SAMPLE DATA/final values. Enable reduced motion in browser rendering settings and reload: final design must be static. At mobile sizes decorations must remain hidden and controls immediately usable.


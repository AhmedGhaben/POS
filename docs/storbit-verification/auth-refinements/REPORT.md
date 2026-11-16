# Final authentication UI refinements

Local implementation only. No commit, push, merge, reset or deployment.
Branch ui/storbit-visual-v2; HEAD 229ce1519c421290a425c25a652a21feadc40e53 unchanged.
Initial tree: 28 tracked modified files plus existing untracked auth UI, assets, tests and evidence. All retained. No authenticated application controls, API/session/signup handlers, till PIN or protected business source edited.

## Exact changes in this refinement

- apps/web/src/components/layout/AuthAppearanceControls.tsx: replaced both dropdowns with a direct sun/moon button and EN/PT segmented buttons. Existing useTheme().toggleTheme resolves the effective appearance, including System, then persists an explicit opposite choice using the existing application provider. The icon indicates the target appearance; localized accessible name/title identifies that target. Native type=button controls provide Enter/Space support. EN uses en; PT uses pt-AO through unchanged useLanguage persistence. Existing pt-PT/pt-BR preferences are retained until a button is selected; PT is selected for any Portuguese variant.
- apps/web/src/styles/storbit-login.css: matching 40px frames, 9px outer radii, identical theme-aware borders, 8px gap and visible focus. Compact upper-right positioning at desktop and mobile; no layout redesign. Removed obsolete auth dropdown styles. The compact group now fits beside the existing 106px mobile logo at 320px width by declared dimensions; running-browser alignment still needs owner review.
- apps/web/src/components/layout/use-auth-entrance.ts (new): decorative-only mount trigger uses two requestAnimationFrame callbacks to separate pending and running states by a paint. Only enables on desktop with no motion reduction. Cancels pending callbacks and removes listener/attributes on cleanup. Switching to reduced motion or mobile immediately returns static final state and does not restart the entrance on returning to desktop.
- apps/web/src/components/layout/LoginLayout.tsx: attaches entrance ref; chart normalized to pathLength=1000; fill and endpoint use a delayed fade so they do not reveal the entire trajectory before the stroke draws. SAMPLE DATA and all final metric values unchanged.
- apps/web/src/components/layout/SignupLayout.tsx: attaches the same entrance ref; illustration/benefit artwork and page content retained.
- apps/web/src/routes/login.test.tsx and signup.test.tsx: replaced superseded dropdown assertions with the new EN/PT contract; retained all locale, logo, form and registration tests.
- New tests: components/layout/AuthAppearanceControls.test.tsx, components/layout/use-auth-entrance.test.ts, theme/ThemeProvider.toggle.test.tsx.
- Documentation and logs: this directory. No new dependencies, fonts, assets or translation changes.

## Animation investigation and changes

Previous CSS started the dashboard fade and chart draw together at insertion, with no explicit post-paint lifecycle trigger. A significant part of the chart draw could therefore happen while its container was still becoming visible, or during initial rendering. This is a source-level finding and plausible explanation, not a confirmed diagnosis of the owner's browser.

New timeline after the per-mount trigger: dashboard/storefront 450ms fade and 8px rise; chart draws for 700ms after 250ms delay; chart fill and endpoint fade for 350ms after 600ms; benefits run for 400ms with 100/200/300ms delays. CSS animations have one iteration. No count-up, data requests, loops or form animation. Static final design is the default when JavaScript does not arm the effect. Reduced motion bypasses the trigger and CSS disables animation/transitions. Heavy mobile decorations remain hidden.

Executed lifecycle tests verify the actual hook callback sequence, not just declarations: pending through the first frame, running after the second, no further frames queued, new mount re-arms, preference change cancels, and unmount removes work/listener. CSS timing/path normalization is also asserted. These Node tests do not demonstrate actual browser paint or SVG interpolation; final Chrome motion visibility remains manual. Edge automation was not retried and security settings were not changed.

## Verification

Exact commands were run from the project root, with npm.cmd output captured through cmd /d /c to preserve native exit status despite harmless stderr warnings.

| Command | Result / evidence |
| --- | --- |
| npm.cmd run test --workspace apps/web (baseline) | 55 files, 299 passed, 0 failed/skipped; web-baseline.log |
| npm.cmd run test --workspace apps/web -- src/routes/login.test.tsx src/routes/signup.test.tsx src/components/layout/AuthAppearanceControls.test.tsx src/components/layout/use-auth-entrance.test.ts src/theme/ThemeProvider.toggle.test.tsx src/theme/ThemeProvider.test.ts src/theme/ThemeProvider.test.tsx | 7 files, 46 passed, 0 failed/skipped; focused-verified.log |
| npm.cmd run test --workspace apps/web | 58 files, 313 passed, 0 failed/skipped; web-verified.log |
| npm.cmd run lint | Exit 0; 0 errors, 4 existing react-refresh warnings; lint-final.log |
| npm.cmd run build:desktop --workspace apps/web | Exit 0; renderer.log |
| npm.cmd run build | Exit 0; workspace API, desktop and web builds; build.log |
| git diff --check | Exit 0, existing LF/CRLF notices only; diff-check.log |
| node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit | Exit 0 |

Intermediate failures were confined to new tests: missing initReactI18next in the first translation mock and a hooks-rule lint error in a test harness name. Corrected the mock to preserve actual module exports and used a named harness component. No production behavior or assertions were weakened to hide failures. Existing server-render React Router warnings remain in test logs. Builds retain pre-existing mixed jspdf import and large chunk warnings.

Theme tests execute the actual provider toggle callback/state/persistence effects in a Node hook harness for explicit Light/Dark and both effective System appearances, then remount from storage. Auth button tests execute callbacks against the real i18n locale/persistence functions with a mocked useLanguage hook. Existing in-app LanguagePicker still offers and selects en, pt-PT, pt-BR and pt-AO. Signed-in language synchronization and actual authentication still require browser review; those mechanisms were not changed.

## Owner checks in Chrome

1. Run npm.cmd run dev:web, open the reported Vite URL and review /login and /signup at 1366x768, 1024x768, 390x844 and 320x844 in both themes. Capture full-page screenshots. Confirm upper-right controls align, logo does not overlap, and signup scrolls without horizontal overflow. Existing overall appearance was owner-approved before this refinement; new alignment has not been visually verified here.
2. Tab to theme and activate with Enter/Space. Confirm immediate Light/Dark swap, visible focus and localized target label. Refresh, navigate between pages, then sign in using an existing synthetic local account; appearance should remain. Set localStorage pos-theme to system, reload in each OS theme, then click the icon: it should choose the opposite effective theme and store light or dark.
3. Click PT: localStorage pos-language must be pt-AO; EN must store en. Refresh and verify localized form/error copy. In the authenticated app confirm the original locale picker still provides Portugal/Brasil/Angola variants.
4. Open Chrome DevTools > More tools > Animations. Keep reduced motion disabled, select 25% playback speed for inspection, and navigate between auth pages using their links (or record a reload). Confirm dashboard fade, one 700ms chart stroke draw, delayed chart fill/endpoint, storefront rise and staggered benefits. Restore 100% and judge subtlety. On /login final values remain Kz 2.48M, 126, 04, 12.8%, Kz 85,000 and 4 with SAMPLE DATA.
5. For event-level evidence, run this in the console, then use the in-page signup/sign-in links (SPA navigation preserves the listener):

```js
document.addEventListener('animationstart', (event) => {
  console.log(event.animationName, event.target, getComputedStyle(event.target).animationDuration);
}, true);
```

Observe storbit-enter, storbit-chart and storbit-chart-detail; after settling, document.querySelector('.storbit-login').getAnimations({subtree:true}) should contain only finished animations, with no running loop. Theme/language changes should not replay the entrance. Navigation away and back should replay once.

6. DevTools > Rendering > Emulate CSS media feature prefers-reduced-motion: reduce. Reload/navigate: final artwork must remain static and form immediately usable; the root should have no data-auth-entrance attribute. Change this setting while animation is running: it should stop and show the final state. Mobile dashboard/storefront/benefits remain hidden, with no decorative animation.

Remaining manual gates: browser-visible motion/interpolation, keyboard/focus, exact viewport alignment, successful login/signup against the local API, API error/loading states and persistence after actual authentication. No Chrome screenshots or runtime visual verification claimed. Prior release/API/Electron E2E gates remain outside this local UI refinement.

# Authentication selector and entrance fixes

Local implementation only; stop for owner visual review. No commit, push, merge, reset or deployment.

Branch `ui/storbit-visual-v2`, HEAD `229ce1519c421290a425c25a652a21feadc40e53`, unchanged. The initial 28 tracked modified files and all prior untracked work were preserved. No authentication handlers, API, session, POS, global locale support or authenticated theme controls changed.

## Changes and findings

- `apps/web/src/styles/storbit-login.css`: removed the old `.language button { min-height:44px }` rule. It forced 44px buttons into a 40px frame whose actual inner space was only 32px. The frame and theme button now explicitly use border-box sizing and 40px height/min-height. Segments use border-box sizing, 32px height, zero minimum height/margin, centered flex content, unit line-height and identical `0 8px` padding. Frame padding is 3px on every side: 32 + 6 + 2px border = 40px. No clipping, negative margins or transforms hide the overflow. Keyboard focus uses a 2px outline with zero offset, fitting in the frame padding. Active EN/PT, light/dark and mobile rules change no segment geometry. Chart delay changed from 250ms to 450ms so its 700ms draw starts after the dashboard entrance; fill/endpoint fade follows later.
- `apps/web/src/components/layout/use-auth-entrance.ts`: retained the ref attached to each auth page's main element, matching `data-auth-entrance` CSS selectors. It now waits for the window load event (or an already complete document), waits for local fonts, then waits a single 200ms interval and two animation frames before setting `running`. This addresses the previous lack of a page/font-readiness gate; earlier animation could finish during loading. The timer, frames and listeners are cancelled on cleanup or a change to reduced motion/mobile. Forms are never hidden, moved, delayed or disabled. No loops, dependencies, counters or live preview requests added.
- `apps/web/src/components/layout/use-auth-entrance.test.ts`: adapted the existing lifecycle tests and added actual load-event, font-wait cancellation and reduced-motion-during-delay coverage.
- `apps/web/src/components/layout/auth-controls-layout.test.ts` (new): parses the complete auth CSS to catch the inherited minimum-height regression and verify the exact border/padding/button size arithmetic, focus rule and absence of state/theme/mobile geometry overrides. These are CSS contract checks, not browser layout measurements.
- This evidence directory adds an isolated Electron probe and a Chrome runtime matrix script. Both read the existing built app and block all external/API network requests; no merchant data or authenticated application state is used.

## Animation investigation: proved versus unverified

Inspection of both source and the previously built JavaScript/CSS confirmed the hook is included in the bundle, both layouts attach its main-element ref, `dataset.authEntrance` maps to the exact `data-auth-entrance` selectors, and dashboard/chart/storefront/benefit classes match those selectors. The built CSS contained the expected keyframes and durations. This proves inclusion and selector spelling, not runtime execution or painting.

The prior hook started two frames after commit, without waiting for page assets/fonts. That timing is now changed. It is a plausible cause of imperceptible initial animation, **not a confirmed diagnosis of the owner's Chrome session**. If OS/Chrome reports reduced motion, static output remains intentional; we do not override that preference.

Normal desktop sequence after readiness: 200ms pause, dashboard/storefront opacity and 8px rise for 450ms, chart stroke draw for 700ms starting 450ms after the entrance trigger, benefits enter over 400ms with 100/200/300ms delays. Chart fill and endpoint fade after 800ms. Each CSS animation runs once. Final SAMPLE DATA and values are unchanged. Mobile decorations stay hidden; reduced-motion media rules and the hook both select the final static state.

## Browser runtime attempts

The default sandbox-profile Chrome/Playwright browser locations were absent. Explicit inspection of the real user's local application directory found Chrome. Neither available engine could launch in this managed environment:

- One isolated sandbox-enabled Electron Chromium probe exited immediately with code `2147483651`, before page execution. No application Electron code was edited.
- One Playwright attempt against `C:/Users/ASUS/AppData/Local/Google/Chrome/Application/chrome.exe`, with `chromiumSandbox:true`, launched then closed with exit `3221225506` (`0xC0000022`, access denied), before page execution. Details are retained in `chrome-baseline.json`.

**0 browser cases executed. No rendered dimensions, animationstart events, computed runtime styles or screenshots were obtained.** Neither browser was retried, Edge was not invoked, and permissions/sandbox protections were not weakened. The pending Chrome matrix is not represented as a passing result.

## Automated checks

| Exact command | Result |
| --- | --- |
| `npm.cmd run test --workspace apps/web -- src/components/layout/use-auth-entrance.test.ts src/components/layout/auth-controls-layout.test.ts src/components/layout/AuthAppearanceControls.test.tsx src/routes/login.test.tsx src/routes/signup.test.tsx` | 5 files, 38 passed, 0 failed/skipped; focused.log |
| `npm.cmd run test --workspace apps/web` | 59 files, 318 passed, 0 failed/skipped; web.log |
| `npm.cmd run lint` | Exit 0; 0 errors, 4 existing react-refresh warnings; lint.log |
| `npm.cmd run build` | Exit 0; workspace API, desktop and web builds including TypeScript; build.log |
| `npm.cmd run build:desktop --workspace apps/web` | Exit 0; desktop renderer including TypeScript; renderer.log |
| `git diff --check` | Exit 0; existing LF/CRLF notices only; diff-check.log |

Previous session's 313 passing tests are historical comparison, not a fresh baseline run this turn. Final adds 5 cases. Hook tests execute the effect callbacks with controlled load/font/media events and frames in Node; they do not mount a browser DOM. EN/PT active behavior is covered by the retained control tests; state/theme/mobile layout invariance is covered by parsed CSS. The actual desktop/mobile/light/dark rendered matrix is pending.

Build warnings remain for mixed static/dynamic jspdf imports and large bundle chunks; test logs retain existing React Router server-render useLayoutEffect warnings.

## Owner Chrome review

After using the freshly built local application, inspect both auth routes at 1366x844 and 390x844 (also 320px width), light/dark, and EN/PT active. Ensure the loaded asset hash matches the new build, rather than a cached older service worker. Verify 40px outer language/theme frames, 32px inner buttons, equal top alignment, both segment backgrounds fully inside the border, no horizontal overflow, and visible Tab focus.

The prepared runtime matrix can be run from the normal host with:

```powershell
node docs/storbit-verification/auth-runtime-fixes/chrome-check.cjs
```

It uses the explicit Chrome path, keeps Chromium sandboxing enabled, intercepts local built assets without a server, blocks API/external requests and isolates each context. It checks 16 route/viewport/theme/language combinations plus a reduced-motion reload for each. It records animationstart events, computed names/durations, chart intermediate stroke offsets, final stroke position, selector/button rectangles and alignment. Its `chrome-final.json` will only be created when the owner runs it; it has not passed here.

For interactive verification, open Chrome DevTools > Animations and record a reload. With `prefers-reduced-motion` set to no-preference, observe one dashboard entrance followed by a 700ms chart draw, or one storefront entrance and staggered benefits. Forms must remain usable throughout. Confirm `matchMedia('(prefers-reduced-motion: reduce)').matches` when investigating a missing animation. Reduced motion must produce no entrance events and the static final design. Navigating to each page should replay once; theme/language changes should not replay. Final login sample metrics remain Kz 2.48M, 126, 04 and 12.8%, with Kz 85,000 / 4 in the footer and SAMPLE DATA visible.

Runtime visual acceptance remains blocked pending owner Chrome checks. No claim that the reported absence of motion is proven fixed in Chrome.

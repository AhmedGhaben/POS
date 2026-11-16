# Authentication animation polish: local trial

Branch `ui/storbit-visual-v2`; HEAD `229ce1519c421290a425c25a652a21feadc40e53`, unchanged. Checked branch, HEAD, status and existing diffs before editing. Preserved all 28 pre-existing tracked modifications and prior untracked files. No reset, clean, stash, discard, commit, push, merge or deployment. No authentication, registration, API, session, till PIN, theme/language, POS or business logic edits.

## Files changed in this trial

Production UI:

- `apps/web/src/components/layout/LoginLayout.tsx`: sales and transaction preview values now have animated spans, invisible final-width reservations and static screen-reader text. Original chart, label, low stock and final amounts retained.
- `apps/web/src/components/layout/sample-counters.ts` (new): one finite requestAnimationFrame loop for both synthetic values; cubic ease-out over 800ms. Starts at Kz 0.00M / 0, ends exactly Kz 2.48M / 126. Repeated start calls are ignored. Cancellation restores final values and prevents queued callbacks from restarting.
- `apps/web/src/components/layout/use-auth-entrance.ts`: reuses the existing page/font-readiness and pending/running entrance gate. Arms the counters only on desktop with motion allowed, and starts them on the chart path's actual `animationstart` event with name `storbit-chart`. Unmount removes the listener and cancels the counters; reduced motion/mobile cancels immediately and restores final values. No separate counter timers or React animation state.
- `apps/web/src/components/layout/SignupLayout.tsx`: groups existing awning and box artwork, and pairs each existing green circle with its existing check path. Original coordinates, colors, shapes and composition retained; no new illustration assets or form changes.
- `apps/web/src/styles/storbit-login.css`: tabular numerals and overlapping reserved-width spans prevent counter layout changes. Adds the restrained awning, box/check and benefit sequence using the existing root entrance attribute, CSS transforms and opacity.

Tests:

- `apps/web/src/components/layout/use-auth-entrance.test.ts`: retained readiness/cancellation coverage and added chart-event synchronization and disabled-motion counter checks.
- `apps/web/src/components/layout/sample-counters.test.ts` (new): zero/start, intermediate ease-out, exact completion, late-frame completion, one-loop/one-shot behavior, cancellation and missing-counter behavior.
- `apps/web/src/components/layout/auth-animation-sequence.test.tsx` (new): storefront/awning/box/check/benefit timing, existing SVG grouping, static accessible sample values, unchanged SAMPLE DATA/04 and preserved child form rendering.
- This directory: command logs and report. Prior verification material remains preserved.

## Timeline

All times below are relative to the existing `running` entrance trigger, after the unchanged load/font readiness gate, 200ms pause and two painted frames.

Login retains its 450ms dashboard entrance and 700ms chart draw with 450ms delay. At the chart's actual start event, both counters begin together and run for 800ms. Final values are exact and static thereafter. Low stock remains 04. SAMPLE DATA is unchanged and receives no counter animation; it is fully visible throughout counting after the existing dashboard entrance. Static accessible text avoids announcing intermediate numbers. No React renders are scheduled by the counters.

Signup:

| Element | Start | Duration | Ends |
| --- | ---: | ---: | ---: |
| Storefront fade/rise | 0ms | 350ms | 350ms |
| Existing awning settle, 4px shift / subtle scale | 0ms | 350ms | 350ms |
| First box group | 350ms | 200ms | 550ms |
| Second box group | 420ms | 200ms | 620ms |
| Green indicator 1 | 350ms | 140ms | 490ms |
| Green indicator 2 | 430ms | 140ms | 570ms |
| Green indicator 3 | 510ms | 140ms | 650ms |
| Fast setup | 650ms | 350ms | 1000ms |
| Multi-store ready | 750ms | 350ms | 1100ms |
| Unified sales + inventory | 850ms | 350ms | 1200ms |

Box/check movement is 6px; storefront/benefits use the existing 8px rise. All animation iterations are one. No animation library, external request, video, asset download, interval, polling or continuously scheduled frame loop. Forms render and accept input immediately. Reduced motion shows final artwork/numbers immediately, including when enabled mid-animation. Mobile decorations remain hidden and counters are never armed.

## Exact verification

| Command | Result |
| --- | --- |
| `npm.cmd run test --workspace apps/web -- src/components/layout/sample-counters.test.ts src/components/layout/use-auth-entrance.test.ts src/components/layout/auth-animation-sequence.test.tsx src/routes/login.test.tsx src/routes/signup.test.tsx` | PASS: 5 files, 40 tests passed, 0 failed/skipped; focused-final.log |
| `npm.cmd run test --workspace apps/web` | PASS: 61 files, 328 tests passed, 0 failed/skipped; web.log |
| `npm.cmd run lint` | PASS: exit 0; 0 errors, 4 existing react-refresh warnings; lint.log |
| `npm.cmd run build` | PASS: exit 0, workspace API/desktop/web including TypeScript; build.log |
| `npm.cmd run build:desktop --workspace apps/web` | PASS: exit 0, desktop renderer including TypeScript; renderer.log |
| `git diff --check` | PASS: exit 0, existing LF/CRLF notices only; diff-check.log |

All 318 prior web tests remain, with 10 new cases. Existing React Router server-render warnings and build mixed-jspdf-import/large-chunk warnings remain. Registration form, confirmation validation, original API projection and locale tests remain passing; no registration production code was changed. The focused counter/lifecycle tests use controlled DOM targets, media events and frame timestamps in Node. Sequencing assertions inspect actual CSS rules and render the layouts; they are not browser motion or screenshot verification.

## Remaining owner visual review

Browser verification remains unavailable under the previously documented managed sandbox launch restrictions. No Chrome/Edge/Electron launch retry, security bypass or permission change was attempted in this trial. **No new runtime screenshots, computed browser animation styles or visual acceptance claimed.**

Review a freshly loaded local `/login` and `/signup` in normal Chrome, at desktop 1366x844 and 1024x768, light/dark and EN/PT. Confirm counters start with the purple stroke, reach Kz 2.48M and 126 once, keep 04 and SAMPLE DATA, and do not move metric widths. Confirm awning, boxes, checks and benefits appear in the sequence above, then remain static after 1.2s. Final storefront composition should match the previous approved artwork.

Enable reduced motion before loading, then during counting: all final values/artwork must appear immediately without further counting. Navigate away during the sequence, then return: the old loop must stop and the new page should animate once. Theme/language changes should not restart counting. At mobile 390/320px widths the dashboard/storefront/benefits remain hidden, with no counter loop. Inputs, submit buttons and registration validation must remain usable throughout. The owner retains final visual acceptance; this is an uncommitted local trial only.

# STORBIT branding: final local implementation

LOCAL, UNCOMMITTED, NOT DEPLOYED. No commit, push, merge, reset, clean, stash or discard.

Branch `ui/storbit-visual-v2`, HEAD `229ce1519c421290a425c25a652a21feadc40e53`, unchanged. Inspected status, existing diffs, reference board, supplied logos, previous icon files, sidebar, Electron windows/packager and PWA/HTML before edits. Preserved all existing modified/untracked work. Saved the tracked before-diff, status and source hashes in this directory.

## Application wordmarks

- `apps/web/src/components/layout/Sidebar.tsx`: replaces only the POS brand heading with the authentic original transparent wordmark. Uses `storbit-logo-original.png` in light and `storbit-logo-light.png` in dark, intrinsic 2172x724 proportions, 128px target width with max-width containment, and a non-shrinking padded slot. The shared SidebarNav covers both desktop sidebar and mobile navigation drawer. Links, permissions and POS terminology remain unchanged.
- `apps/web/src/components/layout/AuthLayout.tsx`: recovery, verification and invitation pages were still using the old white-backed reference PNG. Replaced that brand slot with the same authentic themed assets and removed only its forced white backing. Card/form layout and language picker retained. Login and Create Account use separate layouts and were not edited.
- The original wordmark files are byte-identical to the supplied assets. No wordmark tracing, text substitution, recoloring or asset alteration.

Hash audit verifies **291 protected files unchanged**, including Login/Create Account components/routes, their animations, themes, locales, auth/session and other business feature files. Across the saved web/desktop source snapshot, only five existing files changed: Sidebar, legacy AuthLayout, web customer-display title and the two Electron window source files. Exact list: source-changes.json.

## New icon master and exports

Source of truth: selected top-right app icon on `docs/brand-reference/storbit-brand-board.png.png`. Created clean vector geometry: pink/orange background blended into violet at the lower left, rounded square with radius 112 in a 512-unit viewBox, centered white curved four-point star. This is a scalable reconstruction of that selected concept, not a board crop, wordmark icon or alternative ribbon/S concept.

| Asset | Use |
| --- | --- |
| `apps/web/public/brand/storbit-app-icon.svg` | Canonical scalable master; primary browser favicon and manifest SVG icon |
| `apps/web/public/brand/storbit-app-icon.png` | 1024x1024 high-resolution export |
| `apps/web/public/favicon.ico` | Browser fallback; 16, 32, 48, 64, 128, 256px frames |
| `apps/web/public/pwa-192.png`, `pwa-512.png` | PWA raster icons |
| `apps/web/public/apple-touch-icon.png` | 180x180 Apple touch icon |
| `apps/web/public/pwa-icon.svg` | Same new SVG at the old URL for cached references |
| `apps/desktop/build/icon.ico` | Same six-resolution ICO for Electron windows, Windows executable and NSIS installer/uninstaller |
| `apps/desktop/build/icon.png` | 1024x1024 desktop high-resolution export |
| `apps/desktop/build/icon-192.png`, `icon-256.png`, `icon-512.png` | Matching desktop raster exports |

`tools/branding/generate-icons.py` regenerates all assets from the SVG using the already installed Pillow library. It parses the master's supported gradients, rounded rectangle and Bezier path, with supersampled shape masks. No dependencies downloaded or added. `tools/branding/README.md` documents regeneration and scope.

## Web and PWA

- `apps/web/index.html`: title STORBIT, SVG/ICO favicon references, Apple touch size/title, application-name, brand description and charcoal theme metadata.
- `apps/web/vite.config.ts`: PWA name/short name STORBIT, icon references and branding metadata. Added only brand assets to the existing precache so the wordmarks/favicons remain available offline. Existing API/runtime cache rules, scope, start URL and update behavior retained. Generated manifest is STORBIT; generated service worker includes both original logo files.
- `apps/web/src/routes/customer-display.tsx`: tab title STORBIT. BroadcastChannel, merchant logo/content and display behavior unchanged. Removed its now-unused exhaustive-deps suppression after the title stopped depending on a translation callback.
- `apps/desktop/static/setup.html`: title STORBIT; first-run form and behavior unchanged.
- Search and built-bundle checks find no old POS title/brand heading or reference-logo URL in these brand locations. POS terminology, hardware protocol names and compatibility identifiers are intentionally retained. The unused old reference asset is preserved on disk, but has no remaining source/bundle reference.

## Desktop display branding and compatibility

- `apps/desktop/package.json`: display productName STORBIT; package name/version unchanged.
- `apps/desktop/electron-builder.config.js`: display productName and shortcutName STORBIT; explicit Windows executableName POS preserves `POS.exe` and the installer directory identity. Windows icon now points directly to the six-resolution ICO. Existing NSIS installer/uninstaller ICO paths use the regenerated asset. Includes `build/icon.ico` in the packaged app for runtime window icons. All previous file exclusions and renderer resources retained.
- `apps/desktop/src/main.ts`: STORBIT window title and runtime icon; explicitly uses the existing `app.pos.desktop` AppUserModelID for taskbar grouping. Pins default userData to the existing `%APPDATA%/POS` before logging/config/session initialization, preserving `POS_DESKTOP_USER_DATA` overrides. This is necessary because changing productName would otherwise select a different default profile. No auth/config/session contents or mechanisms changed.
- `apps/desktop/src/customer-display.ts`: branded window title and same runtime icon only; display/hardware logic untouched.

The existing installed electron-builder code was used to compare the old/new effective AppInfo and installation values, validate configuration schema, derive the NSIS GUID, and check the old-shortcut rename mechanism. `tools/branding/verify-branding.cjs` records the result in identity-check.json:

| Identity | Before and after |
| --- | --- |
| App ID / Windows AppUserModelID | app.pos.desktop |
| Package name | @pos/desktop |
| Executable basename / default installer directory name | POS |
| NSIS GUID | 2e7191aa-2b2f-5ac9-9b10-4f985afb05f6 |
| Updater cache directory | @posdesktop-updater |
| Installer artifact pattern | POS-Setup-${version}.${ext} |
| App data default | Existing POS profile; override retained |

Publisher/feed, updater/fuse settings, per-user installation mode, app-data uninstall policy, version override behavior and signing/editing guard are unchanged. NSIS reads the previous shortcut name from the same registry identity and supports renaming to STORBIT; an actual installed upgrade still requires host verification.

The existing `signAndEditExecutable` guard remains: executable resource editing happens only in its already-supported CI/POS_EDIT_EXE environment. This task did not enable developer mode, weaken permissions or change that guard. No installer was built, installed, signed, published or exercised. Configuration/asset verification is not proof of the icon inside a packaged executable.

## Verification results

| Exact command/check | Result |
| --- | --- |
| `python tools/branding/generate-icons.py` | PASS; generated SVG alias, 8 PNGs and 2 six-resolution ICOs |
| Pillow asset audit, asset-checks.json | PASS; expected PNG dimensions, alpha corners, white center, and exact six ICO sizes |
| `npm.cmd run test --workspace apps/web` | PASS: 62 files, 332 passed, 0 failed/skipped; web-verified.log |
| `npm.cmd run test --workspace apps/desktop` | 29 tests, 27 passed, 2 failed, 0 skipped/cancelled; desktop.log |
| `npm.cmd run lint` | PASS: exit 0; 0 errors, 4 existing react-refresh warnings; lint-verified.log |
| `npm.cmd run build` | PASS: exit 0; API, desktop and web including TypeScript; build-final.log |
| `npm.cmd run build:desktop --workspace apps/web` | PASS: exit 0; desktop renderer including TypeScript; renderer.log |
| `node tools/branding/verify-branding.cjs` | PASS: schema, identity comparison, assets/manifest references and 291 preserved source hashes; identity-check.json |
| `git diff --check` | PASS: exit 0; existing LF/CRLF notices only; diff-check.log |

Four new web tests cover authentic logo selection/proportions and preserved content/links for light/dark sidebar and legacy recovery layout. All 328 prior tests remain passing. An intermediate standalone identity check hit a cross-VM array-prototype comparison issue; normalizing the captured old configuration to plain JSON fixed the harness without changing configuration or weakening value comparisons. An intermediate unused lint suppression was removed; final lint returns the prior four-warning level.

Desktop failures are the same documented sandbox loopback limitations: `Tcp9100Transport / delivers the exact bytes to a network printer` receives `connect EACCES 127.0.0.1:10184`; `a refused connection is a clear TransportError` receives EACCES on 127.0.0.1:10186 instead of the expected refusal. These are synthetic local servers, not real hardware. No transport/hardware/test code was modified and no permission workaround attempted. Full desktop 29/29 remains a host gate.

Build warnings remain for mixed static/dynamic jspdf imports and large chunks. Web SSR tests retain existing React Router useLayoutEffect warnings.

## Visual evidence and remaining manual checks

**Asset visuals verified:** inspected the supplied board, both original transparent wordmarks, the new 1024px icon, all eight PNG exports and all twelve ICO frames (desktop/favicon) composited on light/dark backgrounds. Evidence: [wordmark variants](wordmark-variants.png), [all icon exports/ICO frames](icon-exports-contact-sheet.png), asset-checks.json. SVG source and its local raster rendering were reviewed; no browser-rendered SVG or running application screenshot claim.

**Application visuals NOT verified:** sandboxed Chrome/Electron launch failures are already documented in the previous task; no launch retries or security changes here. Owner should inspect normal Chrome at 1366x768/1024x768 and mobile drawer widths 390/320, both themes: sidebar alignment/proportions, favicon/tab title, password-recovery/invitation wordmark, PWA installed name/icon and offline availability after the new worker activates. Login/signup appearance, animations and controls should remain unchanged apart from global tab metadata/icon.

On a supported host packaging environment, inspect the STORBIT window/taskbar icon, shortcut, installer/uninstaller and executable resources, then test upgrade over the old installation using an isolated test profile. Confirm same installation/registry identity, existing POS data/session availability and unchanged update feed/channel. Windows/browser icon caches or existing pinned shortcuts may need a normal refresh before showing newly built assets. Host desktop tests, browser/Electron E2E and existing release gates remain pending. Local implementation only; no release sign-off.

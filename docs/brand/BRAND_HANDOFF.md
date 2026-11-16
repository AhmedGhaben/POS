# STORBIT rebrand — handoff for Claude Code (pass 1)

**Read this whole file before changing anything.** It is the source of truth for the visual rebrand. Assets are in `docs/brand/` next to this file.

## 1. Goal and hard rules

Change how the product **looks**, not what it **does**.

**Must not change**
- Routes, API calls, data models, database, storage, sync/offline logic, permissions, business rules.
- Accounting, invoicing, fiscal and SAF-T (AO) logic, numbering or file output.
- Translation keys or i18n structure (values may change where listed below).
- Existing tests must keep passing. Do not delete or weaken tests.

**Must change (this pass)**
1. Brand tokens: palette, type, radius, spacing → `docs/brand/storbit-tokens.css`.
2. Logo and icons everywhere (web app, Electron till, favicon, PWA, installer).
3. Component styling to match section 5.
4. Default language: **pt-AO** (English stays available).
5. The visual bugs listed in section 7.
6. A shared **StatusDiamond** component (section 5) and restyling of any **existing** online/offline/sync indicator to use it.

**Out of scope (later passes — do not start them)**
- The store sync status feature ("Lojas agora" panel, offline banner, till heartbeat). It is specified in `docs/brand/SYNC_STATUS_SPEC.md` and is done **after** this PR is merged, as a separate PR.
- Sign-up, sign-in flow changes, payments/billing, and the public marketing website. These come later and will use this identity.
- Rewriting marketing copy (other than placeholders in section 6).

Work on a new branch and open **one pull request**. Commit in logical steps (tokens → logo/icons → components → language → bug fixes).

## 2. Before you edit: explore and plan

1. Map the repo: web back office, Electron till, any shared UI package. Identify the styling system (Tailwind config, CSS variables, CSS modules, a component library such as shadcn/MUI, styled-components…).
2. Find every place colours are defined or hard-coded: `#hex`, `rgb(`, `hsl(`, Tailwind colour classes (`purple-`, `violet-`, `fuchsia-`, `pink-`, `indigo-`…), gradients (`linear-gradient`, `bg-gradient-`).
3. Find the current logo assets and usages (the old mark is the wordmark "storbit" plus a red four-point star) and the sidebar label "POS".
4. Write a short plan in the PR description listing the files you will touch. Then implement.

Prefer **one central theme**: map the tokens into the existing system (e.g. Tailwind `theme.extend.colors` pointing at the CSS variables, or the component library's theme object). Replace hard-coded colours with tokens rather than swapping hex values file by file.

## 3. Logo

Files in `docs/brand/logo/`:

| File | Use |
|---|---|
| `storbit-logo-on-light.svg` | Default logo on light/paper backgrounds (graphite word, green diamond `#0B7D52`) |
| `storbit-logo-on-dark.svg` | On dark backgrounds (paper word, bright green diamond `#1BC47D`) |
| `storbit-logo-on-*-online.svg` / `-offline.svg` | Same logo with the diamond in status colour (green / amber) |
| `storbit-logo-mono-black.svg` / `-mono-white.svg` | One-colour use (thermal receipts, stamps) |
| `storbit-mark-diamond.svg` | The diamond alone |
| `*.png` | Raster fallbacks (1200 px wide) |

**Rules**
- The wordmark is always lowercase **storbit**. The dot of the "i" is a **rounded diamond**. **Never** use the old star anywhere. Remove it from all assets and components.
- Use the SVG files as they are. Do not redraw letters, change spacing or recolour the word except the light/dark/mono versions provided.
- Prefer an inline SVG React component for the in-app logo so the diamond (`path.storbit-status`) can be coloured with `var(--sb-logo-diamond)`.
- **Optional status behaviour:** if the app **already** has an online/offline state for this device (e.g. the "This device" page), the sidebar logo's diamond may show it: green = online, amber `--sb-status-offline` = offline. Do **not** build new sync logic for this. If there is no existing state, keep it green.
- Minimum width: 72 px on screen. Clear space around the logo: at least the diamond's width.
- Sidebar header: replace the text "POS" with the logo (+ small label "Gestão" in `--sb-text-muted` if there is room).

## 4. Icons

Files in `docs/brand/icons/`:
- `storbit-app-icon.svg`: green diamond on a graphite rounded square (master).
- `favicon.ico` (16/32/48), `storbit-icon-{16…512}.png`, `apple-touch-icon.png` (180), `storbit-icon-192.png` / `-512.png` for the PWA manifest.
- `storbit.ico` (16–256) for the **Electron** window, taskbar and installer (check `electron-builder`/forge config `icon` fields and `BrowserWindow({ icon })`).

Update `index.html` favicons, the web manifest (`name`/`short_name` stay "STORBIT"; `theme_color` `#15171B`, `background_color` `#F4F1EA`), and Electron build resources.

## 5. Visual system

### Colours
Import `docs/brand/storbit-tokens.css` (or copy it into the app's global styles) and use the semantic variables (`--sb-bg`, `--sb-surface`, `--sb-text`, `--sb-action`…), never raw hex in components.

- **Proportions:** mostly paper/white surfaces, graphite text and frames, green only for actions and "OK/online" (≤10% of a screen).
- **Status colours have one meaning each:**
  - Green `--sb-status-online` means online, open, success.
  - Amber `--sb-status-offline` means **offline but still selling**, and nothing else.
  - Red `--sb-status-error` means a real error or a negative money difference.
- **Neutral notices** such as the SAF-T deadline banners use `--sb-surface` + `--sb-border` + a calendar icon, **not amber** (amber is reserved for offline).
- **Remove all purple, violet, pink and all gradients** from the business product (login, sign-up, dashboard, till).
- Status is never colour-only: always pair it with text and/or an icon (↑ ↓, a dot plus a label).

### Light and dark
Keep the existing theme switcher. Light is the default. Map the dark theme to the `[data-theme="dark"]` values (or the app's equivalent).

### Typography
- **Inter** for everything (UI and headings). The logo is an image and never set in a font.
- **Bundle the font locally** (e.g. `@fontsource/inter` or self-hosted woff2), **not** from Google Fonts CDN. The till must work offline.
- Enable tabular numbers (`font-feature-settings: "tnum" 1`) wherever money or quantities are shown.
- Headings: weight 800, tracking −0.03em. Body: 400/500. Labels/buttons: 600–700.

### Components
- **Primary button:** `--sb-action` background, `--sb-action-text`, radius 12 px, height ≥ 44 px, weight 700. Hover `--sb-action-hover`.
- **Secondary button:** transparent, 1.5 px `--sb-text` border, same radius/height.
- **Destructive button:** `--sb-status-error` background, white text; use only for destructive actions.
- **Inputs/selects:** `--sb-surface` background, 1.5 px `--sb-border-strong` border, radius 12 px, height 48–52 px, visible focus ring `--sb-focus-ring` (2 px).
- **Cards/panels:** `--sb-surface`, 1 px `--sb-border`, radius 16 px, **no shadows**.
- **Sidebar/nav:** active item = `--sb-nav-active-bg` + `--sb-nav-active-text` + green icon; inactive = `--sb-text-muted` icons. Keep the existing menu items and their order. Grouped headings are welcome if the nav component supports them (Vendas, Stock, Caixa, Finanças, Pessoas, Sistema).
- **Badges/chips:** `--sb-chip` background, `--sb-text`.
- **Tabs (e.g. Overview / Store comparison):** pill group on `--sb-surface`; selected tab `--sb-chip` + bold.
- **KPI tiles:** label `--sb-text-muted`; value 28 px/800; change line green with "↑" or red with "↓".
- **Charts:** single-series bars/lines in `--sb-chart-bar`, grid `--sb-chart-grid`, axis `--sb-chart-axis`, labels `--sb-text-muted`. See bug fixes for smoothing.
- **Login and sign-up split screens:** keep the layout. Left panel `--sb-bg`, right panel `--sb-surface` (dark: `--sb-surface-sunken` / `--sb-bg`). Replace the purple/pink accent line with a 64×3 px `--sb-link` bar. Replace the awning shop illustration with no illustration, or a simple neutral one in brand colours. No pink, purple or gradients.
- **Keyboard shortcut hint:** show "Ctrl K" on Windows/Linux and "⌘K" only on macOS.

### StatusDiamond (online / offline / syncing)
One reusable component, used for every connection/sync status in the web app and the till. It's the same rounded diamond as the logo's i-dot, so the brand and the status signal are one idea.

- **Shape:** a square rotated 45° with rounded corners (radius ≈ 22% of the side). SVG preferred; see `docs/brand/logo/storbit-mark-diamond.svg`.
- **Sizes:** 8, 10, 12 and 16 px (side of the square before rotation). Default 10 px.
- **States:**

| State | Look | Label (pt-AO / en) | Meaning |
|---|---|---|---|
| `online` | filled `--sb-status-online` | Online / Online | Connected and up to date |
| `offline` | filled `--sb-status-offline` (amber) | Sem internet · a vender / Offline · still selling | No connection; sales are being kept locally |
| `syncing` | 2 px outline `--sb-status-online`, transparent fill; gentle pulse (opacity 1 → 0.5, 1.2 s) | A sincronizar / Syncing | Uploading saved sales |
| `inactive` | filled `--sb-text-muted` at 50% opacity | Desligada / Off | Device off or no open shift (no alarm) |
| `error` | filled `--sb-status-error` | Erro de sincronização / Sync error | A real sync failure that needs action (only if the app already detects this) |

- Always render a **text label** next to the diamond (or an `aria-label`/tooltip when space is tight). Never colour alone.
- Respect `prefers-reduced-motion`: no pulse, keep the outline.
- **In this PR:** if the till or back office **already** shows an online/offline/sync indicator, replace its visuals with StatusDiamond and the labels above, reusing the existing state only. The till's own indicator may include its local count, e.g. "Sem internet · a vender · 3 vendas por enviar". Do **not** add or change any sync logic here. If no indicator exists, list where one should go in the PR description.

### Accessibility
- Text contrast ≥ 4.5:1 (the tokens are pre-checked; don't put muted text on chips).
- Touch targets ≥ 44 px.
- Icon-only buttons need `aria-label`.

## 6. Language and placeholders

- Make **pt-AO** the default locale (first run, and when no preference is saved). Keep the user's saved choice if one exists. English stays available.
- Language switcher: one clear control (segmented **PT | EN** or a dropdown), not both at once.
- Replace English sample placeholders:
  - "Corner Cafe" → "Mercearia Central"
  - "Main Street" / "Main Street Store" → "Loja Central"
  - "Demo Retail Co." → "Mercearia Central, Lda." (demo data only)
- Currency: format with `Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' })` (or the app's existing formatter set to pt-AO). Never mix "2.48M" style with pt-AO formatting.

## 7. Visual bug fixes (from screenshots, Nov 2026)

1. **"Main store ? Luanda"** on login: a character (probably "·") renders as "?". Fix the encoding or the source string.
2. **Command palette shortcut:** the UI shows "⌘K" on Windows.
   - The label must read **"Ctrl K"** on Windows/Linux and **"⌘K"** only on macOS. Detect the platform with `navigator.userAgentData?.platform`, falling back to `navigator.platform`; in Electron use `process.platform`.
   - The shortcut must actually **work** with `Ctrl+K` on Windows/Linux and `Meta+K` on macOS. Check `event.ctrlKey || event.metaKey` as appropriate, and call `preventDefault()` so the browser's own Ctrl+K (focus search bar) doesn't fire.
   - It must not trigger while typing in a text input unless that's the existing behaviour.
   - In the Electron till, make sure no menu accelerator steals Ctrl+K.
3. **Revenue trend chart** uses a smoothed curve that overshoots (invents peaks, dips below 0). Use straight segments or a monotone curve; for daily revenue, bars are preferred.
4. **Clipped y-axis label** ("12 mil Kz" cut off at the top): add top padding or shorten tick labels ("12 mil").
5. **Top products** shows names with barcodes appended and duplicates (e.g. "Queijo da Serra 1792234297373"). In this chart only, display the product name; group or disambiguate duplicates with a short suffix if needed. Do not change product data.
6. **Value labels wrapping** ("2 000,0⏎Kz"): prevent wrapping (`white-space: nowrap`) and give the label column enough width.
7. **Duplicate navigation** "Back to POS" and "Point of Sale": keep one entry, labelled "Abrir ponto de venda" / "Open point of sale", styled as a primary button at the bottom of the sidebar. Same destination as today.
8. **Narrow content column** on wide screens: let dashboard content grow to about 1480 px max width.

## 8. Things not to do

- No new UI libraries. The only new dependency allowed is a local Inter font package.
- No gradients, glows or glassmorphism.
- No purple or pink in the business product (reserved for a future consumer marketplace).
- No amber for anything except "offline but still selling".
- Don't change any business text that makes claims (AGT, compliance, pricing). Leave marketing copy as-is in this pass.

## 9. Done means

- [ ] Build passes for the web app and the Electron app; lint and tests pass.
- [ ] No remaining references to the old star logo or purple/pink/gradient styles in the business product (`grep` shows none).
- [ ] Logo, favicon, PWA icons, Electron window/taskbar/installer icon all updated.
- [ ] Login, sign-up, dashboard and till screens checked in **light and dark**, at 1920 px and at phone width (web).
- [ ] pt-AO is the default; switching to EN still works.
- [ ] The eight bug fixes in section 7 are done (Ctrl+K works and is labelled correctly on Windows).
- [ ] StatusDiamond exists and any existing connection indicator uses it.
- [ ] PR description lists:
  - what changed, per area
  - anything you couldn't do or weren't sure about
  - before/after screenshots, if a headless browser is available in the environment

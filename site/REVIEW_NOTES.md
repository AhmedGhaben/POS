# Website first draft: review notes

Date: 17 November 2026 · Branch: `claude/keen-mayer-mreudb` · Not deployed.

## 1. Spec check before building

- **No newer WEBSITE_SPEC in the repository.** The repo has no website spec
  and no existing marketing site or website components. The supplied
  `WEBSITE_SPEC (1).md` identifies itself as **pass 4**, so it was used as the
  structure baseline. (The handoff says only pass 3 was available; the file
  provided is pass 4.)
- Visual direction preserved from `docs/brand/BRAND_HANDOFF.md` and
  `storbit-tokens.css`: cream/paper backgrounds, graphite headings, emerald
  actions, white bordered cards with no shadows or gradients, the StatusDiamond,
  and Inter. No new palette. The design-canvas mockups ("Website v2",
  "EN REVIEW · Sobre a STORBIT") aren't in the repo, so the layout follows
  the written specs and wireframes.
- `docs/plans/PRODUCT_AND_DISTRIBUTION.md` suggests `apps/site`. The site is
  in `site/` instead, with its own lockfile, so it doesn't change the root
  `package-lock.json` or the POS workspaces' installs and builds.

## 2. Pages

| Route | What's there | Public build (defaults) |
|---|---|---|
| `/` | Hero with animated till states (pause, stops off-screen, static under reduced motion) · 3 merchant problems · Caixa + Gestão · three diamond states · green band · "Veja primeiro. Decida depois." · who it's for + status · FAQ · CTA | No screenshots or videos; no CTA until a contact is configured |
| `/como-funciona` | Timeline 13:40 → 14:09 (till / owner) · feature videos · printer and cash drawer · edge cases | "Lojas agora" and power-cut lines replaced by the neutral fallback |
| `/sobre` | About brief §2: hero + story → 3 principles → product proof → Estado actual → company + contacts → charcoal CTA | Neutral intro, no proof section, no company column, no AGT sentence |
| `/demonstracao` | What happens next · working form only with `LEADS_OPEN` · WhatsApp/email card | No form; WhatsApp or email card, otherwise "pedidos ainda não abertos" |
| `/ajuda` | Client-side search · categories · FAQ · glossary · contacts | Untested answers use their fallback or are hidden |
| `/planos` | "Preços anunciados no lançamento" + "Porquê a STORBIT"; preview adds "Por definir" plan cards and "Métodos de pagamento — por confirmar" | Not in nav; `noindex` |
| `/transferir` | "Transferência ainda não disponível"; preview adds a disabled download design | `noindex`; button only with `DOWNLOAD_PUBLIC` + URL |
| `/termos` `/privacidade` `/cookies` | Preview: "Rascunho — conteúdo jurídico por rever" + list of topics (no legal text) | Short notice; footer links hidden until `LEGAL_APPROVED` |
| `/404` | Branded, back to Início + WhatsApp (if configured) | Same |
| `/pre-visualizacao` | Config table, 7 videos, screenshots, claims to verify, open decisions | **Not generated** |

## 3. Claims audit

| Claim on the site | Basis | Where | Gate |
|---|---|---|---|
| Caixa keeps selling without internet and sends saved sales when the connection returns | Claims register "Implemented"; founder-reported test; README | Home, Como funciona, Sobre card 1, FAQ | Shown. Worded without absolutes ("envia as vendas guardadas", "mostra as que ainda faltam enviar"). **Needs a reviewed-build test before public release** |
| Till shows "Sem internet · a vender · N vendas por enviar" | String exists in the app locales | Home, Como funciona, FAQ | Shown |
| Status always visible | Claims register | Home | Shown |
| Several stores, stock per store, transfers | Claims register, README | Home, Sobre card 3, Planos, FAQ | Shown ("com os dados actualizados depois da sincronização") |
| Import products from Excel (CSV/XLSX) with an error preview | Claims register, README | FAQ, Planos | Shown |
| 80 mm / 58 mm receipt printers, calibration receipt, drawer connection settings | `docs/HARDWARE_CHECKLIST.md`, app strings | Home, Como funciona, FAQ | Shown. **No device models named**; tested-model list gated (`hardware-models`) |
| Shift opened by counting the drawer, PIN per operator | App strings, `docs/security/TILL_PIN_LOCK.md` | Como funciona | Shown |
| "Lojas agora": store offline since 13:52, "Desligada" | PR #13 **is merged to `main`** (`9d0b514`), but not verified on a reviewed build | Como funciona, FAQ | Gated `store-status` |
| Power cut: completed sales survive and sync | Not tested | Sobre card 1, Como funciona, FAQ | Gated `power-cut`; public text says it's still being tested |
| Data export (4th card "Os seus dados são seus") | Not tested | Sobre | Gated `export` |
| AGT: "Ainda não validado" | Current project status | Everywhere (single constant in `src/data/status.ts`) | Always shown |
| AGT commitment sentence | Needs legal review | Status card | `AGT_SENTENCE_APPROVED` |
| Launch: "Ainda não lançada" | Current status | Status card, FAQ | Always shown |
| Demos available | Unknown | Status card | `DEMOS_AVAILABLE` |

Not on the site at all: prices, trial, free plan, IVA, payment methods or
logos, customer counts, testimonials, logos, uptime, demo length, response
times, "acompanhamento dedicado", setup done for the customer, receipts by
WhatsApp, e-commerce, restaurants, zero data loss, the founders' names or
photos, the former supplier.

`scripts/claims-check.mjs` enforces the wording rules on every build.

## 4. Copy decisions to confirm

- **Founder story:** the handoff's founder-informed draft is shown in preview
  with a "proposta, não aprovada" tag. Publicly, the About brief's neutral
  intro is used until `FOUNDER_STORY_APPROVED=true`.
- **Principle 2:** "Dizemos o que ainda não está pronto" (About brief) is used
  instead of the handoff's "Clareza em cada etapa". The handoff points to the
  brief for `/sobre` and limits its own overrides to other topics. Owner to
  confirm.
- **Positioning line** "Ouvimos quem está atrás do balcão. Construímos a pensar
  neles." is used as a section heading on Início (marked as a draft in preview).
- **Orthography:** pre-AO90 (*actual, projecto, facturação, contacto,
  objectivo, directo*), matching the app's "Facturas". The native reviewer
  should confirm this and the whole copy deck.
- **AGT FAQ:** "Ainda não. Validação AGT: ainda não validado." The pass 4
  sentence "A validação é um passo obrigatório antes do lançamento" was
  dropped, as the About brief replaces it with the commitment sentence that
  is pending legal review.
- **Hero microcopy:** "Sem compromisso." Pass 4's "Demonstração com os seus
  produtos" is left out until the demo format is confirmed.
- **Transferir:** pass 4's "A caixa é instalada com a nossa equipa" isn't used,
  because the claims register lists setup for the customer as "not decided".
- **Demo form:** the province list uses the 21 provinces after the 2024
  reform. Please check it.
- **Como funciona:** the "vendas à espera de uma sessão" edge case from pass 4
  is a preview-only stub, because its exact behaviour isn't described for the
  site yet.
- **About mobile:** the story is short enough (about 100 words) that no
  "Ler mais" was added.

## 5. Tests run

- `npm run build:preview` and `npm run build` (defaults), plus builds with
  `WHATSAPP_NUMBER`, with `LEADS_OPEN` + `LEADS_ENDPOINT` + `LEGAL_APPROVED`, and
  with `SIGNUP_OPEN` + `APP_URL`. The claims check passed on all of them, and
  no preview markup appeared in public HTML.
- Playwright checks:
  - Mobile menu: `aria-expanded` toggles, focus moves into the menu, Esc closes it and focus returns.
  - Hero animation cycles, and the pause button stops it.
  - Reduced motion shows the static "sem internet" frame with no pause button.
  - The phone bottom bar shows on Início and is absent on `/demonstracao`.
  - Help search works.
  - No horizontal overflow on any page at 360, 390, 768 or 1440 px (the 360 and 768 checks ran on the main pages).
- Lighthouse 12 (mobile emulation, local `astro preview`, public build with a
  test WhatsApp number):

  | Page | Performance | Accessibility | Best practices | SEO |
  |---|---|---|---|---|
  | `/` | 100 | 100 | 100 | 66 |
  | `/sobre` | 100 | 100 | 100 | 66 |
  | `/como-funciona` | 100 | 100 | 100 | 66 |

  - **SEO is 66 by design:** every page is `noindex` until `SITE_INDEXABLE=true`.
  - **Performance varies between runs:** one run of `/` scored 84, from blocking time in the container; two re-runs scored 100.
  - **Home page weight:** about 71 KB.
- **Not tested:** real iPhone or Android devices (safe area), screen readers,
  and 768 px screenshots (only the overflow check ran at 768 px).

## 6. Open decisions (also listed on `/pre-visualizacao`)

1. Approve the founder story for publication? Show the founders' names or photos?
2. Legal identity (name, NIF, registered address) and permission to publish it.
3. WhatsApp number, email, support hours.
4. Legal review of the AGT commitment sentence.
5. Approve the WhatsApp-first CTA state machine.
6. Screenshots from a reviewed build with demo data (the current ones show
   English category names and the "caixa ou back office?" first-run prompt).
7. Release gate: stay on staging (noindex) until 2 and 4 are resolved.
8. Principle 2 wording; positioning line; factura vs fatura.
9. Prices, IVA, trial, payment methods; public installer URL.
10. Tests: power cut, export, tested printer and drawer models, "Lojas agora"
    on a reviewed build.
11. Who builds and hosts `LEADS_ENDPOINT` (it isn't in the API; the API was
    not touched).
12. The seven videos (scripts, voice-over, pt-AO subtitles).

## 7. English version (added 18 November 2026)

- **Coverage:** every page exists in English under `/en/…`, with a PT | EN
  switcher in the header (desktop and mobile). It links to the equivalent
  page, with no automatic redirect.
- **Structure:** one view per page renders both languages, so the structure,
  gates and claims are identical. Copy pairs sit side by side in
  `src/views/*.astro`.
- **Same rules:** the English copy follows the same claims register. The
  claims check now also rejects English absolutes ("never loses", "zero data
  loss"…), AGT approval wording ("AGT-compliant", "certified"…) and, in
  public builds, English preview wording. AGT reads "Not yet validated" in
  English.
- **App labels:** quoted in-app labels use the app's English locale:
  "Offline · still selling · N sales waiting to sync" and "Stores now".
- **Spelling:** British English (realised, behaviour).
- **Tests:**
  - Builds: preview (22 pages) and public (21 pages) both pass the claims check.
  - Switcher: PT ↔ EN round-trips on all 10 page pairs.
  - hreflang: alternates are correct.
  - Overflow: none at 360 px on any English page.
  - Lighthouse mobile, public build:

    | Page | Performance | Accessibility | Best practices | SEO |
    |---|---|---|---|---|
    | `/en` | 97 | 100 | 100 | 66 (noindex) |
    | `/en/about` | 100 | 100 | 100 | 66 (noindex) |

- **Open questions for the English version:**
  1. Native review of the English copy.
  2. Can the team answer WhatsApp and email in English? The English pages
     don't promise it; WhatsApp messages are prefilled in English.
  3. English legal texts, and which language prevails.
  4. ~~English product screenshots~~: done, see section 8.
  5. English video subtitles (the video map only has a pt-AO captions slot).

## 8. Product screenshots per language (added 18 November 2026)

- **What changed:** each language now shows the app in its own language.
  English pages show the English app, Portuguese pages the Portuguese app.
  The app's English translation is complete (2,451 of 2,451 text keys), so
  the English screenshots are real, not mock-ups.
- **New captures (all real, demo seed data, from the current `main`, c8f4e00):**
  - **Caixa:** the Windows app (Electron build), registered as a till.
    - Four sales made online, then the connection was cut.
    - Two more sales made offline; both receipts read "Saved offline".
    - The till then showed "Offline · still selling · 2 sales waiting to sync" /
      "Sem internet · a vender · 2 vendas por enviar", with a sale in progress.
    - After reconnecting, both sales synced.
  - **Gestão:** the browser dashboard in each language, showing those six sales.
- **Old captures removed:** the rebrand-build screenshots. They came from the
  browser till, which cannot sell offline in Angola.
- **Still preview-only:** the captures keep `status: 'preview'` and stay out of
  public builds until they're taken from a reviewed release build and approved.
- **Redoing them:** `scripts/app-captures/` (with a README) reproduces them; run it on the reviewed build.
- **What this run verified:** the internet-outage path of the core claim ("the
  till keeps selling without internet and sends the saved sales when the
  connection comes back") works on this build.
  - It ran on Linux, with gnome-keyring standing in for Windows DPAPI. Repeat
    it on a real Windows PC before release.
  - It is not a power-cut test.
- **Findings for the team:**
  1. **The browser till can't sell offline in Angola.** It holds no signing
     key, so it refuses with "Unable to complete sale". This is correct fiscal
     behaviour, and the site only claims offline selling for the Windows Caixa.
  2. **The repo's offline e2e specs can't pass on Linux.** That includes A0
     "server goes down mid-session". Playwright's Electron launcher forces
     `--password-store=basic`, which turns off secure storage, so the till
     never gets its signing key. Run these specs on Windows, or launch Electron
     outside Playwright as `scripts/app-captures/capture-caixa.mjs` does.
  3. **The demo seed's products and categories are in English** ("Bakery",
     "Orange Juice 1L"), so they also appear in the Portuguese captures.
     Portuguese demo products would suit the pt-AO pages better. Changing them
     touches the app's seed, so it needs a separate decision.

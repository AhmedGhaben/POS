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

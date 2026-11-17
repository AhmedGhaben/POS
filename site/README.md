# STORBIT public website (first draft, private preview)

Static marketing site for STORBIT, built with Astro. It is **separate** from
the Gestão web app (`apps/web`), the API (`apps/api`) and the Windows till
(`apps/desktop`). It has its own `package.json` and lockfile, sits outside the
npm workspaces, and changes nothing in the POS application.

**Status:** first draft for internal review. Not approved, not deployed and
not indexed. All pt-AO copy still needs review by a native Angolan speaker.

Sources: `STORBIT_WEBSITE_FIRST_DRAFT_HANDOFF_vNext.md` (main instructions),
`WEBSITE_SPEC` pass 4 (site structure), `STORBIT_ABOUT_PAGE_BRIEF_v2.md`
(`/sobre`) and `docs/brand/BRAND_HANDOFF.md` (identity). Review notes,
the claims audit and open decisions are in [`REVIEW_NOTES.md`](REVIEW_NOTES.md).

## Run it locally

```bash
cd site
npm install
npm run dev              # private preview mode, http://localhost:4321
npm run build:preview    # static preview build in dist/, then the claims check
npm run build            # public-mode build (safe defaults), then the claims check
npm run preview          # serve dist/
npm run screenshots -- out/   # desktop 1440 + mobile 390 captures of a served build
```

## Two layers of gating

1. **`SITE_PREVIEW_MODE=true`**: private review builds only. A black
   "Pré-visualização privada" bar appears, plus clearly labelled placeholders
   (dashed boxes and tags): videos marked "Em produção", pricing "Por definir",
   company details "Por confirmar", untested claims "A verificar", a disabled
   sample demo form, and the `/pre-visualizacao` page (config, media status,
   open decisions). **Never set this in production.**
2. **Content flags**: what the public build may show. Everything is off by
   default, and an empty or bracketed value (`[a confirmar]`) counts as unset.

`npm run build` runs `scripts/claims-check.mjs` over `dist/`. The build fails
if a public build contains a preview marker, a bracket placeholder, AGT
approval wording, absolute promises ("nunca pára", "nenhuma venda perdida"…)
or pt-BR words.

## Configuration (environment variables, read at build time)

| Variable | Default | Effect |
|---|---|---|
| `SITE_PREVIEW_MODE` | `false` | Private preview: placeholders and preview bar (see above) |
| `SITE_INDEXABLE` | `false` | `index, follow`, a real `robots.txt` and the sitemap. Otherwise `noindex` and `Disallow: /`. Never on in preview |
| `SITE_URL` | `https://storbit.example` | Canonical URLs, Open Graph, sitemap |
| `APP_URL` | — | Gestão base URL. **Entrar** (→ `/login`) only appears when set |
| `WHATSAPP_NUMBER` | — | Digits only, e.g. `244…`. Without it, every WhatsApp button is hidden |
| `CONTACT_EMAIL` | — | Approved contact email. Used as the CTA when there's no WhatsApp |
| `SUPPORT_HOURS` | — | Shown only if set (must be approved) |
| `LEADS_ENDPOINT` | — | URL the demo form POSTs JSON to |
| `LEADS_OPEN` | `false` | Demo form and hero phone capture. Needs `LEADS_ENDPOINT` **and** `LEGAL_APPROVED` |
| `LEGAL_APPROVED` | `false` | Legal links in the footer; renders `src/legal/{termos,privacidade,cookies}.md` |
| `SIGNUP_OPEN` | `false` | CTA becomes "Começar →" `APP_URL/signup` (needs `APP_URL`) |
| `PRICING_PUBLISHED` | `false` | **Planos** in the nav |
| `DOWNLOAD_PUBLIC` + `DOWNLOAD_URL` | `false` | Download button on `/transferir` |
| `DEMOS_AVAILABLE` | `false` | "Demonstrações: Disponíveis mediante pedido" status row |
| `FOUNDER_STORY_APPROVED` | `false` | Founder story on `/sobre`. Otherwise the neutral company intro |
| `AGT_SENTENCE_APPROVED` | `false` | AGT commitment sentence in the status card (after legal review) |
| `COMPANY_LEGAL_NAME`, `COMPANY_NIF`, `COMPANY_ADDRESS`, `COMPANY_PUBLISH_APPROVED` | — | Company details on `/sobre` and in the footer, only when **all** are set |
| `CLAIMS_VERIFIED` | — | Comma-separated tested claims: `store-status`, `power-cut`, `export`, `hardware-models` |
| `PLAUSIBLE_DOMAIN` (+ `PLAUSIBLE_SRC`) | — | Optional cookieless analytics. Nothing loads by default |

### Primary CTA (About brief §4.5)

| Condition | Label | Goes to |
|---|---|---|
| `SIGNUP_OPEN` | Começar → | `APP_URL/signup` |
| `LEADS_OPEN` | Pedir demonstração → | `/demonstracao` (consent form, WhatsApp fallback if the endpoint fails) |
| WhatsApp number set | Pedir demonstração → | `wa.me` with the prefilled demo message |
| Only email set | Pedir demonstração → | `mailto:` |
| Nothing set | preview: disabled "· por configurar" · public: **no CTA** | — |

Row 3 (WhatsApp first) is the default until the owner approves the state machine.

## Media

`src/data/marketingAssets.ts` is the single map of the seven planned videos
(`status: 'planned' | 'ready'`) and the product screenshots. A planned video
shows as a poster marked "Em produção" in preview, with no play control, and
is hidden in public builds. A ready video opens on click in a dialog, with
`preload="none"` and pt-AO captions. It never autoplays.

The two screenshots are real captures with demo data, copied from
`docs/brand/screenshots/` (rebrand build). They aren't yet from a reviewed
release build, so they're marked `status: 'preview'`: visible in preview,
hidden publicly. Replace them, then set `status: 'approved'`.

## Brand

Tokens are imported straight from `docs/brand/storbit-tokens.css` (shared, not
forked). Logos are inlined from `docs/brand/logo/`, and icons are copied from
`docs/brand/icons/`. Inter is self-hosted (latin + latin-ext variable woff2,
OFL licence in `public/fonts/`). `public/og.png` comes from
`scripts/og-image.mjs`.

## Hosting (not configured; nothing is deployed)

- Any static host (Cloudflare Pages, Netlify, S3 + CDN, nginx). Build
  command `cd site && npm ci && npm run build`, output `site/dist/`.
- Pages are emitted as `/sobre.html` and so on, with `trailingSlash: never`.
  The host must serve `/sobre` → `sobre.html` (default on Cloudflare Pages
  and Netlify; nginx needs `try_files $uri $uri.html =404;`) and use `404.html`.
- Set the environment variables above per environment. Staging uses
  `SITE_PREVIEW_MODE=true` behind access control.
- `DOWNLOAD_URL` must be a public URL. Releases of a private GitHub
  repository aren't publicly downloadable.
- The demo form needs a `LEADS_ENDPOINT` that validates, rate-limits, checks
  the honeypot field (`website`) and stores the consent timestamp and UTMs.
  It's **not** implemented in this pass: the API was not touched.

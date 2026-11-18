# App captures for the website

Real screenshots of STORBIT with demo data, one per site language. Nothing
here changes the app: the scripts drive the existing builds.

| Output | Shown on |
|---|---|
| `caixa-offline-{en,pt}.png` | Product sections (Início, Como funciona, Sobre) |
| `gestao-{en,pt}.png` | Same, Gestão column |

Copy the results to `site/src/assets/screens/` (`caixa-offline-*.png`,
`gestao-painel-*.png`). When the capture comes from a reviewed release build,
set `status: 'approved'` in `src/data/marketingAssets.ts`. Until then the
images appear in preview builds only.

## Steps

1. Postgres with a fresh seed (`npx prisma migrate reset --force` in `apps/api`), the API on port 3000 and the web app on 5173 (`npm run dev:api`, `npm run dev:web`).
2. Build the Windows app's code: `cd apps/desktop && npm run build:web && npm run build`.
3. Capture the till:

   ```bash
   dbus-run-session -- site/scripts/app-captures/with-keyring.sh xvfb-run -a -s "-screen 0 1600x1000x24" node site/scripts/app-captures/capture-caixa.mjs out/
   ```

4. Capture Gestão: `node site/scripts/app-captures/capture-gestao.mjs out/`

## Why the keyring and CDP

- The till keeps its signing key in the OS's secure storage (Electron
  `safeStorage`, DPAPI on Windows). Without it there is no key, and Angolan
  fiscal sales can't be issued offline. That is correct behaviour.
- On Linux, `with-keyring.sh` runs an unlocked gnome-keyring as the stand-in
  for DPAPI.
- Playwright's Electron launcher always adds `--password-store=basic`, which
  turns secure storage off. So the script starts Electron itself and attaches
  over CDP.
- The same flag is why the repo's own offline e2e specs (for example A0
  "server goes down mid-session") can't pass on Linux.
- The browser till can't sell offline in Angola: it holds no signing key, and
  the sale is refused with "Unable to complete sale". Offline selling is a
  Windows Caixa feature, as the website says.

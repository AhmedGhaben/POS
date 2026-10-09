# Product, website, accounts and updates: how it all fits together

Written 2026-10-09. This is the plan for turning the app into something a
non-technical shop owner can find, buy, install and keep up to date without
help. It covers:

- the marketing website
- subscriptions
- downloads
- accounts
- updates, without reinstalling or losing data

Nothing here is built yet, except where marked **(exists)**.

**The guiding rule:** a shop owner should never need to type a server
address, run an installer twice, copy files, or know where their data is.

---

## 1. The big picture

```text
                    yourbrand.com  (marketing website)
            features · pricing · download · help · sign up
                         │                     │
             "Start free trial"           "Download for Windows"
                         ▼                     ▼
   app.yourbrand.com (web app)       download.yourbrand.com/windows
   back office, also works as        → always the latest signed installer
   a browser POS                        (today: GitHub Releases)
                         │                     │
                         └─────────┬───────────┘
                                   ▼
                  api.yourbrand.com (the server, one for everyone)
          accounts · businesses · stores · products · sales · billing
                     Postgres with daily backups
                                   ▲
                                   │ sync (works offline, uploads later)
                     Windows till app on each shop PC
              printer · cash drawer · customer display
```

**Domains (when you have one):**

| Address | What | Hosted on |
| --- | --- | --- |
| `yourbrand.com` | Marketing website (static pages) | Cloudflare Pages or Vercel (free) |
| `app.yourbrand.com` | The web app (back office and browser POS) | The host chosen in launch item #4 |
| `api.yourbrand.com` | The server (API) | Same host |
| `download.yourbrand.com` | A redirect to the latest installer | A rule on Cloudflare (free) |

**Why separate addresses:**
- The website can be redesigned at any time without touching the app.
- The download link printed on flyers never changes, even if the
  installers move from GitHub to somewhere else.

---

## 2. The marketing website

**Pages:**

- **Home:** one sentence on what it does, a screenshot of the till, and
  three benefits (works offline, prints and opens the drawer, multi-store).
  Two buttons: **Start free trial** and **Download**.
- **Features:** POS, offline mode, receipts and invoices, cash drawer and
  customer display, stock and multi-store, staff and permissions, reports.
  Each one gets a short video or GIF.
- **Pricing:** the plans (section 3), with a monthly/yearly toggle.
- **Download:**
  - Detects Windows and shows one big button.
  - Shows "What you need": Windows 10/11, a receipt printer is optional.
  - Includes a 3-step picture guide: download, open, sign in.
- **Help:** short articles with screenshots, plus a contact form or
  WhatsApp/email.
  - Articles to write: setting up the printer, the cash drawer, what
    happens offline, adding staff.
- **Legal:** Terms, Privacy, Refunds (launch item #6).
- **Sign in:** a link to `app.yourbrand.com/login`.

**Build:** a separate static site, in a new folder `apps/site` or its own
repository (Astro or Next.js static export). No server is needed. The
pricing table reads the same plan list the app uses, so they never
disagree.

---

## 3. Subscriptions and billing

**Plans** (the app already has `Business.plan` = SIMPLE / PRO, and a
`PlanGuard`). For example:

| | Starter | Pro |
| --- | --- | --- |
| Stores | 1 | Unlimited |
| Tills | 2 | Unlimited |
| Staff logins | 5 | Unlimited |
| A4 invoices, quotes, CSV import | ✓ | ✓ |
| Cash drawer, customer display | ✓ | ✓ |
| Multi-store transfers, store comparison | – | ✓ |
| AI insights | – | ✓ |

Prices are your decision, and so is per-store versus per-till pricing.
Per-till pricing is simple to explain: one price per checkout counter.

**Trial:** 14 days of Pro with no card needed. That's the fastest way to
get a hesitant shop owner to try it.

**Payment provider: decide early,** because it depends on your country.

- **Stripe:** best tools (Checkout, Customer Portal, webhooks), but only
  available in some countries.
- **Paddle or Lemon Squeezy:** "merchant of record". They handle VAT/sales
  tax worldwide and pay you out. They work from more countries, at a higher
  fee.
- **Local mobile money or bank transfer:** if your customers don't use
  cards. This would mean manual invoices plus an "activate plan" button for
  you in an admin page.

**How it works in the app** (launch item #2):

1. The owner clicks **Upgrade** in Settings and goes to the provider's
   checkout page.
2. The provider calls our server through a webhook, and the server sets
   `Business.plan` and `subscriptionStatus`.
3. **Billing is shown only to owners.** Cashiers never see billing.

**When a payment fails** (designed so a shop is never stopped mid-day):

- Day 0–7: a yellow banner for the owner only ("update your card"). The
  app works normally.
- Day 8–14: a red banner. The app still works.
- After day 14: **read-only for the back office**: reports and exports
  work, adding products and stores doesn't.
- **The POS keeps selling, and offline sales still sync.** We never lose
  their sales data, and never stop a till in front of a customer.
- After they pay, everything unlocks immediately.

**Cancelling:** data is kept for 90 days, then deleted. An export is
offered first, as launch item #6 requires.

---

## 4. Accounts

**Already working:**
- One account per business: the owner signs up with business name, store,
  email and password, and the email is verified.
- The owner adds staff with a cashier or manager role, store access and
  permissions. Staff get an email invite or a password set by the owner.
- **The same login works everywhere:** the web app, the Windows app, any
  computer.

**To add for non-technical users:**

1. **Sign up from the website.** "Start free trial" goes to
   `app.yourbrand.com/signup`, and the trial starts automatically.
2. **No server address, ever.** Release builds of the Windows app come with
   `https://api.yourbrand.com` built in.
   - The "Connect this till" screen disappears for normal users.
   - It moves to a hidden **Advanced** option, for you or support.
3. **Setting up a till without the owner's password: a pairing code.**
   1. In the back office: This device → **Add a till** shows a 6-digit
      code, valid for 10 minutes.
   2. On the new till: **Enter till code**.
   3. The till is registered to the right store and signed in as a
      till-only account.

   The owner's password never has to be typed on a shop PC.
4. **Quick cashier switching: PIN login** (part F of the desktop plan).
   - Each cashier gets a 4–6 digit PIN, which works offline.
   - The till shows a grid of staff names: tap your name, type your PIN.
   - That's far easier than email and password at a busy counter.
5. **Password reset by email (exists).** Owners can also reset staff
   passwords themselves (exists).
6. **Support access:** a **Share access with support** switch in Settings
   lets you look at their account for 24 hours to help them. It's off by
   default and recorded in the audit log.

---

## 5. Downloading and installing

**The flow for a shop owner:**

```text
Website → "Download for Windows" → POS-Setup.exe → double-click
→ installs in ~20 s, no questions → app opens → "Sign in" (or "Enter till code")
→ guided setup: pick the receipt printer, test print, test drawer → selling
```

**Work to get there:**

1. **Code signing certificate.** This is essential for non-technical users.
   - Without it, Windows shows a scary blue "Windows protected your PC"
     screen, and most shop owners will stop there.
   - Options:
     - **Azure Trusted Signing**: about $10/month, and needs a
       registered business of 3+ years, or an individual in some
       countries.
     - An **OV certificate** from Sectigo/DigiCert resellers: about
       $200–400 a year.
   - The release workflow already has the place for it: the `CSC_LINK`
     and `CSC_KEY_PASSWORD` secrets.
2. **One-click installer.**
   - Switch the installer to `oneClick: true`: no folder choice, no Next
     buttons, install, then open.
   - It installs per user, so no admin password is needed.
   - Start with Windows is on by default for tills.
3. **A download link that never changes.**
   - `download.yourbrand.com/windows` redirects to the newest installer.
   - Each release also uploads a copy named `POS-Setup.exe`, with no
     version in the name, so GitHub's
     `…/releases/latest/download/POS-Setup.exe` always works.
   - The website only ever links to the short address.
4. **Setup wizard on first run.** It walks through sign in or till code,
   choose the receipt printer, test print, choose the drawer, test drawer,
   and done. It reuses the This device settings that already exist.
5. **Later: Microsoft Store.** The Store gives automatic trust (no
   SmartScreen) and updates. It's worth it once the product is stable.
   Store apps have some limits with raw printer access, so it would need
   testing.

**Where downloads live:**
- **Now:** GitHub Releases on the public repository (exists, `v0.2.0`).
  It's free and reliable.
- **Later, if the repository becomes private:** a separate public "releases"
  repository, or Cloudflare R2. The update feed in the app moves with it,
  through a normal update.

---

## 6. Updates: new features without reinstalling or losing data

**Most of this exists already (desktop part E).**

**Where the data lives**, which is why updates can't lose it:

| Data | Where | Touched by an update? |
| --- | --- | --- |
| Products, sales, stock, staff, settings, reports | **The server** (Postgres, backed up daily) | No |
| Sales made offline, not yet uploaded | The till: the app's local database (`%APPDATA%\POS`) | No: the installer never touches that folder, and the outbox upgrades its own format (IndexedDB versions) |
| Till settings (printer, drawer, display, till name) | The till: `%APPDATA%\POS\config.json` | No |
| The app itself (code, screens) | `%LOCALAPPDATA%\Programs\POS` | **Yes: this is the only part replaced** |

**What the shop owner sees:**

1. **Nothing, usually.** The new version downloads quietly in the
   background (exists).
2. A small "Update ready" note shows at the top of the till (exists).
3. It installs **the next time the app is closed**: at the end of the day,
   or when the PC restarts. It never installs during a sale (exists).
4. Next morning the app opens in the new version, with everything where
   they left it.

**Improvements for people who never close the app:**

- **Overnight install.** If an update is ready and the till has had no sale
  for 30 minutes between 2 and 5 am, the app restarts itself to install,
  then reopens to the login screen. It's off by default and switched on
  per till.
- **"Restart to update" reminder** after 3 days of not restarting. It's
  one tap and only shows when the cart is empty.

**Keeping old and new versions working together** (some tills update later
than others):

- **The server stays backward compatible.**
  - New fields are optional, and old fields are removed only after every
    till has moved on.
  - The offline outbox sends a version with each sale, so old queued sales
    still sync after an update.
- **Minimum version.**
  - The server can say "version X is required" (for example, for a tax or
    security fix).
  - Older tills then show "Please restart to update", with a button.
  - They keep selling offline meanwhile, so it's never a hard stop.
- **Staged rollouts.**
  - Each release first goes to 10% of tills (electron-updater's
    `stagingPercentage`), then 100% a day later if no problems are
    reported.
  - A bad release reaches few shops.
- **Rollback.** Publish a higher version with the fix. Tills always move
  forward and never need a manual downgrade.

**Release routine (for you):**
1. Build and test locally (the test suites plus the hardware checklist on
   a real till).
2. Bump the version, push the tag, and GitHub builds and publishes it
   (exists).
3. Watch the error reports for a day at 10%, then roll out to everyone.

**Web app updates:**
- The browser version updates itself on the next page load (the PWA
  already shows "A new version is available, Reload").
- Server updates deploy with zero downtime, and database migrations run
  first (launch item #4).

---

## 7. Help for clients who aren't comfortable with computers

- **Send logs to support:** a button on This device.
  - It uploads the last day of the till's log (already scrubbed of
    passwords and tokens) to the server.
  - It attaches the log to a support ticket.
  - No one has to find files.
- **Remote status in your admin page:** for each business, the tills with
  their version, last seen time, pending offline sales and printer status.
  You can spot problems before they call.
- **Plain-language messages everywhere.** Already the approach:
  - "Working offline — 3 sales waiting to sync"
  - "The cash drawer didn't open: printer is off"
- **The setup wizard and test buttons** (printer, drawer and display tests
  exist).
- **WhatsApp/phone support number** inside the app, under Help.

---

## 8. Order of work

| # | Step | Depends on | Notes |
| --- | --- | --- | --- |
| 1 | **Deploy the server** (launch item #4): host, domain, HTTPS, backups, email | Your host and domain choice | Unblocks everything below |
| 2 | Release builds point at the production server; hide the server screen; one-click installer; stable download link | 1 | Small |
| 3 | First-run setup wizard + till pairing codes | 2 | Medium |
| 4 | Code signing certificate | Buying one | Before any public launch |
| 5 | Billing: plans, trial, provider, grace period (launch item #2) | 1, provider choice | Medium to large |
| 6 | Legal pages + data export/deletion (launch item #6) | – | Needed for the website |
| 7 | Marketing website | Branding, 5, 6 | Can start in parallel with 5 |
| 8 | Staged rollouts, minimum version, overnight install | 2 | Small to medium |
| 9 | Support tools: send logs, admin till status, PIN login | 1 | Medium |
| 10 | Logging/Sentry (launch item #5) | 1 | Small |

## Decisions needed from you

1. **Brand name and domain**: needed for the website, the app name and the
   installer.
2. **Hosting** for the server (launch item #4).
3. **Prices and plans**: per till or per store; trial length.
4. **Payment provider**: this depends on which country the business is
   registered in, and how your customers pay (card, mobile money, bank).
5. **Code signing**: buy before the public launch.
6. **Public or private source code**: today the repository is public, so
   updates come from its Releases. If it goes private, the installers move
   to a separate public place first. That's a one-update change for
   installed tills.

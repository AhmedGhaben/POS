# Windows desktop app: offline till, silent printing, POS hardware

Written 2026-10-09 and revised the same day after review. The user wants a
downloadable Windows app **before** the cloud deploy (launch item #4),
because clients need silent printing and direct control of POS hardware. A
browser or PWA can't do either.

This file is the implementation contract. Each part is committed and pushed
separately, with the README updated alongside.

## Goal

The till keeps working when the cloud is unreachable. The cloud is needed
for sync and shared/back-office features, not for completing a normal
supported offline cash sale.

```text
                    CLOUD / API
                         ▲
                         │ sync when reachable
                  ┌──────┴──────┐
                  │ LOCAL TILL  │  sales, outbox, catalog cache,
                  │ (Electron)  │  device settings, logs
                  └──────┬──────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   Receipt/A4 printer  Cash drawer  Customer display
```

## Architecture

- An **Electron** shell (`apps/desktop`) around the existing React app (still
  the only frontend), plus a hardware layer in the main process. The browser
  and PWA keep working. Desktop features turn on only when
  `window.posDesktop` exists.
- **Why Electron over Tauri:**
  - It's TypeScript/Node like the rest of the repo; Tauri needs Rust for
    hardware code.
  - Built-in silent printing to a named printer.
  - Mature `serialport` and `electron-updater`.
  - The cost is a ~90 MB installer, which doesn't matter for a till.
- The bundled web build is served from a custom `app://` scheme, and
  `/api/*` is forwarded to the configured server, so the web code keeps
  relative paths. **Whether the refresh cookie and session behave correctly
  this way is unproven until A0.** If they don't, A0 picks another transport,
  for example a local `http://127.0.0.1` origin or a bearer refresh token kept
  by the main process.

## What the current offline code does, and its gaps (found 2026-10-09)

The web app already queues sales offline:
- `lib/offline-db.ts`: IndexedDB `pending-sales`
- `features/pos/api.ts`: the queue-on-network-error fallback
- `features/pos/sync.ts`: drains the queue
- `offline-sale.ts`: builds the local receipt

Reading it against the requirements below turned up these gaps:

1. **No idempotency, so duplicates are possible.**
   - The `localId` is never sent to the server.
   - If `POST /sales` commits but the response is lost, the next sync posts
     the sale again.
2. **Some failures that should retry become permanent instead.** `sync.ts`
   marks a sale as permanently `failed` on any HTTP error, including:
   - 401 (expired session)
   - 502/503 (server down behind a proxy)

   Only real rejections (400/409/422) should be final.
3. **Server down with internet up isn't treated as offline.**
   - `api.ts` queues only on a network-level error or when
     `navigator.onLine` is false.
   - A 502 from the hosting proxy throws instead of queuing, so the sale fails.
4. **Auto-sync relies only on the browser `online` event**, and only while
   the POS page's `OfflineIndicator` is mounted:
   - no sync at startup
   - no periodic retry
   - never fires when only the server was down
5. **The catalog cache is in the service worker**: a Workbox runtime cache of
   `/api/products` and `/api/categories`. Service workers on a custom
   `app://` scheme are unreliable in Electron. The catalog moves to an
   explicit IndexedDB snapshot.
6. **Only sales are queued.** Offline drawer-open audit events need the same
   durable queue.

These gaps are fixed in **A0/A**. The fixes in 1–4 also improve the browser
version.

## Offline operation and later sync (requirements)

**While the internet or the API server is unreachable, a logged-in cashier
can:**
- open and use the POS
- add and remove items
- get totals and tax from local data
- take cash payments and complete sales
- print receipts silently
- have the drawer open automatically for cash sales
- open the drawer manually (with permission)
- use local printers and customer displays
- see the cached products, categories and business settings needed to sell

**Offline limits (v1):**
- Card payments are still recorded, but nothing runs through a terminal.
- New customer creation and invoice numbering need the server, because
  invoice numbers are gap-free and assigned centrally.
- Stock levels shown are the last snapshot.

**Hardware never depends on the API:** receipt printer, A4 printer, cash
drawer, COM devices and customer display are all driven locally.

**Outbox:** sales and drawer audit events go into one durable IndexedDB queue
in the app's own profile, so they survive:
- a React reload
- an Electron restart
- a crash (writes are committed before printing)
- a Windows restart

Each entry has a stable `clientId` (UUID) and a state:
- `pending` → `syncing` → `synced` (synced entries are kept 7 days, then
  pruned)
- `failed` (rejected by the server, needs a manager's review; never deleted
  automatically)

**Idempotency:**
- `POST /sales` accepts `clientId`, with a unique `(businessId, clientId)`.
- A repeat returns the existing sale with 200 instead of creating a second
  one.
- Drawer events use the same scheme.

**Sync engine:**
- Runs at startup, on a 30s timer with backoff while there's work, on the
  `online` event, and from a manual "Retry sync".
- Not tied to any page.
- Network errors, 5xx, 408 and 429 leave entries `pending` and stop the drain
  (order is preserved).
- A 401 tries to refresh first. If the session is truly gone, sync pauses
  and the user is asked to log in. **The entries stay.**
- Rejections (400/404/409/422) mark the entry `failed`, and the drain goes on.

**Cash-sale flow while offline:**

```text
complete sale → commit to outbox → print receipt → open drawer
→ show "pending sync" → cashier carries on
→ (later) server reachable → upload → server confirms → mark synced
```

Printing and the drawer never wait for the network.

**Connectivity status:**
- Tracked as two separate states: *internet* (`navigator.onLine`) and
  *server* (`/health` probe, plus the result of the last real request).
- What the POS shows:
  - "Online"
  - "Working offline — 4 sales waiting to sync"
  - "Syncing 4 sales…"
  - "All sales synced"
  - "2 sales failed to sync — retrying" or "needs review"

### Offline authentication (confirmed in A0)

- **Today:**
  - The access token (30 min) and user are kept in localStorage.
  - The refresh token (30 days) is in an httpOnly cookie.
  - A network error never clears the session; only a 401 does.
- **Proposed v1 policy:**
  - **Already logged in, server goes down:** keep working. Local actions
    don't need a valid access token. When the server returns, the API client
    refreshes and then syncs.
  - **App or Windows restarts while offline:** the persisted session reopens
    the POS for the last user, with no server call needed. The cached role
    and permissions from the last online session apply.
  - **Access token expires while offline:** irrelevant until the server
    returns, then the refresh cookie gets a new one. If the refresh has
    expired too (30+ days offline), sync pauses until someone logs in.
    Pending entries are kept.
- **Switching cashiers or lock/unlock offline:** not possible today; there's
  no lock screen. Proposed as a follow-up part F (below), not v1:
  - per-employee PIN
  - stored on the terminal only as a salted slow hash (PBKDF2/scrypt), never
    plaintext
  - issued while online
  - works offline
- A0 tests each case above and records the outcome here.

## Security (Electron)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Navigation is locked to `app://`; `window.open` and external links go to
  the system browser.
- A strict Content Security Policy on the bundled app.
- The preload exposes **only specific typed operations**. It never exposes
  `ipcRenderer` or a generic `invoke(channel, payload)`:
  - `posDesktop.printers.list()` / `.print(job)` / `.test(kind)`
  - `posDesktop.drawer.open(reason)`
  - `posDesktop.display.show(state)`
  - `posDesktop.settings.get()` / `.update(patch)`
  - `posDesktop.app.info()` / `.restartToUpdate()`
- The main process validates every IPC argument with zod and checks that
  the sender frame is the app's own `app://` origin.
- No secrets are bundled in the app. Anything shipped inside Electron can be
  extracted.

## Logging

- Rotating log files (`electron-log`, 5 × 5 MB) in the app's data folder.
- Logged events:
  - startup/shutdown and version
  - server reachability changes
  - shell-relevant API errors
  - printer discovery, print attempts and results
  - drawer commands and failures
  - TCP/serial/display failures
  - sync runs and failures
  - updater activity
  - main-process errors
- **Never logged:** passwords, access/refresh tokens, Authorization headers,
  card data.
- Scrubbing is done centrally in the log transport.
- "Open log folder" is available on the device page.

## Parts

### A0. Proof of concept: desktop, auth, API, offline (gate for everything else)

Build the minimum Electron shell, then prove each of these:

- Electron starts, the bundled React app loads, and the server address can
  be set.
- Relative `/api` requests work through the chosen transport.
- Login works. The session survives closing and reopening the app.
- Access-token refresh works, and logout clears both the cookie and the
  local session.
- **Offline cases:**
  - the server goes down mid-session and the POS keeps selling
  - restart while the server is down
  - token expired while offline
  - the catalog is available offline without a service worker

Outcome: either the transport is confirmed, or this plan is amended before
part A goes on.

### A. Shell, installer, terminal identity, offline foundation

- `electron-builder` NSIS installer, `POS-Setup-x.y.z.exe`.
- Single instance, remembers window state, optional fullscreen/kiosk mode and
  start-with-Windows.
- First-run "Server address" screen.
- **Terminal identity:**
  - On first login the terminal registers with the server: a new `Terminal`
    model (id, storeId, name such as "Front Till", code such as `POS-001`).
  - `terminalId` is stored locally and sent with sales (`Sale.terminalId`)
    and audit events.
- **Offline foundation:** fixes for gaps 1–6 above:
  - outbox with states
  - `clientId` idempotency on the API
  - corrected retry rules
  - server-reachability detection
  - an app-wide sync engine
  - the IndexedDB catalog snapshot
- Logging (above).
- **Settings → This device**, a status and diagnostics page. Hardware rows
  arrive in B–D.

```text
Terminal   Front Till · POS-001 · desktop 1.0.0
Server     https://… · Connected | Unreachable (POS working offline)
Sync       Pending 0 · Failed 0 · Last successful sync 14:37 · [Retry sync]
Receipt printer / A4 printer / Cash drawer / Customer display   (B–D)
[Open log folder]
```

### B. Silent printing

- `printDocument(kind)` replaces the four `window.print()` calls. In the
  browser it falls back to `window.print()`.
- **Dedicated hidden print window:**
  - The renderer sends the rendered document HTML from `#print-root` (the
    existing `PrintArea` output) plus the print stylesheet.
  - The main process loads it into a reused hidden `BrowserWindow`, waits
    for fonts and the logo, then calls
    `webContents.print({ silent: true, deviceName, pageSize, margins, copies })`.
  - Printing is therefore independent of the POS viewport, dialogs,
    scrolling or screen.
- Device settings:
  - receipt printer
  - A4 printer
  - auto-print after sale
  - copies
- **Printer profile and calibration:**
  - paper width: 58 mm, 80 mm or custom
  - printable width (default 72 mm for 80 mm paper and 48 mm for 58 mm)
  - left/right margin
  - font scale
  - feed lines after the receipt
  - cut after the receipt
  - "Print calibration receipt" (ruler, width marks, long text)
- The receipt, quote and invoice components are reused, **with print-specific
  CSS adjustments where required**:
  - printable width, margins, font scaling, overflow
  - very long receipts (continuous roll, no page breaks)
  - A4 pagination (repeated table header, no split rows)
- Print failures (printer offline or missing) show a toast with a
  "Retry print" option and are logged. The sale is never affected.

### C1. ESC/POS transport layer

```text
hardware/
├── transports/   EscPosTransport { send(data: Uint8Array): Promise<void> }
│   ├── WindowsRawTransport   (RAW job via the Windows spooler)
│   ├── Tcp9100Transport      (network printers, LAN only, no internet needed)
│   └── SerialTransport       (COM ports)
├── escpos.ts     byte builders: drawer kick, cut, feed, beep, text
├── PrinterService / DrawerService / CustomerDisplayService
```

- **Windows printer (USB):** submits RAW jobs through the Windows spooler.
  The Win32 integration sits behind `WindowsRawTransport`, so it can be
  native bindings, FFI, a helper executable or PowerShell without affecting
  POS logic. The choice is made after testing.
- Timeouts and clear errors for: printer off, cable out, IP unreachable,
  COM port busy or missing.
- Unit tests:
  - byte builders
  - a fake TCP 9100 server
  - a mocked serial port

### C2. Cash drawer

- The drawer is reached through the receipt printer (any transport) or a
  serial drawer. The pin (2 or 5) and pulse timing are configurable.
- Opens automatically when a sale includes cash, after the outbox commit and
  the receipt print starts. It never waits for sync.
- **Open drawer** button:
  - only shown with a new `OPEN_DRAWER` permission
  - asks for a reason: Cash pickup / Float adjustment / Manager inspection /
    Other
- **Every opening is audited**, online or offline, through the outbox:

  ```text
  event, employeeId, terminalId, storeId, timestamp, saleId?,
  reason (SALE_CASH_PAYMENT | MANUAL_OPEN + sub-reason), offline: boolean
  ```

- The audit log page shows the terminal and can filter manual opens.

### D. Customer displays

```text
CustomerDisplayService
├── SerialPoleDisplay      (2×20 VFD, ESC/POS-style or CD5220 command set)
└── MonitorCustomerDisplay (second BrowserWindow, fullscreen on chosen screen)
```

- The POS sends only abstract commands: `showItem(name, price)`,
  `showTotal(total)`, `showChange(paid, change)`, `clear()` / idle message.
  It never knows which kind of display is attached.
- Both work offline. The monitor version can show the business logo while
  idle.

### E. Updates and distribution

- `electron-updater`:

  ```text
  update found → download in background → "Version 1.0.5 ready" on the
  device page → [Restart and update], or it installs on the next app start
  ```

  It never restarts on its own, so it never interrupts a sale.
- Release builds come from a GitHub Actions job on `windows-latest` when a
  `desktop-v*` tag is pushed.
- **No GitHub token is ever embedded.** Updates for real customers are served
  from a public releases repo, the production server or a CDN. Which one is
  decided in launch item #4. During development, a local update feed is used
  for testing.
- **Unsigned** for now (decided 2026-10-09), so SmartScreen warns on install.
  Signing (Azure Trusted Signing, about $10/month, or an OV certificate,
  about $200–400/year) must be added before selling widely.

### F. (Follow-up, not v1) Offline cashier switching

A per-employee PIN lock and unlock that works offline, as described under
offline authentication. To be planned separately if clients need cashiers to
share a till.

## Not included

- Barcode scanners: they act as keyboards and already work.
- Scales, card-terminal integration, label printers: later, if needed.
- macOS/Linux builds.

## Testing

**Automated (CI):**
- unit tests for ESC/POS, transports (fake TCP and serial), settings
  validation, IPC argument validation, outbox states, sync retry rules and
  the print fallback
- API e2e tests for `clientId` idempotency (same sale posted twice gives one
  sale) and terminal registration

**Offline acceptance (run by me on this PC against the local API, by stopping
the API and disabling the network):**

```text
start online → log in → catalog synced
stop server → POS shows "Working offline"
cash sale #1 → receipt printed (Print to PDF / fake printer) → drawer kick sent
cash sale #2 → same
both in outbox as pending
close app → reopen while server is still down → both still pending
sale #3 offline
(Windows restart: by the user)
start server → sync starts by itself → 3 sales on server, each exactly once
→ local entries marked synced
```

**Partial-failure test:**
- 10 pending entries
- kill the server after 4 are accepted
- restart it
- the remaining 6 sync and the first 4 are not duplicated

This is also tested with the response "lost" after the server commits, using
a test hook that drops the response.

**Real hardware acceptance (by the user, checklist provided):**
- **Printers:**
  - 80 mm USB and 80 mm network receipt printers
  - long receipt, multiple copies
  - A4 invoice and A4 quote on the A4 printer
  - automatic print after sale
- **Offline:**
  - printing while the server is offline (USB, and network printer on the
    LAN)
  - automatic drawer on an offline cash sale
  - manual drawer offline, with its audit event queued and later synced
- **Failures:**
  - printer powered off
  - network printer unplugged
  - COM device unplugged
- **Customer displays:** pole display, second-monitor display.
- **App behaviour:** app restart, Windows restart, start-with-Windows,
  updater.
- **Text:** non-Latin text (e.g. Arabic) on receipts and the pole display.
  Pole displays often support only limited code pages, so this needs real
  testing.

## Decisions (2026-10-09)

- Client hardware: 80 mm USB receipt printers, network receipt printers,
  cash drawers and customer displays. B, C and D are all in scope.
- Ship **unsigned** for building and pilots. Add signing before selling
  widely.
- Review feedback adopted:
  - A0 gate
  - explicit offline requirements
  - hidden print window
  - transport abstraction
  - terminal identity
  - logging
  - diagnostics page
  - stricter IPC
  - printer calibration
  - display abstraction
  - explicit update flow
  - audited drawer
  - expanded tests

## Order

A0 → A → B → C1 → C2 → D → E (F later if needed).

# Handoff: STORBIT POS, PR #13 (continue from here)

Paste this whole file into the new conversation.

## Repository and state
- Repo: `AhmedGhaben/POS` (monorepo: `apps/api` NestJS + Prisma/Postgres, `apps/web` React/Vite/Tailwind, `apps/desktop` Electron Windows till, `packages/shared` types).
- PR #12 (STORBIT rebrand) is **merged** into `main`.
- PR #13 (https://github.com/AhmedGhaben/POS/pull/13), branch `claude/store-sync-status`, is **open, unmerged, undeployed**. Latest commit `b59a888`. CI is green on it (run 44001836880).
- **Do not merge or deploy** PR #13 without explicit approval.

## Standing rules from the owner
- Never access, infer or report the owner's time zone or location. Database queries in UTC; no local timestamps.
- Do not change the database, outbox/queue, sync algorithm, fiscal/SAF-T/accounting logic, sales or shifts data without explicit approval. Never delete, retry or reset failed outbox entries; never reset the database; never fabricate shifts.
- Brand rules (`docs/brand/BRAND_HANDOFF.md`): amber only means "offline but still selling"; red = real error; green = actions/online; no purple/pink/gradients; pt-AO is the default language; StatusDiamond for every status.
- If the spec conflicts with the code, stop and ask. Ask before scope changes.
- Commits end with the Co-Authored-By / Claude-Session lines; PR bodies end with the Claude Code footer.

## What PR #13 contains
1. **"Lojas agora" store sync status** (`docs/brand/SYNC_STATUS_SPEC.md`):
   - Till heartbeat `POST /terminals/me/heartbeat` (till key; `pendingCount`, `syncedOk`, `syncActive`, `appVersion`) from `apps/web/src/features/pos/heartbeat.ts`. Starts with the app (not the session); fire-and-forget, 5 s timeout; skips the customer display window.
   - `terminal_status` table (migrations `20261117090000_terminal_status`, `20261117100000_terminal_status_sync_active`).
   - Pure status rules `apps/api/src/terminals/sync-status.ts`: online / syncing / **waiting** (sales saved, nobody signed in) / offline / inactive / never; store = worst of tills (offline > waiting > syncing > online > inactive > never); stores without a Windows till: `browser` or `noTill` (muted, never offline). 2–3 min window derived without stored history.
   - `GET /stores/status` (owners all stores, managers theirs, cashiers 403).
   - Dashboard "Lojas agora" card, tills drawer, amber offline banner, sidebar logo state (`apps/web/src/features/stores/*`).
   - Per-store "sales today" deliberately left out (no suitable existing endpoint).
2. **Fix:** accountant-export e2e test made date-independent (`apps/api/test/angola-phase8b.e2e-spec.ts`).
3. **UX:** sync-error deep link (red indicator → This device → refused operations, scroll/focus/outline, reduced motion); indicator names the operation ("1 fecho de turno não sincronizou", not "venda"). SAF-T reminders grouped per due date: >7 days quiet neutral, ≤7 days stronger **neutral** (not amber), passed = red with "Prazo terminado a … · Se já entregou, pode ignorar este aviso." (never claims non-submission).
4. **Shift/till integrity** (approved by owner):
   - The till waits for its terminal identity before looking up, adopting or opening a shift; a registered till never adopts a terminal-less shift (`apps/web/src/features/shifts/till-binding.ts`, `routes/pos.tsx`, `features/shifts/api.ts`).
   - API binds shift operations and sales to the till authenticated by `X-Terminal-Key` (`apps/api/src/till/*`, `shifts/*`, `sales/*`, `shifts/terminal-exceptions.ts`):
     - Online: a sale into a browser shift or another till's shift, a sale naming another till, or opening/selling in another store than the till's → refused.
     - A key that is sent but invalid or revoked → 403 for the current-shift lookup, online open, online sale, online close and online cash movement. No key → browser/legacy rules unchanged.
     - Offline (already happened): accepted as before and idempotently, with one `SHIFT_TERMINAL_MISMATCH` audit entry (flags: `otherStore`, `invalidKey`). Queued till uploads with a revoked key still get 401 and wait.
     - Idempotent shift-open retries return a shift only to its own till (never a browser shift to a till).
     - Managers see exceptions on the Shifts page (badge + details).
   - Tests:
     - `apps/api/test/shift-terminal-binding.e2e-spec.ts` (25 tests) and `apps/api/test/store-status.e2e-spec.ts`.
     - Web unit tests.
     - Electron `apps/desktop/e2e/shift-terminal.spec.ts`, which fails on the pre-fix code.

## Test status (last run)
- API: 319 unit, 340 e2e passing. Web: 280 unit passing; lint 0 errors (4 pre-existing warnings). Desktop: 29 unit passing.
- Electron e2e on Linux/Xvfb: the same 12 offline-selling, printer and signing tests fail on `main` too (they need Windows). Examples: `a0:115`, `cart-and-documents:102`, `part-a:73`, `till-pin:111`, `till-shifts:97`, `till-void:140`, `till-discounts:103`. Not caused by PR #13.

## Open items
1. **Orphaned failed `shift-close`** in the owner's Windows till outbox, for shift `855c3400-5d5b-465a-bb3c-abf46dc98897`. That shift does not exist in the local Postgres; the server returns 404 "Shift not found". The entry must stay untouched.
   - Ruled out: a refused opening, a store mix-up, deletion by app or tests.
   - Not ruled out: the opening went to a different server or a reset database, or the opening was never queued (the till sets the shift as current before writing its opening to the queue).
   - Read-only PowerShell checks (queue parser, log check without timestamps, cash-count export) were provided; results for the log and queue checks were not yet sent.
   - Recovery proposed, not approved:
     - leave the entry as it is and export its count;
     - optionally, a "set aside" feature;
     - never retry it, recreate the shift, or turn the 404 into a 409.
2. **Owner's POS-001** (terminal `cmwjwba4i0002hhoceokbuvfr`) has OPEN shift `2467360f-fb55-4076-aed1-a227629c4b59` with no terminal and 4 till sales. After PR #13, online sales from POS-001 into it are refused; closing it from the till is allowed (flagged). The owner decides when to close it. Do not touch it.
3. **Not fixed, reported:** the back-office top bar overflows on phones when a business has several stores (store switcher + language button).
4. **Manual Windows verification still needed:**
   - PR #13 test-plan steps 2, 3, 9, 10, 11 (offline, reconnect, between cashiers, `waiting`, deep link).
   - A fresh till start with a browser shift open (it must ask for an opening float).
   - Offline selling and upload with the binding rules.
   - The rebrand's POS → STORBIT installer upgrade (appId kept `app.pos.desktop`, data folder pinned to `%APPDATA%\POS`).

## Local setup notes
- Dev DB: Docker Compose `postgres` service (port 15432, user/db `pos`). Read-only queries via `docker compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on -c timezone=UTC' postgres psql -U pos -d pos`.
- Till data folder: `%APPDATA%\POS` (IndexedDB queue `IndexedDB\app_pos_0.indexeddb.leveldb`, `config.json`, `logs\main.log`).

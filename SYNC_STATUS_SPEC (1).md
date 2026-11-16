# STORBIT — store sync status ("Lojas agora"): spec for Claude Code (pass 2)

**Do this only after the rebrand PR (`BRAND_HANDOFF.md`) is merged.** Reuse its tokens and the **StatusDiamond** component. Work on a new branch and open one pull request.

## 1. Goal

Let the owner see, at a glance on the dashboard, whether each store's till(s) are connected, when they last synced, and whether saved sales are being uploaded. Our main promise is "the till keeps selling without internet", and this makes it visible.

## 2. Hard rules

- **Never block or slow a sale.** Status reporting must be fire-and-forget: if it fails, times out or the server is down, the till carries on exactly as today. No new awaits in the sale path.
- **Do not change the offline queue or sync algorithm.** You may *read* its state (online flag, pending count, last successful sync) and *report* it. If the existing sync call already reaches the server, piggyback on it rather than adding a parallel mechanism.
- **Do not touch** accounting, invoicing, fiscal or SAF-T logic.
- Respect tenancy and permissions: a user only sees stores/devices they already have access to.
- Keep all existing tests passing; add tests for the new logic.

## 3. What the server can and cannot know (be honest in the UI)

- While a till is offline, the server **cannot know** whether it is still selling or how many sales are queued. It only knows **when it last heard from the till** and what the till reported then.
- So the dashboard must **not** claim live facts it can't observe. Use the wording in section 6: "Sem ligação desde 13:52", not "3 vendas por enviar" (the count is only known again when the till reconnects).
- The **till itself** knows its live state and queue size, so the till's own indicator **can** show "Sem internet · a vender · 3 vendas por enviar".

## 4. Data to report (till → server)

First explore what already exists: device/till registration, store linkage, cash shifts, the sync endpoint(s), and any "This device" page. Then implement the smallest addition that provides, per device:

| Field | Source |
|---|---|
| `device_id` | existing device/till identifier |
| `store_id` | existing linkage |
| `last_seen_at` | server time when any request from this device arrives (heartbeat or sync) |
| `last_sync_success_at` | server time of the last successful sync batch |
| `pending_count_reported` | queue size the till reports with each heartbeat/sync (0 when empty) |
| `app_version` | till app version (optional, helpful for support) |

**Heartbeat:** when online, the till sends a tiny request every **60 s** (and immediately on reconnect) with `pending_count` and `app_version`. Skip it if a sync request was sent in the last 60 s, since the sync itself counts as a heartbeat. Use a short timeout (≈5 s) and never retry aggressively.

**Storage:** a small table or document (e.g. `device_status`) keyed by `device_id`, upserted on each heartbeat/sync. Add a migration consistent with the project's tooling.

## 5. Status rules (server side, one pure function + unit tests)

Thresholds are named constants in one place (defaults below).

Per **device**:
1. `syncing`: seen within **2 min** AND `pending_count_reported > 0`.
2. `online`: seen within **2 min** AND pending = 0.
3. `offline`: not seen for more than **3 min** AND the device has an **open cash shift** (it is supposed to be working).
4. `inactive`: not seen for more than 3 min AND **no open shift** (shop closed or till off, so no alarm).
5. `never`: device registered but never seen.

Between 2 and 3 minutes, keep the previous state to avoid flicker.

Per **store** (what the dashboard shows): the worst of its devices, in this order: `offline` > `syncing` > `online` > `inactive` > `never`. Also return the device list, so the details view can show "Caixa 1 · Online, Caixa 2 · Sem ligação".

Expose this through one endpoint used by the dashboard (or the project's existing data-fetching pattern), e.g. `GET /stores/status` → `[{ storeId, name, status, lastSeenAt, lastSyncSuccessAt, devices: [...] }]`.

## 6. UI

Use **StatusDiamond** everywhere. pt-AO is the primary language; English strings go in the existing i18n files.

### Dashboard: "Lojas agora" panel
A card next to (or under) the revenue chart, listing each store the user can see:

| Status | Line under the store name |
|---|---|
| online | ◆ Online · sincronizada às 14:09 |
| syncing | ◇ A sincronizar vendas guardadas · última às 14:05 |
| offline | ◆ (amber) Sem ligação desde 13:52 · as vendas feitas entretanto chegam quando a ligação voltar |
| inactive | ◆ (muted) Desligada · último contacto ontem às 21:04 |
| never | ◆ (muted) Ainda sem contacto · configurar caixa |

- Show today's sales per store if the dashboard already has that number; don't build new sales queries for it.
- Times are relative to the store's time zone (Angola, WAT, UTC+1) and formatted pt-AO (`14:09`, `ontem às 21:04`, `16/11 às 09:30`).
- Clicking a store opens its devices (a drawer or the existing store page): each till with StatusDiamond, last seen, last successful sync, app version.
- Refresh every **30 s** while the dashboard is visible (pause when the tab is hidden), or use the app's existing realtime channel if there is one.
- Empty state: "Ainda não há caixas ligadas a esta loja."

### Dashboard: banner
When **any** store is `offline`, show one banner at the top of the dashboard:
- Background `--sb-offline-bg`, border `--sb-offline-border`, text `--sb-offline-text`, amber StatusDiamond.
- One store: **"Loja 2 sem ligação desde as 13:52."** followed by "As vendas feitas entretanto chegam quando a ligação voltar." and a link "Ver Loja 2".
- Several stores: **"2 lojas sem ligação."** followed by "Ver lojas".
- It disappears automatically when they reconnect.
- The SAF-T deadline banners stay **neutral** (not amber).

### Sidebar logo diamond
The logo's diamond (`path.storbit-status`) shows the overall state: amber if any store is `offline`, green otherwise. Add a small line under the logo when amber: "1 de 3 lojas sem ligação". Never red.

### Till (Electron)
The till knows its own live state, so its status bar shows:
- **Online** · green diamond.
- **Sem internet · a vender · N vendas por enviar** · amber diamond. Use the real local queue count.
- **A sincronizar N vendas** · green outline diamond, with the pulse.
- **Erro de sincronização** · red, only if the existing sync code already reports a failure; include the existing retry action if there is one.

The till window/taskbar icon does not need to change state.

## 7. Done means

- [ ] Unit tests for the status function (all five states, the 2–3 min hysteresis, the store aggregation).
- [ ] API/integration test for the status endpoint, including permissions.
- [ ] Manual test plan in the PR:
  1. Till online shows online.
  2. Unplug the network with a shift open: after ~3 min the dashboard shows amber "Sem ligação desde …", the banner appears and the sidebar diamond turns amber; the till keeps selling and shows "Sem internet · a vender · N vendas por enviar".
  3. Reconnect: the till shows "A sincronizar N vendas", the dashboard shows syncing, then online; the banner disappears.
  4. Close the shift and turn the till off: the dashboard shows "Desligada" (muted), with no banner.
- [ ] A sale still completes instantly when the status endpoint is unreachable (simulate a server error or timeout).
- [ ] No changes to sale, sync-queue, accounting or SAF-T logic (point to the diff in the PR).
- [ ] pt-AO and EN strings added.

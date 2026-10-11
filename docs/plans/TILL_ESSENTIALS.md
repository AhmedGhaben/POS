# Till essentials: cancel a sale, discounts, PIN login, shifts, till setup

**Status:** approved 2026-10-11 ("make the plan for all then start
executing"). Built in the order below, one part at a time; each part is
committed and pushed with the README updated, and released when it's
useful on its own. All of this comes before launch item #4 (deploy).

**Why:** the app works end to end, but a real shop needs these on day one:
- cashiers make mistakes and need to cancel a sale
- almost every shop gives discounts
- cashiers change during the day, often while the internet is down
- owners need to check the cash at the end of each shift
- setting up a new till should not need the owner's password

All five work offline in the Windows app, like selling does today.

## Order

| Part | What | Depends on |
| --- | --- | --- |
| 1 | Cancel (void) a sale, plus a Recent sales list on the till | – |
| 2 | Discounts on items and on the whole sale | – |
| 3 | Till key + PIN login and quick cashier switching | – |
| 4 | Shifts: open the till, cash in/out, close with a cash count, end-of-shift report | 1, 2, 3 |
| 5 | Till codes (pairing) and the first-start setup wizard | 3 |

---

## Part 1. Cancel (void) a sale

**What the cashier sees:**
- A **Recent sales** button on the till opens a list of this store's sales
  from today, newest first: receipt number, time, cashier, total, payment,
  and a "Cancelled" badge where it applies.
  - Sales still waiting to upload (offline) are in the list too.
  - Each sale has **Reprint receipt**. Reprints are marked "COPY".
  - Each sale has **Cancel sale** for people with the new **VOID_SALE**
    permission (owners and managers by default; can be given to a cashier).
- **Cancel sale** asks for a reason, then confirms:
  - Wrong items or price
  - Customer changed their mind
  - Payment problem
  - Training or test
  - Other, with a note
- After cancelling: the stock goes back on the shelf, and a small **VOID**
  slip can be printed. For a cash sale, the drawer opens so the money can
  be handed back (recorded as a drawer opening, reason "Sale cancelled").

**Rules (server):**
- `POST /sales/:id/void` with `{ reason, note? }`.
- Only a COMPLETED sale. Refused when:
  - it already has a return: use Returns instead
  - an A4 invoice was issued for it: an invoice is a legal document, so it
    needs a credit note (not built)
  - it is older than 24 hours, or (after part 4) its shift is closed: use
    Returns instead
- The sale becomes VOIDED and records `voidedAt`, `voidedById`,
  `voidReason` and `voidNote`. Stock is put back in the same transaction.
  The audit log records it automatically.
- Reports already count COMPLETED sales only. Returns refuse a voided sale.
- **Offline:** the cancel is saved in the outbox like a sale, and uploads
  after the sale itself. It can cancel a sale that hasn't uploaded yet: it
  refers to the sale by its `clientId`. If the person turns out not to have
  the permission at upload time, the upload is refused and shows in "Failed
  sales" on This device for a manager.

**Tests:** API e2e (void rules, stock back, permission, offline by
clientId, invoice/return/age refusals); web unit (recent-sales merge of
server and queued sales); desktop e2e (cancel from Recent sales, online and
offline).

---

## Part 2. Discounts

**What the cashier sees:**
- On a cart line: tap the line → **Discount**: a percentage or an amount
  off that line.
- On the whole sale: **Discount** under the totals: a percentage or an
  amount off the sale.
- The cart, totals, customer display, receipt, quote and A4 invoice show
  each discount and the total saved.
- Needs the new **APPLY_DISCOUNT** permission (owners and managers by
  default; can be given to a cashier). Owners can set a **maximum discount
  %** for cashiers in Settings (default: no limit for people with the
  permission).

**How the money is worked out** (one shared function in `packages/shared`,
used by the till, the offline receipt and the server, so they always
agree):
- Everything is calculated in cents (whole numbers), to avoid rounding
  drift.
- A line's net = price × quantity − line discount.
- A sale discount is spread across the lines in proportion to their net,
  with the leftover cent going to the largest line. Each line stores its
  full discount, so tax and returns stay correct per item.
- Tax is calculated on the discounted amount (how VAT works in Portugal,
  Brazil and Angola).
- `subtotal` = before discounts, `discountTotal` = all discounts, `total`
  = subtotal − discounts + tax.

**Server:**
- The sale request gains an optional discount per line and one for the
  sale: `{ type: "PERCENT" | "AMOUNT", value }`. The server works out the
  amounts itself with the shared function and checks the permission and
  the maximum.
- Offline sales keep the discount the till gave, like they keep its prices.
- Reports: revenue becomes subtotal − discounts; profit subtracts the
  discounts too.
- Returns refund what was actually paid per item (line total ÷ quantity),
  not the full price.

**Tests:** shared unit tests for the maths (spreading, rounding, tax);
API e2e (permission, maximum, totals, returns after a discount, reports);
desktop e2e (discounted sale, receipt shows it).

---

## Part 3. Till key, PIN login and quick cashier switching

**What the cashier sees** (Windows app on a registered till):
- The sign-in screen shows the **staff of this store as name buttons**.
  Tap your name, type your **4–6 digit PIN**, and you're in. **Sign in
  with email** stays available below.
- A **Lock** button in the top bar (and optional auto-lock after a few idle
  minutes, set on This device) returns to the name buttons. The cart is
  kept for the same person.
- **Switching cashier works offline.**
- Each sale, cancel, drawer opening and (later) shift is recorded under the
  person who was actually on the till, even when it uploads later.

**Setting PINs:**
- Owners and managers set or reset a staff member's PIN in the staff login
  dialog, like the password.
- Anyone can set their own PIN from the account menu (asks for their
  password).
- PINs are never stored as plain text. Too many wrong tries locks that
  person's PIN for 5 minutes, both on the server and on the till.

**How it works:**
1. **Till key.** Registering a till (This device) now also gives it a
   secret key.
   - The key is kept by the Windows app's main process, encrypted with
     Windows' own protection (DPAPI via Electron `safeStorage`). The web
     screens never see it.
   - The app attaches it (`X-Terminal-Key`) to every request it forwards to
     the server. The server stores only a hash.
   - Tills registered before this update get their key automatically the
     next time an owner or manager is signed in on them.
   - A till removed or deactivated on the server stops working at once.
2. **Staff list for the till.** `GET /terminals/me/staff` (till key)
   returns the people who can use this till's store and have a PIN: name,
   role, permissions, and a PIN check value (PBKDF2-SHA256 with a random
   salt, 210,000 rounds). The main process keeps it for offline use and
   refreshes it with the catalog.
3. **PIN sign-in online:** `POST /auth/pin` with the till key, the person
   and the PIN returns a normal session for them. Rate-limited and locked
   after 5 wrong PINs.
4. **PIN sign-in offline:** the main process checks the PIN against the
   saved value and tells the screens who is on the till. Their saved
   permissions apply. When the server is back, the main process asks for a
   session for that person with the till key (`POST /auth/pin/resume`),
   allowed only within 12 hours of the offline PIN check.
5. **Uploads use the till key.** Queued sales, cancels, drawer openings
   and shift events carry `actingUserId`. With a valid till key, the server
   records them under that person after checking they belong to the
   business, are active, and can use that store. So the queue uploads even
   when nobody is signed in, and the "sync pauses after 30 days offline"
   limit goes away.

**Security notes:**
- A 4–6 digit PIN is weak on its own, so it only works together with a
  till key. Nobody can use a PIN from a browser or another computer.
- Someone who copies the till's files can't use the key on another PC:
  DPAPI ties it to that Windows account.
- Managers who want more safety can keep using email and password.

**Tests:** API e2e (till key issue and rotate, PIN set/verify/lockout,
staff list, resume window, uploads attributed via actingUserId, a
deactivated till or user refused); desktop unit (PIN check, lockout,
key storage); desktop e2e (switch cashier online and offline, sales
attributed to the right person after sync).

---

## Part 4. Shifts: opening and closing the till

**Turned on per business** in Settings ("Count the cash at the start and
end of each shift"). Off by default, so nothing changes for shops that
don't want it. When it's on:

**What the cashier sees:**
1. **Open the till:** before the first sale, the till asks for the
   **opening float** (the cash in the drawer).
2. **Sell as usual.** Anyone can sell while the shift is open. Each sale
   still records its own cashier. The shift belongs to the person who
   opened it, who is the one who counts at the end.
3. **Cash in / Cash out** (button next to Open drawer): money added or
   taken out during the shift, with a reason (cash pickup to the safe,
   petty cash, change top-up, other) and an amount. The drawer opens and
   the movement is recorded.
4. **Close the till:**
   - The cashier counts the cash and types the amount **without seeing the
     expected figure first** (a blind count, so the count is honest).
   - The till then shows expected, counted and the difference.
   - It prints the **end-of-shift report**.

**Expected cash** = opening float + cash taken (sale amounts paid in cash)
− cash refunds + cash in − cash out. Cancelled sales don't count.

**End-of-shift report** (80 mm, and on screen):
- shift times, till, who opened and closed it
- number of sales; totals by payment method
- discounts given; cancelled sales (count and amount); returns
- cash in and cash out, with reasons
- expected cash, counted cash, difference
- sales per cashier

**Back office:** a **Shifts** page lists shifts per store and till, with
the difference highlighted when it isn't zero. Each one opens the report,
which can be reprinted.

**Server:**
- `Shift` (store, till, opened by, opening float, opened/closed at, closed
  by, counted, expected, difference, note, `clientId`). One open shift per
  till; in a browser, one per person per store.
- `CashMovement` (shift, type IN/OUT, amount, reason, note, who, when,
  `clientId`).
- Sales and returns get an optional `shiftId`. Sales carry the shift's
  `clientId` and the server links them, so this works offline.
- On close, the server works out the expected cash from its own records
  and keeps both its figure and the till's. A difference between them
  (for example a sale still waiting to upload) is shown on the report.
- A sale in a closed shift can no longer be cancelled.
- **Offline:** opening, cash in/out and closing go through the outbox. The
  till works out the expected cash from its own record of the shift.
- **Returns** processed at a till during a shift count as cash refunds.
  Returns gain a refund method, default Cash.

**Tests:** API e2e (open/close, one open shift per till, expected-cash
maths with voids, discounts, refunds and cash movements, offline
clientIds, report); web unit (expected-cash maths); desktop e2e (full
shift online, and a shift closed offline that syncs later).

---

## Part 5. Till codes and the first-start setup wizard

**Adding a till without the owner's password:**
1. In the back office: **This device → Add a till** (or the Tills list on
   the Settings page): pick the store, type a name, and get a **6-digit
   code** valid for 10 minutes.
2. On the new till: **Enter till code**. The till is registered to that
   store and gets its till key (part 3).
3. Cashiers then sign in with their PINs. Nobody types the owner's
   password on the shop PC.

**Server:** `POST /terminals/pairing-codes` (owner/manager) creates a code
(stored hashed, single use, 10 minutes). `POST /terminals/pair` (public,
strictly rate-limited) swaps a valid code for the till and its key.

**Setup wizard** (Windows app, first start; can be run again from This
device):
1. Server address (today's setup screen; hidden once the production
   address is built in, after deploy)
2. **Enter till code** or **Sign in** (an owner or manager then registers
   the till as today)
3. Receipt printer → test print
4. Cash drawer → test open
5. Customer display (optional) → test
6. Done: straight to the PIN sign-in

It reuses the existing This device sections, so no settings are
duplicated.

**Tests:** API e2e (code expiry, single use, rate limit, wrong store
access); desktop e2e (pair a till with a code, then go through the wizard
with the fake printer and drawer).

---

## Translations

Every new screen ships in English, European Portuguese and Brazilian
Portuguese (`docs/plans/I18N.md`), and new server messages are added to
`apps/api/src/common/i18n/messages.ts`.

| English | pt-PT | pt-BR |
| --- | --- | --- |
| Cancel sale | Anular venda | Cancelar venda |
| Recent sales | Vendas recentes | Vendas recentes |
| Discount | Desconto | Desconto |
| Lock | Bloquear | Bloquear |
| PIN | PIN | PIN |
| Open the till | Abrir caixa | Abrir caixa |
| Close the till | Fechar caixa | Fechar caixa |
| Opening float | Fundo de caixa | Fundo de troco |
| Cash in / Cash out | Entrada / Saída de dinheiro | Suprimento / Sangria |
| End-of-shift report | Relatório de fecho | Relatório de fechamento |
| Till code | Código da caixa | Código do caixa |

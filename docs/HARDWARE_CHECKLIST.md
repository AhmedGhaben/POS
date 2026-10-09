# Hardware acceptance checklist (Windows app)

Run these on a real till with the real printers before giving the app to a
shop. The automated tests can't reach physical devices: they check layout
by printing to PDF, and they check the failure path with a printer that
doesn't exist. Tick each box and note the printer model.

Setup: install `POS-Setup-x.y.z.exe`, connect to the server, sign in as
the owner, then open **This device**.

## Silent printing (part B)

Printer models used: receipt `__________`, A4 `__________`

**Setup and calibration**

- [ ] The receipt printer appears in the list. Choose it; status shows
  **Available**.
- [ ] **Print calibration receipt** prints with no dialog.
  - [ ] Both sides of the "BOTH SIDES OF THIS BOX MUST PRINT" box are
    visible.
  - [ ] If the right side is cut off, lower **Printable width** and print
    again until it fits. Note the value: ____ mm.
  - [ ] If everything is shifted to one side, adjust **Left margin**.
    Value: ____ mm.
  - [ ] The ruler marks are about 10 mm apart (measure with a ruler).
- [ ] 58 mm printer (if any): choose **58 mm**, print the calibration
  receipt again, and check it fits.

**Receipts at the POS**

- [ ] Turn on **Print the receipt automatically after each sale**. Make a
  cash sale: the receipt prints by itself, with no dialog.
- [ ] Print receipt (button in the Sale complete dialog) prints again.
- [ ] Long receipt (15+ items): one continuous slip, nothing cut between
  items, footer fully printed.
- [ ] **Paper after receipt:** the tear-off or auto-cut happens below the
  footer, not through it. Adjust if needed: ____ mm.
- [ ] **Copies = 2** prints two receipts.
- [ ] Logo and dividing lines are dark enough to read.
- [ ] Print quote (POS → Print quote → slip) prints on the receipt printer.
- [ ] Non-Latin text, if you use it (e.g. Arabic product names), prints
  correctly.

**A4 printer**

- [ ] Choose the A4 printer and run **Print A4 test page**: one page,
  about 15 mm margins.
- [ ] A4 invoice (Sale complete → A4 invoice → Print) prints with no
  dialog.
- [ ] A4 quotation prints with no dialog.
- [ ] A long invoice (25+ lines) runs onto page 2 cleanly.

**Offline**

- [ ] Unplug the network cable or disconnect Wi-Fi, then make a cash sale.
  "Saved offline" shows and the receipt still prints.
- [ ] Network receipt printer on the shop LAN with the internet down
  (router to the internet unplugged, LAN still up): the receipt prints.

**Failures**

- [ ] Receipt printer switched off, then make a sale. The sale completes,
  and a red "Couldn't print" message appears with **Retry**. Switch the
  printer on and click Retry: it prints.
- [ ] Printer unplugged or renamed: the device page shows **Not found**.
- [ ] Network printer cable pulled: the error appears, and the sale is not
  affected.

**Restart**

- [ ] Close and reopen the app: printer settings are kept.
- [ ] Restart Windows: printer settings are kept and auto-print still works.

## Cash drawer (part C)

Drawer and printer used: `__________`, connected via `__________`.

**Setup**

- [ ] Plug the drawer's RJ11/RJ12 cable into the receipt printer's
  "DK"/drawer port.
- [ ] This device → Cash drawer → **Plugged into the receipt printer**,
  then **Test drawer**: the drawer opens.
  - [ ] If nothing happens, try **Pin 5**, then a longer **Pulse length**
    (e.g. 200 ms).
  - [ ] Network printer not installed in Windows: choose **Network printer
    (IP address)**, enter its IP, then Test drawer.
  - [ ] Drawer on its own COM port: choose **COM port**, the port and the
    speed from the drawer's manual, then Test drawer.
- [ ] **Cut the paper after each receipt:** only turn this on if receipts
  don't already cut. Check the cut comes below the footer.

**Day-to-day**

- [ ] A cash sale opens the drawer by itself, at about the same moment the
  receipt prints.
- [ ] A card sale does **not** open the drawer.
- [ ] **Open drawer** (as owner or manager): choose a reason, and the
  drawer opens. It appears on **Cash drawer** in the back office with
  your name, the till and the reason.
- [ ] Signed in as a cashier: no **Open drawer** button. Grant it under
  Employees → the cashier → permissions → "Open the cash drawer without a
  sale": the button appears (after reopening the POS).

**Offline and failures**

- [ ] Internet unplugged: a cash sale still opens the drawer, and a manual
  opening still works. Once back online, both show on **Cash drawer**,
  the manual one marked **Offline**.
- [ ] Printer off: the cash sale still completes, and "The cash drawer
  didn't open: …" appears. The opening shows as **Didn't open** on Cash
  drawer.
- [ ] Two quick cash sales in a row: the drawer opens for each, and
  nothing gets stuck.

## Customer display (part D)

Display used: `__________`

**Pole display (2 lines × 20)**

- [ ] Plug it in. A USB pole display usually appears as a COM port
  (Device Manager → Ports).
- [ ] This device → Customer display → **Pole display**, **COM port**,
  then choose the port and speed (often 9600). Click **Test display**: you
  should see "POS DISPLAY TEST" on top and 1234567890… below.
  - [ ] Garbled or nothing: try the **CD5220** command set, then **Plain
    text**, and check the speed in the display's manual.
- [ ] The welcome message shows when no sale is in progress.
- [ ] Ringing up: each item and its price on top, the running total below.
- [ ] Cash sale: PAID / CHANGE. Card sale: TOTAL / THANK YOU. Closing the
  sale dialog brings back the welcome.
- [ ] Unplug the display mid-sale: selling carries on. Plug it back in:
  the next item shows again.
- [ ] Accented names show without accents (Café → Cafe). Non-Latin names
  show as "?", a limitation of pole displays.

**Second monitor**

- [ ] Connect the customer monitor and set Windows to **Extend** the
  display.
- [ ] This device → Customer display → **Second monitor**. The customer
  screen fills the second monitor (pick it under **Screen** if there are
  more than two).
- [ ] Logo and welcome message when idle; items and a large total while
  ringing up; "Thank you!" and the change after a cash sale.
- [ ] Readable from where the customer stands. Long sales scroll to the
  newest item.
- [ ] Restart the app: the customer screen comes back on its own.

## Updates (part E)

- [ ] Install `POS-Setup-<version>.exe` from the repository's GitHub
  Releases page. This device → Updates says **Up to date** (after about
  15 s, or after Check for updates).
- [ ] When a newer release is published: within 4 hours (or straight away
  with Check for updates) it says **Version x ready, installs on the next
  restart**, and the POS top bar shows "Update x ready". Selling is not
  interrupted.
- [ ] Close and reopen the app: it's the new version (This device →
  Desktop version). Settings, the till registration and pending offline
  sales are all still there.
- [ ] **Restart and update now** installs and reopens the app.
- [ ] No internet: Updates says it couldn't reach the update server, and
  nothing else is affected.

## Power cut

- [ ] With the server unreachable, make a cash sale and wait for "Saved
  offline". Then pull the till's power plug.
  - [ ] After restarting, open the POS: the sale shows as waiting to sync.
  - [ ] With the server reachable again, it syncs once. Check Sales on the
    dashboard.

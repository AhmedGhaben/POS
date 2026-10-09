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

## Cash drawer (part C): to come

## Customer display (part D): to come

## Power cut

- [ ] With the server unreachable, make a cash sale and wait for "Saved
  offline". Then pull the till's power plug.
  - [ ] After restarting, open the POS: the sale shows as waiting to sync.
  - [ ] With the server reachable again, it syncs once. Check Sales on the
    dashboard.

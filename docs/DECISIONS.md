# Angola plan: decisions and progress (from phase 8b)

The plan is `docs/plans/ANGOLA.md` (its **Progress** section has the
details of each phase). This file records the choices made without the
owner, so they can be reviewed and reversed.

## Summary

_In progress — updated at the end of the session._

- Phase 8b (SAF-T + accountant exports) redone and built; date fix done
  (calendar dates in Luanda's time; month-end and year-end tests).

---

## Corrections to the previous session's log (2026-10-15)

The earlier version of this file said phase 8b was complete with all tests
passing. On checking:

- The API unit suite was red: `messages.spec.ts` failed on the untranslated
  "Invalid date format". ("13/13 fiscal tests" were the existing signature
  and line tests; nothing tested the exports.)
- The SAF-T XML wasn't valid against the XSD (all lines inside one `<Line>`,
  no `DocumentStatus`, `NumberOfEntries`, totals or `SpecialRegimes`,
  `ProductID` "POS", exemption reason and code in the wrong order, a
  `Contact` structure that is text in the schema, `buyerAddress.street`
  that doesn't exist).
- The dates depended on the server's own time zone (`getHours()`) and the
  web sent `new Date(input).toISOString()`.
- The Inventários radio button was ignored (always the invoicing file);
  there was no store picker; the page's texts were looked up in the wrong
  namespace; `/reports` wasn't in the menu.
- Inventários and the accountant export were 30-line CSV placeholders (no
  stock at a date, no IVA per rate, no purchases).
- `docs/PLAN.md` doesn't exist; the plan is `docs/plans/ANGOLA.md`.

All of 8b was rebuilt (see below). `bf3534c`'s "Phase 4 preparation"
mentioned a migration "prepared"; there is none in the repo.

---

## Phase 8b: SAF-T (AO) and accountant exports

| # | Decision | Why |
|---|----------|-----|
| 1 | Export dates are `YYYY-MM-DD` calendar dates, read in the **store's** time zone (stores on UTC take the country's: Africa/Luanda). A file for the whole company uses the country's zone. Anything else (timestamps, 2026-02-30) is a 400. | The owner's requirement; the server's own zone must not matter (tested with the process in 5 zones). |
| 2 | `invoiceDate` (a DATE column, already the shop's day) is compared as a date; timestamps (purchases, stock movements) from local midnight of the start to local midnight after the end, exclusive. | Same answer for documents and for everything else; no 23:59:59 tricks. |
| 3 | Both dates or neither; neither = last month by the shop's clock (inventory: last 31 December). | The monthly file is the usual case. |
| 4 | A SAF-T file stays within one fiscal (calendar) year; the accountant export may span years. | Header has one FiscalYear; series restart per year. |
| 5 | Routes became `GET` downloads (`Content-Disposition`), replacing the `POST` ones that returned the file inside JSON. Web uses `apiClient.download`. | Binary Excel; same auth/refresh/error handling as every other call. |
| 6 | XSD validation in tests with `xmllint-wasm` (libxml2 in WASM, dev dependency, offline). | The plan asked for it; it found real bugs (see 9). |
| 7 | N's annulment wording (58 characters) is exported as "Anulada por não envio do documento ao adquirente" (48); I's fits (50). | SAF-T `Reason` holds 50; a hard cut read "…documento ao ad". |
| 8 | No file without the company NIF (10–15 characters) or with a currency other than AOA. | The XSD requires both; a wrong file is worse than a clear error. |
| 9 | `CustomerID`: Consumidor Final is always `CONSUMIDOR-FINAL`; other ids as stored (25 characters), a stable SHA-1 digest if longer than 30. | Old Consumidor Final rows have 35-character ids; the demo business's real file failed the XSD on them. |
| 10 | MasterFiles carry the customers and product codes the period's documents use (product code = the SKU on the line, as sold). | Keyrefs in the XSD; a later SKU change mustn't break the file. |
| 11 | Header software fields from env: `SAFT_PRODUCER_TAX_ID` (placeholder 999999999), `SAFT_PRODUCT_ID` ("POS/POS"), `SAFT_PRODUCT_VERSION` (0.2.3); `SoftwareValidationNumber` is `AGT_SOFTWARE_CERTIFICATE` when it looks like `NNN/AGT/AAAA`, else 0. | **Owner to fill in**: the producer's NIF and the registered product name. |
| 12 | Payment lines (`Payment`) only on FR; credit note refunds go to the accountant workbook. `Payments` (RC) is written by the builder and fed in phase 4. PurchaseInvoices waits for the supplier's document number/date/hash (phase 4/5). | What the documents actually are; no invented data. |
| 13 | Inventário (draft until Circular 05/2026): semicolon CSV, header row, dot decimals, CRLF, columns `ProductCategory;ProductCode;ProductDescription;ProductNumberCode;ClosingStockQuantity;UnitOfMeasure;ClosingStockValue;CostingMethod` (CMP). Stock = each store's last movement before local midnight after the date, summed per product; nothing held is left out; no stock = header only. | Portuguese inventory file's names and separator; swap the `InventoryFormat`, not the data, when the circular arrives. |
| 14 | Accountant export = real `.xlsx` (own ~200-line writer, no library), sheets Vendas / Compras / Recebimentos e pagamentos, Portuguese headers, base + IVA per rate (Cabinda separate), exempt base and codes, credit notes negative, annulled documents and cancelled purchases listed at 0, totals row. FT payment status "Por pagar" until phase 4. | Accountants in Angola work in Portuguese; Excel with real dates and number formats. Checked with openpyxl. |
| 15 | Reports page in the menu for owners and managers; managers export the whole business like the fiscal documents list allows. | Consistent with the existing fiscal list permissions. |
| 16 | Deadline reminders (Dashboard, Reports): monthly file from the 1st until 5 days after the 15th; inventory from 1 January until 5 days after 15 February; nothing once e-invoicing is active. | The country config's deadlines; no tracking of what was submitted. |
| 17 | `formatCalendarDate` for `YYYY-MM-DD` strings in the web (formats in UTC). | `formatDate("2026-10-15")` shows the 14th west of Greenwich. |

**Not done here, on purpose:** the always-on Docker API on :4000 (the
installed app's) was not rebuilt — it serves the installed v0.2.3 tills,
which phase 3+ already makes incompatible online; rebuilding it is the
owner's call with the 0.2.4 release. Desktop e2e ran against this branch's
API started from source on :4100 (`POS_TEST_API_URL`).

# Prompt 1c: third test report (items 14, 18, 26, 32–42)

Same ground rules as before:
- Confirm each problem in the current code first.
- Don't change numbering, signing or storage of issued fiscal documents without asking me.
- Keep offline selling working.
- Add strings in all locales.
- Write tests, and make one commit per item.
- Start in plan mode.
- Test the screens in the Windows till app as well as the browser, including a small touchscreen size (1024×768 and 1366×768).
- Open a PR, wait for CI, then merge.

### 1. Split payment layout breaks (tester #14 and #42)
The split-payment controls overflow the checkout panel: "Adicionar meio de pagamento", the payer count and "Dividir em partes iguais" are squeezed onto one line and cut off. Put "Split evenly" and the payer count on their own line. Make sure nothing overflows or gets clipped in Portuguese (longer labels) at 1024×768 and 1366×768, with 2 and 3 payment rows.

### 2. Sidebar on small screens (tester #33)
On small POS touchscreens (1024×768, 1280×800) the side menu must stay usable: it must not collapse into an unusable state or overlap the content. Check the back office and the till at those sizes and fix the layout.

### 3. "Back to POS" does nothing for accountants (tester #34)
Accountants have no till, so the "Back to POS" button is useless for them. Hide it for the ACCOUNTANT role, or send them back to their "Your clients" list instead.

### 4. Can't switch printing back from A4 to receipt (tester #35)
Once the print dialog switches to A4, there's no way back to the thermal receipt. Add a visible A4 / Receipt toggle in the print dialog that works both ways and remembers the choice per till.

### 5. Selling more than is in stock (tester #32)
Today the till only says "Insufficient stock for 'Chocolate'" at Charge time.
- Warn when an item is added or its quantity raised beyond the stock the till knows about, before checkout.
- Add a per-business setting "Allow selling without stock" (default: off for online sales).
- Add a per-till option to hide out-of-stock products from the product grid.

Offline sales still have to be accepted even if they take stock below zero (that's by design and flagged), so the setting only blocks at the till while it has current stock data.

### 6. Deleting a product that has stock (tester #36)
Before archiving or deleting a product with stock on hand in any store, show how much stock it has and ask for confirmation. Check how the tester could reach Delete on a product with stock, because delete is meant to be refused when the product has stock movements. If stock can exist without a movement (for example through product import), fix that path to record an opening movement.

### 7. Customer NIF on quotes (tester #38)
When a customer with a NIF is chosen, the quote shows their name, NIF and address, like the A4 invoice. Also let the cashier type a NIF for a one-off quote.

### 8. No negative prices (tester #39)
Reject negative or zero cost and sell prices in the product form and the API (zero sell price only with an explicit "free item" confirmation if you think it's needed; ask me). Validate the same in product import and in price changes at the till.

### 9. SKU suggested from the category (tester #40)
- Give each category an optional SKU prefix, for example "ELE".
- When adding a product in that category, pre-fill the SKU with the prefix + next number ("ELE-028"), which the user can overwrite.
- Keep the counter per business and category, safe against two people adding at once.
- Existing SKUs don't change.

### 10. Counting stock for many products (tester #41)
Saving the Inventory page row by row is too slow for a full stock count.
- Let the user edit many quantities and save them all at once ("Save all"), recorded as one stock count with a movement per changed product.
- Add an import from CSV/Excel (SKU or barcode + counted quantity), with a preview of the differences before applying.

### 11. Shift report from the back office (tester #18)
The shift report printed from the back office should match the one printed when the cashier closes the shift: the full list of sales in the shift (document number, time, method, total), the payment breakdown, cash count and difference, plus the product breakdown added earlier.

### 12. Internal sale numbers still showing (tester #26)
The tester's "Todas as vendas" printout still lists `MAIN-1792930259132`-style numbers. Check every place that still shows the internal number (shift reports, the "all sales" printout, exports) and show the fiscal number (FR …) instead, as already done in the receipt and recent-sales list.

## No code change needed
- #5: the demo now starts with sales, so the tester can't see a single sale's profit. The dashboard maths was confirmed earlier (4,780 − 1,600 = 3,180). If you want, add a `start-demo.bat empty` option that starts with no sales.
- #12: not tested yet.
- #27, #28, #29: waiting for the accountant and the AGT circular.

When done, give me the usual report: item, what changed, how to test it by hand.

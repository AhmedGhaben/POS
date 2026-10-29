# Prompt 1b: second batch from the test report (items 22–31)

Same monorepo and same ground rules as Prompt 1:
- Confirm each problem still exists in the current code first.
- Don't change numbering, signing or storage of issued fiscal documents without asking me.
- Keep offline selling working.
- Add strings in all locales (en, pt-PT, pt-BR, pt-AO).
- Write tests, and make one commit per item.
- Start in plan mode.

Each item was checked against the built v0.2.4 code. Items marked **Ask first** need my decision before you write code: tell me what you found and propose options.

### 1. Bank accounts (IBAN) never print (tester #23)
Found: Settings → Bank accounts saves accounts with `showOnQuotes` and `showOnInvoices`. The settings screen says they're "Printed on quotes and proformas (and on invoices if you choose)". But nothing outside the settings code reads them: the API doesn't put them in any document data, and no print template renders an IBAN.
Fix:
- When a proforma or invoice (FT, FR) is issued, copy the accounts to show into the document's seller snapshot: accounts with `showOnQuotes` for proformas, `showOnInvoices` for invoices. Issued documents must not change when settings change later.
- Quotes aren't stored documents, so they read the current settings at print time.
- Render a "Coordenadas bancárias" block (bank, account holder, IBAN in groups of four) on the A4 quote, proforma and invoice.
- Documents issued before this change print without the block.

Done when: add an account with both options on, then a quote, a proforma and an A4 Factura-Recibo each show it. Turn "Show on invoices" off: new invoices stop showing it, and invoices already issued don't change.

### 2. Quote price labels, and IVA rounding (tester #22)
What customers pay is correct. With "shelf prices include IVA" on, items priced 150 and 100 total 250 Kz, which is what the quote shows. The tester read the unit prices without IVA (131.57 and 87.71) as the selling price, because the quote's columns say "Preço unitário" and "Valor". The A4 invoice correctly says "Preço unit. s/ IVA" and "Valor s/ IVA".
Fix the labels: use "s/ IVA" on the quote like the invoice. When the store's prices include IVA, add a "Preço c/ IVA" column, so the customer recognises the shelf price.

**Ask first, rounding:** `taxCents` in the sale pricing rounds each line's IVA **up** (`Math.ceil`). So the quote reads "IVA 14% sobre 219,28 Kz = 30,72 Kz", while 14% of 219.28 is 30.70.
- Check whether AGT's SAF-T AO or e-invoicing rules require rounding up. Check also how AGT validates line tax (tolerance), since the e-invoicing service may reject mismatches.
- If nothing requires rounding up, propose standard rounding: net = round(gross ÷ (1 + rate), 2) half-up, tax = gross − net. It must be identical in the till (which signs offline), the API and any shared package, and apply to new documents only.
- Show me two worked examples before changing it.

### 3. Quotes are printed outside the fiscal series (found while checking #22). Ask first.
The POS "Print quote" button prints an "ORÇAMENTO" with an internal reference (`Q-MAIN-261025-2001`). The quote isn't stored, signed or numbered in a series. Yet the SAF-T exporter already lists `OR` (orçamento) as a working-document type next to `PF`.
If AGT expects quotes given to customers to be signed working documents included in SAF-T, they must be issued from a series like proformas. Tell me how the code handles OR today and what it would take. I'm confirming the rule with our accountant.

### 4. On-screen numeric keypad for touchscreens (tester #24)
Most Angolan POS PCs are small touchscreens, and the till has no on-screen keypad (only `inputMode` hints, which do nothing on Windows).
- Add a reusable numeric keypad (0–9, decimal comma, 00, backspace, clear, OK) that opens for: item quantity, price change, line and sale discounts, cash tendered, split-payment amounts, opening float, cash counts, and PIN entry.
- Add a per-till "Touch mode" setting that shows the keypad automatically and enlarges tap targets.
- Physical keyboards keep working as now.

### 5. Make the shift close easier to read (tester #25)
Not a calculation bug. Expected cash = float 0 + cash sales 9,270 = 9,270. The other 600 of the 9,870 total was paid by Multicaixa, so it isn't in the drawer. The tester counted 9,800, so the drawer has 530 more than expected, and "+530" is right. ("Faltará 70" on the printout is the note the tester typed.)
Make this obvious on the close-shift screen and the printed "Fecho de caixa":
- Show "Pagamentos que não estão na gaveta (Multicaixa/TPA, transferência…): 600 Kz" next to the expected cash.
- Show the difference live while the count is typed.
- Print the difference in words: "Sobra 530 Kz" or "Falta 70 Kz", next to the signed number.

### 6. Sales are listed by an internal number nobody recognises (tester #26)
Found: `receiptNumber` is the last 4 characters of the store id plus `Date.now()` in milliseconds, for example `MAIN-1792930259132`. The sales list, the shift report and the receipt ("Talão n.º") all show it. The number customers and AGT know is the fiscal one (`FR POS001-2026/57`).
- Show the fiscal document number as the main identifier in sales lists, the shift report and search results, with the internal number secondary (still searchable).
- Remove "Talão n.º" from customer receipts, or replace it with something short and human, for example store code + date + daily sequence for new sales.
- Keep the offline numbering scheme and the uniqueness rule intact.

### 7. SAF-T invoicing file "only has the company data" (tester #27)
Likely not a bug: the dashboard banner generates the **previous** month (September 2026), and every test sale was made in October.
- Verify it: with the demo data, export SAF-T facturação for October 2026 and confirm it contains the customers, products and the FR documents under SourceDocuments.
- Validate the file against the official SAF-T AO XSD (the repo already has `xmllint-wasm`). If October is also empty, find out why (series, store filter, timezone) and fix it.
- In the exports screen, show how many documents the chosen period contains before generating. Tell the user plainly when a period is empty.

### 8. Inventory file structure (tester #28). Needs AGT's circular.
Found: the inventory export (`apps/api/src/fiscal/saft/inventario.ts`) is explicitly a draft, `DRAFT_CSV`, with Portugal-style columns. AGT defined the official structure in **Circular n.º 05/GACA/GJ/DSF/AGT/2026**. Vendors report that XML, JSON or CSV are accepted, so CSV may be fine, but the columns, codes and order must match the circular exactly.
- I will put the circular PDF in `docs/agt/`. Implement its structure exactly, and say if anything in it is ambiguous.
- The file reports stock at 31 December of the previous year. The demo had no stock on 31/12/2025, which is why it was empty.
- Every company must submit even with no stock. Make sure an empty inventory still produces a valid file in the circular's format.

## No code change needed
- **#29:** our accountant will review the accounting screens.
- **#30:** transfers can be tested once "Add store" (Prompt 1, item 8) is done.
- **#31:** "Cancel payment" appears only where a supplier payment exists, and only the seeded demo supplier has one. Its payment date (11/01/2026) being before its purchase (25/10/2026) is a demo-seed oddity. Just make sure the demo seed never runs in production.

When done, give me a short report: item, what changed, how to test it by hand, and the open questions for the accountant.
9. Hide AI insights for now

The AI insights button gives an error because AI isn’t set up. Hide it everywhere it appears (dashboard, reports, anywhere else) behind a feature flag that is off by default. Use an environment variable such as AI_INSIGHTS_ENABLED=false, and have the API report it to the app. When the flag is off, the insights endpoint returns “not available” instead of trying to call the AI. Keep the code so we can turn it on later.
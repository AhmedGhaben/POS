# Accounting module ("Contabilidade"): plan, decisions, progress

<!-- SUMMARY: written at the end of the session -->

Source of the brief: the owner's `docs/accounting-module-prompt.md` (there is
no `docs/ACCOUNTING-PLAN.md` or `docs/PLAN.md` in the repo; the prompt file
is that plan). Built autonomously on branch `feature/accounting`; nothing
merged or deployed. Every decision below can be reversed; the ones to check
first are marked **REVIEW**.

---

## 1. Plan

### Order of work

Phase A, one commit per step, tests green at each:

1. **A1 Chart of accounts**: data model, default PGC template (Decreto 82/01), GR/GA/GM, customer/supplier/till/bank sub-accounts created automatically, screen.
2. **A2 Fiscal years and periods**: years with periods 0 (opening), 1–12, 13–15; close/reopen with audit.
3. **A3 Journals and entries**: journals with numbering per journal per year; entries with lines; database-enforced balance, immutability, period lock, movement-accounts-only.
4. **A4 Automatic posting (integração)**: account mapping, posting rules for every POS document, grouping option, integration monitor, no double posting.
5. **A5 Manual entries**: entry form, templates, reversal (estorno), opening balances (entry or CSV).
6. **A6 Reports**: Balancete, Razão, Diário, customer/supplier statements with ageing, Balanço, Demonstração de Resultados, IVA working papers; PDF and Excel.
7. **A7 Year-end**: apuramento de resultados (type A), close the year, carry balances forward.
8. **A8 SAF-T (AO) Contabilidade**: annual integrated file (TaxAccountingBasis "I"), XSD-validated, pre-export check, TransactionID in the invoicing file, 10 April deadline.

Then **A9 SAF-T Aquisição de Bens e Serviços** (monthly purchases file).

Phase B: **B1** accountant role and access to several companies, **B2**
document archive (ZIP) and attachments, **B3** bank reconciliation, **B4**
fixed assets and depreciation.

Not built (later, as the brief says): analytic accounting (AR/AA/AM),
payroll, Imposto Industrial / IVA annex / Imposto de Selo maps, cash-flow
statement.

### Data model (Prisma, `apps/api/prisma/schema.prisma`)

| Table | What |
|---|---|
| `ledger_accounts` | Chart of accounts per business: `code` (SAF-T AccountID, e.g. `31.1.2.1.0001`), `name`, `category` (GR/GA/GM; AR/AA/AM reserved), `parentId` (GroupingCode), `classNo` (1–8), `isActive`, `link` (CUSTOMER/SUPPLIER/TILL/BANK + id, for the automatic sub-accounts), `fromTemplate`. |
| `fiscal_years` | One per business and year: start/end dates, status OPEN/CLOSED. |
| `accounting_periods` | Periods 0 (opening), 1–12 (months), 13–15 (year-end) per year: status OPEN/CLOSED, who and when. |
| `journals` | Diários: `code` (SAF-T JournalID), name, kind (SALES, PURCHASES, CASH, BANK, GENERAL, OPENING, CLOSING, PAYROLL). |
| `journal_counters` | Next number per journal per year (gap-free, like document series). |
| `journal_entries` | Lançamentos: journal, year, period, number, `docArchivalNumber`, `transactionId` (SAF-T key), transaction date (document date), posting date (GLPostingDate), description, type N/R/A/J, SourceID (user), customer/supplier, origin (MANUAL, AUTO, OPENING, CARRY_FORWARD, YEAR_END, REVERSAL, …), `reversesEntryId` (an estorno points at what it reverses), totals. |
| `journal_entry_lines` | Debit or credit line: account, amount, description, SourceDocumentID. |
| `accounting_settings` | Per business: on/off, integration start date, grouping (per document / daily summary per till), cash per till, automatic run, monthly purchases file rule. |
| `account_mappings` | Integration mapping: key (e.g. `sales.goods.14`, `payment.CARD`, `expense.RENT`) → account. Missing rows use the template's default account. |
| `accounting_source_links` | One row per POS document dealt with (posted or skipped): unique (business, source type, source id) so **nothing is posted twice**; points to its entry. |
| `accounting_integration_errors` | Why a document couldn't be posted (missing mapping, closed period…), for the monitor. |
| `entry_templates` | Lançamentos pré-definidos. |

Database rules (triggers in the migration, not only the API):
- an entry's lines must balance and have at least one debit and one credit
  line (deferred constraint trigger, checked at commit);
- a line is either a debit or a credit, never both, never negative (CHECK);
- entries and lines can't be updated or deleted;
- no entry in a closed period or closed year;
- lines only on active movement (GM) accounts of the same business.

---

## 2. Decisions

### Chart of accounts and codes

| # | Decision | Why |
|---|----------|-----|
| 1 | **Codes use the PGC's dotted form**: first-degree accounts are two digits (`11`, `31`, `45`), then `31.1`, `31.1.2`, `31.1.2.1`… The SAF-T AccountID allows dots. | The way Decreto 82/01 writes them. |
| 2 | **Classes (1–8) are not exported as accounts**; first-degree accounts are GR. Decreto Executivo 317/20, 2.1: "não devem ser exportados registos das classes de contas". | The decree. |
| 3 | Category is worked out from the tree: no parent → GR; has children → GA; leaf → GM. Only GM accounts take postings (database rule). Adding a sub-account under a GM account turns it into GA, only if it has no movements. | The brief; XSD. |
| 4 | The default template is the PGC classes 1–8 with the sub-accounts a retail business needs, **marked "to be validated by an accountant"** on screen. **REVIEW** the IVA sub-accounts (34.5.x) and the expense accounts (75.2.x). | The brief. |
| 5 | Customer accounts under `31.1.2.1` (Clientes – não grupo – nacionais; `31.1.2.2` foreign), supplier accounts under `32.1.2.1` / `32.1.2.2`, numbered `.0001`, `.0002`… Created automatically when accounting is switched on and at every integration run, for every customer (except Consumidor Final) and supplier. | So SAF-T Customer/Supplier AccountID is filled; Consumidor Final sells for cash (FR) and has no account ("Desconhecido"). |
| 6 | One cash account per till (`45.1.2`, `45.1.3`…) plus `45.1.1` Caixa principal (browser sales, expenses, supplier payments in cash, cash taken out of tills); one bank account per bank account in Settings (`43.1.1`, `43.1.2`…). Setting "Caixa por terminal" can be turned off (all cash in `45.1.1`). | The brief: cash per till, bank per bank account. |

### Integration (automatic posting)

| # | Decision | Why |
|---|----------|-----|
| 7 | **Pull, not push**: the integration reads POS records not yet linked and posts them; it never runs inside a sale. It runs every 10 minutes (setting), on "Integrar agora", and before closing a period or exporting SAF-T. | The till stays fast and offline-safe; a broken mapping never blocks a sale; the monitor sees everything not yet posted. |
| 8 | **No double posting**: unique (business, source type, source id) in `accounting_source_links`, written in the same transaction as the entry. | The brief. |
| 9 | Integration starts at a date chosen when accounting is switched on (default: 1 January of this year). Earlier documents are covered by the opening balances. | A new client doesn't want years of history re-posted. |
| 10 | The period is the month of the document's date (invoiceDate / supplier document date / payment date). A closed period → the document waits in the monitor with the error "period closed". | Period lock. |
| 11 | Sales are credited **before discounts** to the sales account by product type (goods 61.3.x / services 62.1.x) and IVA rate (or exemption), and the discount is debited to 61.8 Descontos e abatimentos; IVA by rate to 34.5.3.x. | The brief lists discounts as a mapping. **REVIEW**: some accountants prefer net sales. |
| 12 | FR (cash sale): payment accounts by method / sales / IVA; no customer account. FT: customer account. RC: payment accounts / customer. NC: 61.7 Devoluções + IVA at the same rate (mapping `iva.nc.*`, by default the IVA liquidado account; point it at 34.5.4.1 to keep credit notes apart) / the refund's payment account, or the customer's account for what lowered their debt. ND like FT. Proformas and quotes are never posted. | Standard retail postings. |
| 13 | **Cost of goods sold** is posted with each sale (71.2 / 26.1) at the weighted average cost recorded on the stock movements (SALE, RETURN); stock purchases go straight to 26.1 (perpetual inventory, no 21 Compras). | The app keeps a perpetual weighted average already. **REVIEW** if you want 21 Compras. |
| 14 | An annulled document never posted is skipped; one already posted gets an exact reversal entry (lines swapped). Same for cancelled supplier payments. | Entries are immutable; corrections by reversal. |
| 15 | Purchases: stock (tracked products) or 75.2.9 (services, untracked); deductible IVA by type (MFI/INV/OBC/SERV/IMPT/SCE) to 34.5.2.x; non-deductible IVA to 75.3.1; supplier account for the total less IVA cativo, IVA cativo to 34.5.6.2. | |
| 16 | Expenses (no payment method in the app) are paid from Caixa principal; cash in/out during a shift moves money between the till's cash and Caixa principal; shift differences go to 68.8.1 Sobras / 78.8.1 Quebras de caixa; stock count adjustments to 68.3.1 / 78.3.1; transfers between stores aren't posted (one stock account). | **REVIEW** 16: expenses paid by bank need a manual entry or a mapping change. |
| 17 | "Resumo diário por terminal": one entry per till (or store, for browser sales) per day for FR, NC and RC, lines summed per account; only for days already over. FT, purchases and the rest are always one entry per document (they need the customer/supplier). | The brief's grouping option. |

### Periods, entries, year-end, SAF-T

| # | Decision | Why |
|---|----------|-----|
| 18 | Periods: 0 opening, 1–12 months, 13 regularizações, 14 apuramento de resultados, 15 resultado líquido. Period 0 entries are never exported (SAF-T: opening movements only show as opening balances). | XSD Period 1–16; decree 3.4.3.2. |
| 19 | TransactionID = `TransactionDate JournalID DocArchivalNumber` (decree 3.4.3.1, XSD pattern); DocArchivalNumber = `YYYY/N` (the entry's number in its journal and year). | |
| 20 | Apuramento (type A): period 14 closes classes 6 and 7 into 82–86 by nature (operational, financial, subsidiaries, non-operational, extraordinary); period 15 closes 82–87 into 88. Closing the year doesn't zero the balance-sheet accounts (that would make the SAF-T closing balances zero); it copies them into the next year's opening entry (period 0, journal Abertura). Reopening a year reverses that opening entry. | PGC; SAF-T closing balances. |
| 21 | Who: the owner (and, from phase B, the accountant role) does accounting; managers can only read the reports. Reopening a period or a year: owner or accountant, audit-logged. | Before phase B there's no accountant role; the owner is the one who answers for the books. |
| 22 | SAF-T Contabilidade = integrated file ("I"): chart with opening and closing balances, entries (periods 1–15), and the invoicing source documents with their TransactionID; TaxEntity "Sede". Pre-export check blocks on unposted documents of the year and unbalanced totals; open periods block unless "draft" is ticked (for a trial run before year-end). | The brief; XSD. |
| 23b | Balanço: loans (33) are shown as non-current and accounts of classes 31-37 go to assets or liabilities by the sign of each account's balance; the year's result is classes 6, 7 and 82-88, so it's right before and after the apuramento. Demonstração de resultados leaves out the apuramento entries (type A). **REVIEW** the line layout against the official model your accountant uses. | Decreto 82/01 model, simplified. |
| 23 | Reports: PDF made in the app (jsPDF, as the dashboard) and Excel made by the server (same writer as the accountant export); dates DD/MM/YYYY, SAF-T ISO. | |

### Phase B decisions

| # | Decision | Why |
|---|----------|-----|
| B1a | An accountant is a user with role ACCOUNTANT; their own record sits in the company that first invited them; access to each company is a row in `accountant_access` (revoked, never deleted). The access token names the company being worked in; refresh keeps it; every request checks the access still stands. | One login for several companies without changing how staff logins work. |
| B1b | An accountant reads whatever a manager may read (GET) and changes nothing outside `/accounting`, their sign-in and profile. Only the owner invites or removes accountants. | The brief: full accounting rights, read-only sales/purchases/stock, no POS operations or PINs. |
| B2a | The archive's PDFs are archive copies made by the server (text, A4: seller, buyer, lines, totals, hash characters, "Cópia de arquivo"), not pixel copies of what the till prints (no logo, no QR). The JSON body limit went from 1 MB to 8 MB for the uploads. | A server-side copy of every document for the ZIP without a browser; **REVIEW** if the archive must hold the printed layout. |
| B2b | Attachments live in the database (like logos and product photos) until object storage exists. | Same as the rest of the app; fine for scans of a few hundred KB. |
| B1c | An existing accountant invited by another company gets no email; the company just appears in their client list. | No password to set. **REVIEW** if you want a notice. |

### Open questions answered by me (**REVIEW**)

| # | Question | What I did |
|---|----------|------------|
| Q1 | Is the monthly SAF-T "Aquisição de Bens e Serviços" file still required once AGT e-invoicing is active? | Built it. Setting "Ficheiro mensal de aquisições": **Automático** (default: reminded monthly only while e-invoicing is off, like the invoicing file), Sempre, Nunca. |
| Q2 | Does a revised PGC apply? | Shipped Decreto 82/01's structure (with the IVA accounts 34.5.x added since 2019); every account is editable and the template is marked "to be validated by an accountant". |
| Q3 | Posting rules | As in decisions 11–17; every account used is a mapping the accountant can change in Contabilidade → Configuração. |

---

## 3. Progress

| Step | Commit | What | Tests |
|---|---|---|---|
| A1 | `see git log` | Chart of accounts: PGC template, GR/GA/GM from the tree, automatic customer/supplier/till/bank accounts, add/rename/deactivate/remove rules, screen. | unit (chart), e2e 6 |
| A2 | | Years and periods 0-15, close/reopen with reason (audit log), screen. | unit (periods), e2e 3 |
| A3 | | Journals (VEN, COM, CXA, BCO, OPD, ABE, APU, SAL), entries numbered per journal and year, TransactionID; database rules (balance, both sides, immutable, closed period, GM only); estorno; entries screen with the entry form. | unit (entry rules), e2e 7 |
| A5 | | Lançamentos pré-definidos (save from the entry form, use, remove), opening balances (CSV or pasted: code; debit; credit → one entry in Abertura, period 0, 1 January). | unit (CSV), e2e 2 |
| A6 | | Reports from the posted entries: Balancete (opening, period, accumulated, balance; by level), Razão (running balance), Diário, customer/supplier statements, ageing (open invoices/purchases by days), Balanço and Demonstração de Resultados (PGC, result shown before and after the apuramento), IVA working papers (charged by rate/exemption, deductible by type, cativo, 7% simplified, IVA accounts). PDF in the app (documents' language), Excel from the server (Portuguese headings). | unit (statements 4), e2e 7 |
| A7 | | Year-end: apuramento (period 14: classes 6/7 → 82-86; period 15: 82-87 → 88; type A, journal APU), year close (months must be closed, results worked out; balances of classes 1-5 and 8 carried into next year's period 0; all periods closed), year reopen (reason, audit log; the carry-forward is reversed). Entries in periods 0 and 13-15 are reversed in their own period. | unit (year-end 3), e2e 4 |
| A8 | | SAF-T (AO) Contabilidade, TaxAccountingBasis I, TaxEntity Sede: every account (classes left out) with opening (period 0) and closing debit/credit balances, aggregating accounts showing debit and credit sub-balances; entries of periods 1-15 by journal (debit lines first); invoices, working documents and receipts with the TransactionID they were posted in; customer/supplier AccountID from the chart. The monthly invoicing file now carries TransactionID and AccountID too. Pre-export check (NIF, AOA, unposted, balance, open periods unless draft, results not worked out = warning, movement accounts with sub-accounts). Deadline reminders: accounting file by 10 April (when accounting is on), purchases file monthly (by its setting). | unit (XSD 2), e2e 3 (both files validated against the XSD) |
| A9 | | SAF-T (AO) Aquisição de Bens e Serviços (TaxAccountingBasis A): suppliers (with AccountID), tax table and the period's purchases with the supplier's document (deductible IVA by type, IVA cativo); Reports → Files → SAF-T type "Aquisição"; monthly reminder by the setting (Q1). | unit (XSD 1), e2e 1 |
| B1 | | Accountant role: invited by the owner by email (new login: password from the email; existing accountant: the company is added to their clients, no email); one login for several companies, switch from "Your clients" (status per client: not posted, errors, months open, last year's SAF-T); full rights in Contabilidade, read-only wherever managers read, no sales/purchases/stock/staff/PIN changes and no till (AccountantGuard + RolesGuard); OCPCA number on the user, printed on report PDFs; revoking stops that company's sessions at once. | unit (guard, JWT), e2e 4 |
| B2 | | Attachments (PDF/JPEG/PNG/WebP, 5 MB) on purchases, expenses and entries, kept in the database; document archive ZIP for a period: every fiscal document as a PDF archive copy (made by the server), the SAF-T invoicing and purchases files, the attachments, an index (CSV). | unit (PDF 2), e2e 2 |
| A4 | | Automatic posting of FR/FT/ND/NC/RC, annulments, purchases, supplier payments (and cancellations), expenses, shift differences, cash in/out, stock counts; mapping with defaults; daily summary option; monitor; month close refused while records of it aren't posted. | unit (posting rules 9), e2e 12 |

**Found while testing (A3)**: Prisma doesn't report a failed COMMIT of an
interactive transaction: when the database's deferred balance check
refused an entry at commit, Prisma resolved as if it had been saved (the
data was rolled back). `EntriesService.post` and the integration now run
`SET CONSTRAINTS … IMMEDIATE` before leaving the transaction, so a breach
is an error at once, then set the constraints back to DEFERRED (found in A7:
left IMMEDIATE, the next entry in the same transaction failed before its
lines were in). The database rule still guards any other writer.

**Also changed (A7)**: the API's error filter now logs unexpected errors
(500s) with their stack; before, they were answered and lost.

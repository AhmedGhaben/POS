Add an accounting section ("Contabilidade") to the POS platform so our clients (and their accountants) can keep the books in our app and produce the SAF-T (AO) accounting file. Read docs/PLAN.md, docs/DECISIONS.md and docs/saft-ao/ first. Explore the existing sales, purchases, payments, expenses, cash drawer and SAF-T export code before planning.

## Legal basis (Angola)
- Decreto Presidencial 312/18 (Regime Jurídico de Submissão Electrónica dos Elementos Contabilísticos) covers invoicing, accounting and inventory. It applies to taxpayers with turnover or imports above Kz 50 000 000; certified micro-companies are excluded.
  - Art. 3: a monthly SAF-T "Facturação" file and a monthly SAF-T "Aquisição de Bens e Serviços" (purchases) file, for the previous month, due by the last day of the following month. AGT can also request accounting data at any time.
- Decreto Presidencial 71/25 (new Regime Jurídico das Facturas): the SAF-T (AO) Contabilidade file for the previous year is mandatory, due by 10 April each year. The inventory file is due by 15 February.
- Decreto Executivo 317/20 (docs/saft-ao/legislation/decreto-317-20.pdf, has text): field-by-field rules for the SAF-T data structure, including GeneralLedgerAccounts and GeneralLedgerEntries.
- XSD: docs/saft-ao/xsd/SAFTAO1.01_01.xsd. TaxAccountingBasis "C" (accounting only) or "I" (accounting integrated with invoicing). Since we hold both, the target is "I".
- Chart of accounts: Plano Geral de Contabilidade (PGC), Decreto 82/01. Classes:
  - 1 Meios fixos e investimentos
  - 2 Existências
  - 3 Terceiros
  - 4 Meios monetários
  - 5 Capital e reservas
  - 6 Proveitos e ganhos por natureza
  - 7 Custos e perdas por natureza
  - 8 Resultados
- Depreciation: Decreto Presidencial 207/15 (Regime das Reintegrações e Amortizações), maximum rates per asset type.
- CONFIRM with me: whether the monthly "Aquisição" file is still required for clients once AGT e-invoicing is active, and whether a revised PGC applies to our clients. I'll check with an accountant.

## Features — Phase A (MVP: the books + SAF-T Contabilidade)
1. Chart of accounts
   - Ship a default PGC template (classes 1–8 with standard sub-accounts), marked "to be validated by an accountant".
   - Accountant can add/edit/deactivate accounts, but can't delete accounts with movements.
   - Each account has a GroupingCategory (GR = 1st level, GA = aggregating, GM = movement account; AR/AA/AM for analytic) and a GroupingCode (parent), exactly as the XSD requires. Only GM accounts can receive postings.
   - Customer and supplier sub-accounts (e.g. under 31 Clientes / 32 Fornecedores) are created automatically per customer/supplier, so the SAF-T Customer/Supplier AccountID is filled. If there's no account, the SAF-T value is "Desconhecido" (per the XSD).
2. Fiscal years and periods
   - Fiscal year with periods 1–12, plus closing periods (13–15) for year-end adjustments.
   - Open/close a period. A closed period is locked: no new postings. Reopening needs the accountant role and is audit-logged.
3. Journals (Diários): sales, purchases, cash, bank, operations/various, opening, closing, salaries (for manual entries later). Each has a JournalID and a sequential numbering per journal per year.
4. Automatic posting from the POS (integração), the core value:
   - Configurable account mapping per company: sales by IVA rate/exemption, IVA liquidado, IVA dedutível, customers, suppliers, cash per till, bank per bank account, each payment method, discounts, returns/credit notes, stock (mercadorias), cost of goods sold (CMVMC at weighted average cost), cash over/short from shift closes, expenses by expense category.
   - Generate journal entries for: invoices/FR/NC/ND, receipts, purchases and supplier payments, expenses, shift close cash differences, stock adjustments.
   - Grouping option: one entry per document, or a daily summary per till.
   - An "Integration monitor" screen: documents not yet posted, postings with errors (missing mapping), re-run integration. A document can't be posted twice. Every entry links back to its source document (SourceDocumentID in the XSD).
5. Manual journal entries
   - Debit/credit lines; must balance before saving. Description, document date, posting date, period, TransactionType (N normal, R regularização, A apuramento de resultados, J ajustamento).
   - Reusable templates ("lançamentos pré-definidos") for recurring entries (rent, salaries, bank fees).
   - Posted entries are immutable. Corrections are made with a reversing entry (estorno). Full audit trail.
6. Opening balances: import/enter the opening balance per account for a new client or new year, in a dedicated opening journal.
7. Reports (PDF + Excel, DD/MM/YYYY):
   - Balancete (trial balance) by period/range, with account level selectable
   - Razão (general ledger per account) and Diário (journal listing)
   - Extracto de conta corrente de clientes/fornecedores, with ageing
   - Balanço and Demonstração de Resultados in PGC format
   - IVA report per period (liquidado vs dedutível, by rate and exemption code, Regime Simplificado 7% on turnover) as working papers for the IVA declaration
8. Year-end
   - Apuramento de resultados: close classes 6 and 7 into class 8 automatically, as an "A" TransactionType entry
   - Close the year and carry balances forward to the opening entry of the new year
9. SAF-T (AO) Contabilidade export
   - Annual file for the previous year (deadline 10 April), TaxAccountingBasis "I"
   - MasterFiles/GeneralLedgerAccounts: ALL accounts including aggregating ones down to the ledger accounts, with opening/closing debit and credit balances
   - GeneralLedgerEntries: NumberOfEntries, TotalDebit, TotalCredit, Journals → Transactions (TransactionID, Period, TransactionDate, SourceID = user, Description, DocArchivalNumber, TransactionType, GLPostingDate, CustomerID/SupplierID) → Lines (RecordID, AccountID, SourceDocumentID, SystemEntryDate to the second, DebitAmount/CreditAmount)
   - Transaction IDs must follow the format rule in Decreto Executivo 317/20 §3.4.3.1, and sales documents in SourceDocuments must reference the TransactionID they were posted in (§4.1.4.13), so invoicing and accounting are linked.
   - Validate against the XSD in tests. Pre-export check: totals balance, no unposted documents, all periods closed, no account without GroupingCategory.
   - Add the 10 April deadline to the dashboard deadline reminders.
10. SAF-T "Aquisição de Bens e Serviços" (purchases) monthly export from our purchase records, if I confirm it's still required: supplier NIF, supplier invoice number/date, taxable base, IVA by rate, deductible type ("MFI", "INV", "OBC", "SERV", "IMPT", "SCE" per the XSD), IVA cativo if any.

## Features — Phase B (accountant workflow)
11. Accountant access: an "Accountant" role that can be invited by email to one or more client companies.
    - One login, switch between clients, a dashboard listing all clients with deadlines and status (unposted docs, open periods, SAF-T files due).
    - Permissions: full accounting rights, read-only access to sales/purchases/stock, no access to POS operations or employee PINs.
    - Store the accountant's OCPCA (Ordem dos Contabilistas e Peritos Contabilistas de Angola) number; print it on financial statements.
12. Document archive: download all fiscal documents (PDF) and SAF-T files for a period as a ZIP; attach scanned supplier invoices/receipts to purchases and expenses.
13. Bank reconciliation: import bank statements (CSV/Excel; Angolan banks don't share one format, so use a column-mapping import), match against bank postings, create entries for bank fees and interest.
14. Fixed assets (Imobilizado): asset register, acquisition, depreciation by Decreto 207/15 rates, monthly automatic depreciation entries, disposal.

## Later (note in plan, don't build)
- Analytic accounting (cost centres: AR/AA/AM accounts)
- Payroll (IRT, INSS) and integration of salaries
- Imposto Industrial annual declaration maps, IVA declaration annexes, Imposto de Selo maps
- Cash-flow statement

## Rules
- Accounting entries are immutable; corrections only by reversal. Every action is audit-logged with user and timestamp.
- Money in integer minor units or decimal type, never floats. Every entry must balance, enforced in the database, not only the UI.
- All dates DD/MM/YYYY in the UI; ISO in SAF-T.
- Tests: balancing, period lock, no double posting, POS-to-journal mapping for each document type, year-end close, SAF-T Contabilidade XSD validation and debit/credit totals.

Start by exploring and giving me a plan with the data model (accounts, fiscal years/periods, journals, entries, lines, mappings, accountant access) and the order of work. Wait for my OK before implementing.

# Expenses with a "to pay" status: what accounting would need

Today an expense counts as **paid when it is logged**. The integration posts
one entry: debit the expense account for its category (`expense.<CATEGORY>`,
for example 75.2.1 Rendas), credit `expense.paidFrom` (45.1.1 Caixa by
default). Cancelling an expense that is already posted reverses that entry
(`EXPENSE_CANCEL`). This note lists what an unpaid, "to pay" expense would
need. Nothing here is built.

## 1. Two events instead of one

| Event | Entry |
|---|---|
| Expense recognised (the bill arrives) | D expense account / C a payable account |
| Expense paid (once or in parts) | D the payable account / C cash or bank, by payment method |

Without the split, an unpaid bill either disappears from the books until it
is paid, or shows money leaving the till that never left.

## 2. Where the payable sits

- **The bill comes from a known supplier** (electricity company, landlord):
  credit that supplier's own account (32.1.x, already created per supplier by
  `chart.service.ts`). The bill then shows in the supplier's balance and
  statement, and can be paid with the existing supplier-payment screen and
  allocations, like a purchase. This is the better choice, and it needs
  `Expense.supplierId` (optional).
- **No supplier**: a general creditors account (37.9.2 "Outros
  credores"), with a new mapping key such as `expense.payable` in
  `mapping.ts`.

## 3. Data model

- `Expense.status`: `PAID` (today's behaviour, and the default for existing
  rows) or `TO_PAY`, plus `dueDate`, `supplierId?`, and the supplier's
  document number and date if it should appear in SAF-T purchases.
- Payments: the best fit is to extend `SupplierPaymentAllocation` so a
  payment can be allocated to an expense as well as to a purchase. A
  separate `ExpensePayment` table would duplicate the cancel and estorno
  logic that supplier payments already have.
- A paid amount derived from live allocations, as `refreshPaid` already does
  for purchases.

## 4. Posting rules (`posting-rules.ts` and `integration.service.ts`)

- `expensePlan` credits `expense.payable` or the supplier account when the
  status is `TO_PAY`. A `PAID` expense posts exactly as today.
- Payments of expenses go through `supplierPaymentPlan` unchanged when they
  are allocated through supplier payments.
- **Cancelling**: an expense with live payments can't be cancelled until its
  payments are cancelled (otherwise the payable goes negative). A cancelled
  to-pay expense that was posted is reversed through `EXPENSE_CANCEL`, as
  today.
- **Changing the status after posting** (`TO_PAY` → `PAID` by editing): don't
  allow it. Paying is a payment, not an edit.

## 5. IVA

Today expenses carry no IVA. If a to-pay bill is a supplier invoice with
deductible IVA, it is really a non-stock purchase (`purchases.nonStock` plus
`iva.dedutivel.*`). Recording those bills as purchases may be simpler than
giving expenses IVA, since purchases already have tax lines, withholding
(IVA cativo), the supplier document and the SAF-T purchases file.

## 6. Reports and screens

- An "Expenses to pay" filter and total, with overdue ones highlighted by
  `dueDate`.
- The supplier statement and the supplier balances report include the
  bills.
- The cash-basis figures (shift reports, cash out of the till) only count
  payments, not the bills themselves.

## Suggested order

1. Decide whether supplier bills with IVA go through Purchases (no expense
   change needed) or Expenses.
2. Add `status`, `dueDate` and `supplierId` to Expense, with `PAID` as the
   default for existing rows.
3. Add the payable mapping key and the posting rule change.
4. Allow supplier payments to allocate to expenses.
5. Update the screens and reports.

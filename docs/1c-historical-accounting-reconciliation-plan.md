# Read-only historical accounting reconciliation plan

Status: planning only. No existing production or demo database has been
accessed. The timezone correction (`ffae264`) fixes future query evaluation;
it does not rewrite historical journals, source links or fiscal documents.

## Access and execution boundaries

1. Obtain separate authorization identifying the businesses, time range,
   approved replica/snapshot and read-only credentials. Prefer a consistent
   replica or already approved snapshot. No backup/export or connection to
   existing books is authorized by this document.
2. Use a database role with SELECT privileges only and a repeatable-read,
   read-only transaction. Bound query duration and report size. Query one
   business and period at a time; use existing indexes. Record snapshot time,
   code version and the business-country timezone used by the books.
3. Example session envelope, for future authorized execution only:

   ```sql
   BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
   SET LOCAL TIME ZONE 'UTC';
   SET LOCAL statement_timeout = '30s';
   -- Parameterized SELECT statements only.
   ROLLBACK;
   ```

   Current `SHOW TimeZone` cannot prove the timezone of historical sessions.
   Review approved deployment configuration/log evidence for past settings,
   connection overrides, accounting grouping changes and enable/start dates.
   If the history is unknown, inspect the full period since accounting began.
4. Do not invoke integration/run, period close/reopen, export operations that
   post records, or any repair endpoints. Do not modify settings, fiscal dates,
   numbering, signatures, issued document storage, ledger entries or links.
   Do not use cleanup privileges/triggers, temp-table writes or UPDATE scripts.

## Establish the intended calendar

- Books and summary eligibility follow the business-country clock: Angola
  uses Africa/Luanda. Preserve the application's existing policy for explicit
  store overrides; document dates already stored as DATE remain authoritative.
- Compare DATE columns with validated `YYYY-MM-DD` strings cast to DATE.
  UTC-naive timestamps require explicit UTC interpretation and then the
  intended local timezone. Use inclusive starts and exclusive next-day ends.
- Purchases with a supplier document date retain that date for IVA. Otherwise
  use createdAt converted from UTC to the business calendar. Record store
  overrides separately: transaction dates can intentionally differ from the
  books' eligibility/range calendar. Never label that difference alone a bug.

## Reconciliation checks (SELECT only)

| Check | Evidence and interpretation |
|---|---|
| Premature daily posting | For FR/NC/RC source links, compare journal createdAt (interpreted as UTC) with the next midnight after invoiceDate on the business clock. Restrict to periods known to use DAILY_SUMMARY. Posting during the same business day is a candidate; current grouping settings alone do not establish historical grouping. |
| Partial summaries | Group source documents and linked journal entries by business/store/till/invoiceDate; compare source sums and linked lines. Several entries for one day are candidates, not automatic defects: delayed offline arrivals and separate reversals can legitimately add entries. Preserve their original source IDs and creation times. |
| Missing start-day records | Look for unlinked eligible fiscal documents and supplier payments dated exactly on the integration start date. Check timestamp sources around the business-local start instant, including the offset-sized hours before/after it. Exclude genuinely pre-start activity already covered by opening balances. |
| Missing first/last-day records | Recompute eligible unlinked counts at both period edges for fiscal documents, payments, purchases, expenses, shifts, cash movements and stock adjustments. Distinguish today's waiting summaries, mapping errors, cancellations and late offline uploads from omissions. |
| IVA boundary totals | Independently total source tax lines on the first/last day, month and year using the corrected calendar predicates and purchase fallback. Apply NC signs and existing exemption/cativo/deductibility rules without changing rounding. Compare source totals with saved/exported report evidence, if available. A report generated today cannot alone prove what a historical report showed. |
| Closed periods | Flag closed periods with eligible unlinked records or documented report discrepancies. Do not reopen them. Include current integration errors and historical close/reopen audit evidence. |
| Posting dates and periods | Compare entry transaction/posting dates, fiscal year and period with the relevant source rule; distinguish supplier dates, store-local timestamp dates, reversals and periods 0/13/14/15. Do not assume every transaction date must equal its posting date. |
| Stock and costs | Reconcile stock-related accounting against recorded movement quantities/unit costs and source snapshots, not today's product cost or stock. Flag mapping differences separately from timezone selection differences. |
| Duplication and balance | Check source-link uniqueness, linked entry existence, debit/credit equality and expected reversal relationships. Identify documents by ID plus business/series context; document number alone is not globally unique. |

Retain the original source totals, linked totals and difference separately.
Do not infer lost revenue from a split summary: the original links may still
cover every document exactly once. Do not count pending proformas/quotes as
missing accounting postings.

## Deliverables and review gate

Produce an aggregate matrix per business/month with: exposure confidence,
clock/config evidence, candidate counts, source/link/entry IDs, amount
reconciliation, affected closed periods, and explanation/false-positive state.
Minimize personal information; never include credentials, signing keys or
unnecessary buyer details. Store any approved report only in the agreed
restricted location, with its snapshot timestamp and reproducible query
parameters.

An accountant reviews each candidate and separates reporting-only issues,
missing postings, valid delayed arrivals and actual ledger corrections.
Prepare a proposed correction plan as a separate task, including expected
journal effects and validation. It requires explicit approval before any
integration rerun, period change, reversal or other write. Issued fiscal
numbers, dates and signatures remain immutable throughout.

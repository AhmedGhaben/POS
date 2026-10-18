-- CreateEnum
CREATE TYPE "JournalKind" AS ENUM ('SALES', 'PURCHASES', 'CASH', 'BANK', 'GENERAL', 'OPENING', 'CLOSING', 'PAYROLL');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('N', 'R', 'A', 'J');

-- CreateTable
CREATE TABLE "journals" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "JournalKind" NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_counters" (
    "journalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "journal_counters_pkey" PRIMARY KEY ("journalId","year")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "docArchivalNumber" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionDate" DATE NOT NULL,
    "postingDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL DEFAULT 'N',
    "sourceUserId" TEXT NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "origin" TEXT NOT NULL,
    "reversesEntryId" TEXT,
    "totalDebit" DECIMAL(16,2) NOT NULL,
    "totalCredit" DECIMAL(16,2) NOT NULL,
    "systemEntryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "sourceDocumentId" TEXT,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journals_businessId_code_key" ON "journals"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversesEntryId_key" ON "journal_entries"("reversesEntryId");

-- CreateIndex
CREATE INDEX "journal_entries_businessId_year_period_idx" ON "journal_entries"("businessId", "year", "period");

-- CreateIndex
CREATE INDEX "journal_entries_businessId_postingDate_idx" ON "journal_entries"("businessId", "postingDate");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_journalId_year_number_key" ON "journal_entries"("journalId", "year", "number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_businessId_transactionId_key" ON "journal_entries"("businessId", "transactionId");

-- CreateIndex
CREATE INDEX "journal_entry_lines_accountId_idx" ON "journal_entry_lines"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_lines_entryId_lineNumber_key" ON "journal_entry_lines"("entryId", "lineNumber");

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_counters" ADD CONSTRAINT "journal_counters_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The books' rules, enforced by the database (docs/ACCOUNTING-DECISIONS.md):
-- lines are a debit or a credit; an entry balances and has both sides;
-- nothing posted is changed or deleted; nothing goes into a closed period;
-- only active movement (GM) accounts of the same business take postings.
-- ---------------------------------------------------------------------------

-- SAF-T formats: JournalID (no spaces, 1-30), DocArchivalNumber (1-20),
-- TransactionID ("YYYY-MM-DD JournalID DocArchivalNumber"), descriptions (1-200).
ALTER TABLE "journals" ADD CONSTRAINT "journals_code_format" CHECK ("code" ~ '^[^ ]{1,30}$');
ALTER TABLE "journals" ADD CONSTRAINT "journals_name_length" CHECK (char_length("name") BETWEEN 1 AND 60);
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_archival_format" CHECK ("docArchivalNumber" ~ '^[^ ]{1,20}$');
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_transaction_id_format" CHECK ("transactionId" ~ '^[1-9][0-9]{3}-[01][0-9]-[0-3][0-9] [^ ]{1,30} [^ ]{1,20}$');
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_description_length" CHECK (char_length("description") BETWEEN 1 AND 200);
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_range" CHECK ("period" BETWEEN 0 AND 15);
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_totals" CHECK ("totalDebit" = "totalCredit" AND "totalDebit" > 0);
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_one_side" CHECK (
  "debit" >= 0 AND "credit" >= 0 AND (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
);
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_description_length" CHECK (char_length("description") BETWEEN 1 AND 200);
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_source_length" CHECK ("sourceDocumentId" IS NULL OR char_length("sourceDocumentId") BETWEEN 1 AND 30);

-- Posted entries and their lines never change. Deleting is refused unless
-- the session sets pos.allow_fiscal_delete = 'on' (test clean-up only).
CREATE OR REPLACE FUNCTION journal_immutable_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('pos.allow_fiscal_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Posted accounting entries cannot be changed or deleted: post a reversal (estorno)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_immutable
  BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION journal_immutable_guard();

CREATE TRIGGER journal_entry_lines_immutable
  BEFORE UPDATE OR DELETE ON "journal_entry_lines"
  FOR EACH ROW EXECUTE FUNCTION journal_immutable_guard();

-- No entry in a closed period or a closed year (or a period that doesn't exist).
CREATE OR REPLACE FUNCTION journal_entry_period_guard() RETURNS trigger AS $$
DECLARE
  period_status "PeriodStatus";
  year_status "PeriodStatus";
BEGIN
  SELECT p.status, y.status INTO period_status, year_status
  FROM "accounting_periods" p JOIN "fiscal_years" y ON y.id = p."fiscalYearId"
  WHERE p."businessId" = NEW."businessId" AND p.year = NEW.year AND p.number = NEW.period;
  IF period_status IS NULL THEN
    RAISE EXCEPTION 'Accounting period %/% does not exist', NEW.period, NEW.year;
  END IF;
  IF year_status <> 'OPEN' THEN
    RAISE EXCEPTION 'The year % is closed: nothing can be posted in it', NEW.year;
  END IF;
  IF period_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Period %/% is closed: nothing can be posted in it', NEW.period, NEW.year;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "journals" j WHERE j.id = NEW."journalId" AND j."businessId" = NEW."businessId") THEN
    RAISE EXCEPTION 'The journal belongs to another business';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_open_period
  BEFORE INSERT ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION journal_entry_period_guard();

-- Lines: on an active movement account of the entry's business, and only
-- while the entry's period is open (no lines slipped into an old entry).
CREATE OR REPLACE FUNCTION journal_line_guard() RETURNS trigger AS $$
DECLARE
  e RECORD;
  a RECORD;
BEGIN
  SELECT "businessId", year, period INTO e FROM "journal_entries" WHERE id = NEW."entryId";
  SELECT "businessId", category, "isActive", code INTO a FROM "ledger_accounts" WHERE id = NEW."accountId";
  IF a."businessId" IS DISTINCT FROM e."businessId" THEN
    RAISE EXCEPTION 'The account belongs to another business';
  END IF;
  IF a.category <> 'GM' THEN
    RAISE EXCEPTION 'Account % is not a movement account: only movement (GM) accounts take postings', a.code;
  END IF;
  IF NOT a."isActive" THEN
    RAISE EXCEPTION 'Account % is inactive', a.code;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "accounting_periods" p JOIN "fiscal_years" y ON y.id = p."fiscalYearId"
    WHERE p."businessId" = e."businessId" AND p.year = e.year AND p.number = e.period AND p.status = 'OPEN' AND y.status = 'OPEN'
  ) THEN
    RAISE EXCEPTION 'Period %/% is closed: nothing can be posted in it', e.period, e.year;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_lines_account
  BEFORE INSERT ON "journal_entry_lines"
  FOR EACH ROW EXECUTE FUNCTION journal_line_guard();

-- At commit: every entry touched balances, matches its totals and has at
-- least one debit and one credit line (SAF-T Lines: both kinds required).
CREATE OR REPLACE FUNCTION journal_entry_check_balanced(entry_id TEXT) RETURNS void AS $$
DECLARE
  debits NUMERIC;
  credits NUMERIC;
  debit_lines INT;
  credit_lines INT;
  total_debit NUMERIC;
  total_credit NUMERIC;
BEGIN
  SELECT "totalDebit", "totalCredit" INTO total_debit, total_credit FROM "journal_entries" WHERE id = entry_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*) FILTER (WHERE debit > 0), COUNT(*) FILTER (WHERE credit > 0)
    INTO debits, credits, debit_lines, credit_lines
  FROM "journal_entry_lines" WHERE "entryId" = entry_id;
  IF debits <> credits THEN
    RAISE EXCEPTION 'Entry does not balance: debits % and credits %', debits, credits;
  END IF;
  IF debit_lines = 0 OR credit_lines = 0 THEN
    RAISE EXCEPTION 'An entry needs at least one debit and one credit line';
  END IF;
  IF debits <> total_debit OR credits <> total_credit THEN
    RAISE EXCEPTION 'Entry totals do not match its lines';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION journal_entries_balanced_trigger() RETURNS trigger AS $$
BEGIN
  PERFORM journal_entry_check_balanced(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION journal_entry_lines_balanced_trigger() RETURNS trigger AS $$
BEGIN
  PERFORM journal_entry_check_balanced(NEW."entryId");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_entries_balanced
  AFTER INSERT ON "journal_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_entries_balanced_trigger();

CREATE CONSTRAINT TRIGGER journal_entry_lines_balanced
  AFTER INSERT ON "journal_entry_lines"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_entry_lines_balanced_trigger();

-- A movement account with postings stays a movement account.
CREATE OR REPLACE FUNCTION ledger_account_category_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.category = 'GM' AND NEW.category <> 'GM'
     AND EXISTS (SELECT 1 FROM "journal_entry_lines" WHERE "accountId" = OLD.id) THEN
    RAISE EXCEPTION 'Account % has movements: it stays a movement account', OLD.code;
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code AND EXISTS (SELECT 1 FROM "journal_entry_lines" WHERE "accountId" = OLD.id) THEN
    RAISE EXCEPTION 'Account % has movements: its code cannot change', OLD.code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_accounts_category
  BEFORE UPDATE ON "ledger_accounts"
  FOR EACH ROW EXECUTE FUNCTION ledger_account_category_guard();

-- "Lojas agora": whether the till's sync engine was running (someone signed
-- in) at its last heartbeat. Existing rows: true, as before.
ALTER TABLE "terminal_status" ADD COLUMN "syncActive" BOOLEAN NOT NULL DEFAULT true;

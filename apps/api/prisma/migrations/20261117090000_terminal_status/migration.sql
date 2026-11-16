-- "Lojas agora": what each till last reported about its connection.
-- Status only; no existing table changes.
CREATE TABLE "terminal_status" (
    "terminalId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSyncSuccessAt" TIMESTAMP(3),
    "pendingCountReported" INTEGER NOT NULL DEFAULT 0,
    "appVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_status_pkey" PRIMARY KEY ("terminalId")
);

ALTER TABLE "terminal_status" ADD CONSTRAINT "terminal_status_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

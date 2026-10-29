import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { stockSqlState, stockTransaction } from "./stock-transaction";
import { PrismaService } from "../prisma/prisma.service";
const sqlError = (code: string) => new Prisma.PrismaClientKnownRequestError("aborted", { code: "P2010", clientVersion: "test", meta: { code } });
function fixture() {
  const tx = { $executeRaw: jest.fn().mockResolvedValue(1), $queryRaw: jest.fn().mockResolvedValue([]) };
  const transaction = jest.fn(async (work: (t: unknown) => unknown) => work(tx));
  return { tx, transaction, db: { $transaction: transaction } as unknown as PrismaService };
}
describe("stock transaction contention policy", () => {
  it("takes distinct store locks in global order before starting work", async () => {
    const { db, tx } = fixture();
    await stockTransaction(db, ["b", "a", "b"], async () => { expect(tx.$executeRaw.mock.calls).toHaveLength(4); return 42; });
    expect(tx.$executeRaw.mock.calls.slice(2).map((c) => (c as unknown[]).slice(1))).toEqual([["stock:a"], ["stock:b"]]);
  });
  it.each(["40P01", "40001", "55P03"])("replays only whole aborted transactions for %s, at most three times", async (code) => {
    const { db, transaction } = fixture(); let attempts = 0;
    const work = jest.fn(async () => { if (++attempts < 3) throw sqlError(code); return 42; });
    expect(await stockTransaction(db, ["s"], work)).toBe(42); expect(transaction).toHaveBeenCalledTimes(3);
  });
  it("handles Prisma's deadlock/serialization wrapper and real connector SQLSTATE", () => {
    expect(stockSqlState(new Prisma.PrismaClientKnownRequestError("deadlock", { code: "P2034", clientVersion: "test" }))).toBe("40001");
    expect(stockSqlState(new Prisma.PrismaClientUnknownRequestError('ConnectorError(PostgresError { code: "40P01", message: "deadlock detected" })', { clientVersion: "test" }))).toBe("40P01");
    expect(stockSqlState(new Error("40P01"))).toBeNull();
  });
  it("returns a reachable-server STOCK_BUSY rejection on exhaustion", async () => {
    const { db, transaction } = fixture();
    try { await stockTransaction(db, ["s"], async () => { throw sqlError("55P03"); }); throw new Error("expected rejection"); }
    catch (error) { expect(error).toBeInstanceOf(ConflictException); expect((error as ConflictException).getResponse()).toMatchObject({ code: "STOCK_BUSY", retryable: true }); }
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it.each(["P2028", "P2024"])("maps %s to busy without replaying a possibly expired body", async (code) => {
    const { db, transaction } = fixture();
    await expect(stockTransaction(db, ["s"], async () => { throw new Prisma.PrismaClientKnownRequestError("expired", { code, clientVersion: "test" }); })).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it("does not replay a cancelled statement or a mutable import body", async () => {
    for (const options of [{ code: "57014", replayBody: true }, { code: "40P01", replayBody: false }]) {
      const { db, transaction } = fixture();
      await expect(stockTransaction(db, ["s"], async () => { throw sqlError(options.code); }, options)).rejects.toBeInstanceOf(ConflictException);
      expect(transaction).toHaveBeenCalledTimes(1);
    }
  });
  it("can retry acquisition before entering a mutable body", async () => {
    const { db, tx } = fixture(); tx.$executeRaw.mockRejectedValueOnce(sqlError("55P03"));
    const work = jest.fn(async () => 42);
    expect(await stockTransaction(db, ["s"], work, { replayBody: false })).toBe(42); expect(work).toHaveBeenCalledTimes(1);
  });
  it("preserves validation/unique errors and never retries an arbitrary exception", async () => {
    for (const error of [new BadRequestException("invalid"), new Error("unknown commit"), new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" })]) {
      const { db, transaction } = fixture();
      await expect(stockTransaction(db, ["s"], async () => { throw error; })).rejects.toBe(error); expect(transaction).toHaveBeenCalledTimes(1);
    }
  });
});

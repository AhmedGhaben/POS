import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ThrottlerRequest, ThrottlerStorage } from "@nestjs/throttler";
import type { TillAuthService } from "../../till/till-auth.service";
import { TILL_DEFAULT_LIMIT, TillThrottlerGuard } from "./till-throttler.guard";

/** Counts hits per key like the in-memory storage, enough to see who shares a bucket. */
function buildStorage() {
  const hits = new Map<string, number>();
  const storage = {
    increment: jest.fn(async (key: string, ttl: number, limit: number) => {
      const totalHits = (hits.get(key) ?? 0) + 1;
      hits.set(key, totalHits);
      return { totalHits, timeToExpire: ttl, isBlocked: totalHits > limit, timeToBlockExpire: 0 };
    }),
  } as unknown as ThrottlerStorage & { increment: jest.Mock };
  return storage;
}

async function buildGuard(ownLimit?: number) {
  const storage = buildStorage();
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(ownLimit) } as unknown as Reflector;
  const till = {
    terminalForKey: jest.fn(async (key: string) => (key.startsWith("good") ? { id: `t-${key}`, businessId: "b", storeId: "s" } : null)),
  } as unknown as TillAuthService & { terminalForKey: jest.Mock };
  const guard = new TillThrottlerGuard({ throttlers: [{ name: "default", ttl: 60_000, limit: 100 }] }, storage, reflector, till);
  await guard.onModuleInit();
  return { guard, storage, till };
}

function request(headers: Record<string, string>, limit = 100): ThrottlerRequest {
  const req = { ip: "41.0.0.1", headers };
  const res = { header: jest.fn() };
  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return {
    context,
    limit,
    ttl: 60_000,
    blockDuration: 60_000,
    throttler: { name: "default", limit, ttl: 60_000 },
    getTracker: async (r: Record<string, unknown>) => r.ip as string,
    generateKey: (_c: ExecutionContext, tracker: string, name: string) => `${name}-${tracker}`,
  };
}

// handleRequest is protected: the guard's own entry point for one throttler.
const handle = (guard: TillThrottlerGuard, props: ThrottlerRequest) =>
  (guard as unknown as { handleRequest(p: ThrottlerRequest): Promise<boolean> }).handleRequest(props);

describe("TillThrottlerGuard", () => {
  it("counts each registered till on its own, with the larger till limit", async () => {
    const { guard, storage } = await buildGuard();
    await handle(guard, request({ "x-terminal-key": "good-key-1" }));
    await handle(guard, request({ "x-terminal-key": "good-key-2" }));
    await handle(guard, request({}));

    const calls = storage.increment.mock.calls.map(([key, , limit]) => [key, limit]);
    expect(calls).toEqual([
      ["default-terminal:t-good-key-1", TILL_DEFAULT_LIMIT],
      ["default-terminal:t-good-key-2", TILL_DEFAULT_LIMIT],
      ["default-41.0.0.1", 100],
    ]);
  });

  it("counts an unknown key by IP like any other request", async () => {
    const { guard, storage } = await buildGuard();
    await handle(guard, request({ "x-terminal-key": "bad-key" }));
    expect(storage.increment.mock.calls[0][0]).toBe("default-41.0.0.1");
  });

  it("keeps a route's own stricter limit for tills", async () => {
    const { guard, storage } = await buildGuard(5);
    await handle(guard, request({ "x-terminal-key": "good-key-1" }, 5));
    expect(storage.increment.mock.calls[0][2]).toBe(5);
  });

  it("looks a key up once and then remembers it", async () => {
    const { guard, till } = await buildGuard();
    await handle(guard, request({ "x-terminal-key": "good-key-1" }));
    await handle(guard, request({ "x-terminal-key": "good-key-1" }));
    expect(till.terminalForKey).toHaveBeenCalledTimes(1);
  });
});

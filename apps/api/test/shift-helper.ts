import { randomUUID } from "crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

/**
 * Every sale needs an open shift (docs/plans/ANGOLA.md, phase 3). Returns
 * the clientId of the caller's open shift in this store (on this till when
 * terminalId is given), opening one with no float if there isn't one.
 */
export async function ensureShift(
  app: INestApplication,
  token: string,
  storeId: string,
  opts: { terminalId?: string; headers?: Record<string, string>; openingFloat?: number } = {},
): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) };
  const query = new URLSearchParams({ storeId, ...(opts.terminalId ? { terminalId: opts.terminalId } : {}) });
  const current = await request(app.getHttpServer()).get(`/shifts/current?${query}`).set(headers).expect(200);
  const shift = current.body?.shift ?? null;
  if (shift && shift.status === "OPEN") return shift.clientId as string;

  const clientId = randomUUID();
  await request(app.getHttpServer())
    .post("/shifts/open")
    .set(headers)
    .send({ storeId, clientId, openingFloat: opts.openingFloat ?? 0, ...(opts.terminalId ? { terminalId: opts.terminalId } : {}) })
    .expect(200);
  return clientId;
}

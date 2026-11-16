import { Injectable } from "@nestjs/common";
import { Role, ShiftStatus } from "@prisma/client";
import type { StoreStatusDto, TillStatusDto } from "@pos/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import type { TillTerminal } from "../till/till-auth.service";
import { TerminalHeartbeatDto } from "./dto/terminal.dto";
import { STATUS_SEVERITY, latest, storeStatus, tillStatus } from "./sync-status";

/**
 * "Lojas agora": tills report their connection (heartbeat), owners and
 * managers read each store's status. Reads the sync state, never changes it.
 */
@Injectable()
export class TerminalStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /** One small upsert: the server's clock decides when the till was seen. */
  async heartbeat(terminal: TillTerminal, dto: TerminalHeartbeatDto): Promise<void> {
    const now = new Date();
    const fields = {
      lastSeenAt: now,
      pendingCountReported: dto.pendingCount,
      syncActive: dto.syncActive ?? true,
      appVersion: dto.appVersion ?? null,
      ...(dto.syncedOk ? { lastSyncSuccessAt: now } : {}),
    };
    await this.prisma.terminalStatus.upsert({
      where: { terminalId: terminal.id },
      create: { terminalId: terminal.id, ...fields },
      update: fields,
    });
  }

  /** The stores this person can already see (owners: all; managers: theirs), each with its tills. */
  async storesStatus(user: AuthenticatedUser, now = new Date()): Promise<StoreStatusDto[]> {
    const stores = await this.prisma.store.findMany({
      where: {
        businessId: user.businessId,
        isActive: true,
        ...(user.role === Role.OWNER ? {} : { storeUsers: { some: { userId: user.userId } } }),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        timezone: true,
        country: true,
        terminals: {
          where: { isActive: true },
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            name: true,
            code: true,
            lastSeenAt: true,
            status: true,
            shifts: { where: { status: ShiftStatus.OPEN }, select: { id: true }, take: 1 },
          },
        },
        shifts: { where: { status: ShiftStatus.OPEN, terminalId: null }, select: { id: true }, take: 1 },
      },
    });

    return stores.map((store) => {
      const devices: (TillStatusDto & { seen: Date | null; synced: Date | null })[] = store.terminals.map((t) => {
        // Heard from by its heartbeat, or by an upload (sales already stamp the till).
        const seen = latest(t.lastSeenAt, t.status?.lastSeenAt);
        const synced = t.status?.lastSyncSuccessAt ?? null;
        const pending = t.status?.pendingCountReported ?? 0;
        const syncActive = t.status?.syncActive ?? true;
        const hasOpenShift = t.shifts.length > 0;
        return {
          terminalId: t.id,
          name: t.name,
          code: t.code,
          status: tillStatus({ lastSeenAt: seen, pendingCountReported: pending, syncActive, hasOpenShift }, now),
          lastSeenAt: seen?.toISOString() ?? null,
          lastSyncSuccessAt: synced?.toISOString() ?? null,
          pendingCountReported: pending,
          appVersion: t.status?.appVersion ?? null,
          syncActive,
          hasOpenShift,
          seen,
          synced,
        };
      });
      const status = storeStatus(
        devices.map((d) => d.status),
        store.shifts.length > 0,
      );
      // The times shown for the store are those of the tills that decide its status.
      const deciding = (STATUS_SEVERITY as string[]).includes(status) ? devices.filter((d) => d.status === status) : [];
      const seen = deciding.reduce<Date | null>((acc, d) => latest(acc, d.seen), null);
      const synced = deciding.reduce<Date | null>((acc, d) => latest(acc, d.synced), null);
      return {
        storeId: store.id,
        name: store.name,
        timezone: store.timezone,
        country: store.country,
        status,
        lastSeenAt: seen?.toISOString() ?? null,
        lastSyncSuccessAt: synced?.toISOString() ?? null,
        devices: devices.map(({ seen: _seen, synced: _synced, ...d }) => d),
      };
    });
  }
}

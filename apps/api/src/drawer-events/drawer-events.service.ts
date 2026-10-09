import { Injectable, Logger } from "@nestjs/common";
import { DrawerOpenReason, Permission, Prisma, Role } from "@prisma/client";
import { PermissionsService } from "../common/permissions/permissions.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDrawerEventDto, ListDrawerEventsQuery } from "./dto/drawer-event.dto";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const EVENT_SELECT = {
  id: true,
  storeId: true,
  terminalId: true,
  reason: true,
  subReason: true,
  note: true,
  saleId: true,
  saleClientId: true,
  succeeded: true,
  error: true,
  permitted: true,
  createdOffline: true,
  occurredAt: true,
  createdAt: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  terminal: { select: { name: true, code: true } },
  store: { select: { name: true } },
} satisfies Prisma.DrawerEventSelect;

@Injectable()
export class DrawerEventsService {
  private readonly logger = new Logger(DrawerEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Records a drawer opening reported by a till. It already happened (maybe
   * offline, hours ago), so nothing is refused: a manual opening by someone
   * without OPEN_DRAWER is kept and flagged `permitted: false`. Retries with
   * the same clientId return the first record.
   */
  async record(user: AuthenticatedUser, dto: CreateDrawerEventDto) {
    const existing = await this.findByClientId(dto.storeId, dto.clientId);
    if (existing) return existing;

    const permitted =
      dto.reason !== DrawerOpenReason.MANUAL_OPEN ||
      (await this.permissions.hasPermission(user.userId, user.role, Permission.OPEN_DRAWER));

    const [terminal, sale] = await Promise.all([
      dto.terminalId
        ? this.prisma.terminal.findFirst({ where: { id: dto.terminalId, businessId: user.businessId }, select: { id: true } })
        : null,
      dto.saleClientId
        ? this.prisma.sale.findUnique({
            where: { storeId_clientId: { storeId: dto.storeId, clientId: dto.saleClientId } },
            select: { id: true },
          })
        : null,
    ]);

    const occurredAt = new Date(dto.occurredAt);
    const now = Date.now();
    try {
      return await this.prisma.drawerEvent.create({
        data: {
          businessId: user.businessId,
          storeId: dto.storeId,
          terminalId: terminal?.id ?? null,
          userId: user.userId,
          reason: dto.reason,
          subReason: dto.reason === DrawerOpenReason.MANUAL_OPEN ? (dto.subReason ?? "OTHER") : null,
          note: dto.note?.trim() || null,
          saleClientId: dto.saleClientId ?? null,
          saleId: sale?.id ?? null,
          succeeded: dto.succeeded,
          error: dto.succeeded ? null : (dto.error ?? null),
          permitted,
          createdOffline: dto.offline,
          clientId: dto.clientId,
          occurredAt: occurredAt.getTime() > now + MAX_CLOCK_SKEW_MS ? new Date(now) : occurredAt,
        },
        select: EVENT_SELECT,
      });
    } catch (error) {
      const again = await this.findByClientId(dto.storeId, dto.clientId);
      if (again) return again;
      throw error;
    } finally {
      if (!permitted) {
        this.logger.warn(`Drawer opened without OPEN_DRAWER by user ${user.userId} (event ${dto.clientId})`);
      }
    }
  }

  async findAll(user: AuthenticatedUser, query: ListDrawerEventsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.DrawerEventWhereInput = {
      businessId: user.businessId,
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.reason ? { reason: query.reason } : {}),
      // Managers see their own stores only.
      ...(user.role !== Role.OWNER && !query.storeId
        ? { store: { storeUsers: { some: { userId: user.userId } } } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.drawerEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: EVENT_SELECT,
      }),
      this.prisma.drawerEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  private findByClientId(storeId: string, clientId: string) {
    return this.prisma.drawerEvent.findUnique({
      where: { storeId_clientId: { storeId, clientId } },
      select: EVENT_SELECT,
    });
  }
}

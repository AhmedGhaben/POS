import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions/permissions.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { generateOpaqueToken, hashToken } from "../common/utils/tokens";
import type { TillTerminal } from "../till/till-auth.service";
import { CreateTerminalDto, UpdateTerminalDto } from "./dto/terminal.dto";

const TERMINAL_SELECT = {
  id: true,
  storeId: true,
  name: true,
  code: true,
  isActive: true,
  createdAt: true,
  lastSeenAt: true,
} satisfies Prisma.TerminalSelect;

export function terminalCode(sequence: number) {
  return `POS-${String(sequence).padStart(3, "0")}`;
}

/** A new secret for a till: only its hash is stored, the key goes back once. */
function newKey() {
  const key = generateOpaqueToken();
  return { key, data: { keyHash: hashToken(key), keyIssuedAt: new Date() } };
}

@Injectable()
export class TerminalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Registers a till. Codes run POS-001, POS-002, … per business. The
   * response carries the till's key once; the Windows app keeps it.
   */
  async create(businessId: string, dto: CreateTerminalDto) {
    const { key, data } = newKey();
    for (let attempt = 0; ; attempt++) {
      try {
        const terminal = await this.prisma.$transaction(async (tx) => {
          const last = await tx.terminal.findFirst({
            where: { businessId },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          });
          const sequence = (last?.sequence ?? 0) + 1;
          return tx.terminal.create({
            data: { businessId, storeId: dto.storeId, name: dto.name, sequence, code: terminalCode(sequence), ...data },
            select: TERMINAL_SELECT,
          });
        });
        return { ...terminal, key };
      } catch (error) {
        // Two tills registered at the same moment and took the same number.
        const clash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (!clash || attempt >= 4) throw error;
      }
    }
  }

  async findAll(user: AuthenticatedUser, storeId?: string) {
    const where: Prisma.TerminalWhereInput = { businessId: user.businessId };
    if (storeId) {
      where.storeId = storeId;
    } else if (user.role !== Role.OWNER) {
      where.store = { storeUsers: { some: { userId: user.userId } } };
    }
    return this.prisma.terminal.findMany({ where, select: TERMINAL_SELECT, orderBy: { sequence: "asc" } });
  }

  async findOne(businessId: string, id: string) {
    const terminal = await this.prisma.terminal.findFirst({
      where: { id, businessId },
      select: TERMINAL_SELECT,
    });
    if (!terminal) throw new NotFoundException("Terminal not found");
    return terminal;
  }

  /** A manager must be able to see the store the till is in. */
  private async assertCanManage(user: AuthenticatedUser, storeId: string) {
    if (user.role === Role.OWNER) return;
    const access = await this.prisma.storeUser.findUnique({
      where: { userId_storeId: { userId: user.userId, storeId } },
    });
    if (!access) throw new ForbiddenException("You do not have access to this store");
  }

  /**
   * A new key for a till, replacing the old one (which stops working). Tills
   * registered before keys existed get theirs this way.
   */
  async rotateKey(user: AuthenticatedUser, id: string) {
    const terminal = await this.findOne(user.businessId, id);
    await this.assertCanManage(user, terminal.storeId);
    const { key, data } = newKey();
    const updated = await this.prisma.terminal.update({ where: { id }, data, select: TERMINAL_SELECT });
    return { ...updated, key };
  }

  /**
   * The people who can sign in on this till with a PIN: active, with a PIN,
   * and allowed in its store. Includes each one's permissions and PIN check
   * value, so the till can sign them in while offline.
   */
  async staffForTill(terminal: TillTerminal) {
    const users = await this.prisma.user.findMany({
      where: {
        businessId: terminal.businessId,
        isActive: true,
        pinHash: { not: null },
        OR: [{ role: Role.OWNER }, { storeUsers: { some: { storeId: terminal.storeId } } }],
      },
      select: { id: true, firstName: true, lastName: true, role: true, language: true, pinHash: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    await this.prisma.terminal.update({ where: { id: terminal.id }, data: { lastSeenAt: new Date() } });
    return Promise.all(
      users.map(async ({ pinHash, ...u }) => ({
        ...u,
        pin: pinHash!,
        permissions: await this.permissions.getEffectivePermissions(u.id, u.role),
      })),
    );
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTerminalDto) {
    const terminal = await this.findOne(user.businessId, id);
    // StoreAccessGuard has checked a new storeId; a manager must also be
    // able to see the store the till is in now.
    await this.assertCanManage(user, terminal.storeId);
    return this.prisma.terminal.update({
      where: { id },
      data: { name: dto.name, storeId: dto.storeId, isActive: dto.isActive },
      select: TERMINAL_SELECT,
    });
  }
}

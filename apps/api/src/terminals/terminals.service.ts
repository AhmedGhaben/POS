import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
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

@Injectable()
export class TerminalsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registers a till. Codes run POS-001, POS-002, … per business. */
  async create(businessId: string, dto: CreateTerminalDto) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.terminal.findFirst({
            where: { businessId },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          });
          const sequence = (last?.sequence ?? 0) + 1;
          return tx.terminal.create({
            data: { businessId, storeId: dto.storeId, name: dto.name, sequence, code: terminalCode(sequence) },
            select: TERMINAL_SELECT,
          });
        });
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

  async update(user: AuthenticatedUser, id: string, dto: UpdateTerminalDto) {
    const terminal = await this.findOne(user.businessId, id);
    // StoreAccessGuard has checked a new storeId; a manager must also be
    // able to see the store the till is in now.
    if (user.role !== Role.OWNER) {
      const access = await this.prisma.storeUser.findUnique({
        where: { userId_storeId: { userId: user.userId, storeId: terminal.storeId } },
      });
      if (!access) throw new ForbiddenException("You do not have access to this store");
    }
    return this.prisma.terminal.update({
      where: { id },
      data: { name: dto.name, storeId: dto.storeId, isActive: dto.isActive },
      select: TERMINAL_SELECT,
    });
  }
}

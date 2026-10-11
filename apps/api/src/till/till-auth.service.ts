import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { hashToken } from "../common/utils/tokens";

/** A registered till, identified by the key the Windows app sends. */
export interface TillTerminal {
  id: string;
  businessId: string;
  storeId: string;
}

export const TERMINAL_KEY_HEADER = "x-terminal-key";

@Injectable()
export class TillAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active till this key belongs to, or null. */
  async terminalForKey(key: unknown): Promise<TillTerminal | null> {
    if (typeof key !== "string" || key.length < 32 || key.length > 200) return null;
    const terminal = await this.prisma.terminal.findUnique({
      where: { keyHash: hashToken(key) },
      select: { id: true, businessId: true, storeId: true, isActive: true },
    });
    if (!terminal?.isActive) return null;
    return { id: terminal.id, businessId: terminal.businessId, storeId: terminal.storeId };
  }

  /**
   * Work a till queued (offline, or before switching cashier) is recorded
   * under the person who did it. The till checked their PIN; the server
   * checks they're an active member of the till's business.
   */
  async actingUser(key: unknown, userId: unknown): Promise<{ user: AuthenticatedUser; terminal: TillTerminal }> {
    const terminal = await this.terminalForKey(key);
    if (!terminal) throw new UnauthorizedException("This till isn't registered any more");
    const user =
      typeof userId === "string"
        ? await this.prisma.user.findFirst({
            where: { id: userId, businessId: terminal.businessId },
            select: { id: true, role: true, isActive: true },
          })
        : null;
    if (!user || !user.isActive) throw new UnauthorizedException("Account is deactivated");
    return { user: { userId: user.id, businessId: terminal.businessId, role: user.role }, terminal };
  }

  /** Owners can use every store; others need to be assigned to it. */
  async canUseStore(user: { id: string; role: Role }, storeId: string): Promise<boolean> {
    if (user.role === Role.OWNER) return true;
    const access = await this.prisma.storeUser.findUnique({
      where: { userId_storeId: { userId: user.id, storeId } },
    });
    return !!access;
  }
}

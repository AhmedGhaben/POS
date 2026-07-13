import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthenticatedUser } from "../types/authenticated-user";

/**
 * Like StoreAccessGuard, but a stock transfer touches two stores at once —
 * checks both `fromStoreId` and `toStoreId` from the request body belong to
 * the user's business and (for MANAGER/CASHIER) are in their StoreUser set.
 */
@Injectable()
export class TransferStoreAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) return false;

    const fromStoreId: string | undefined = request.body?.fromStoreId;
    const toStoreId: string | undefined = request.body?.toStoreId;
    if (!fromStoreId || !toStoreId) {
      throw new BadRequestException("fromStoreId and toStoreId are required");
    }

    await this.checkStoreAccess(user, fromStoreId);
    await this.checkStoreAccess(user, toStoreId);
    return true;
  }

  private async checkStoreAccess(user: AuthenticatedUser, storeId: string): Promise<void> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.businessId !== user.businessId) {
      throw new ForbiddenException("Store not found in your business");
    }
    if (user.role === Role.OWNER) return;

    const access = await this.prisma.storeUser.findUnique({
      where: { userId_storeId: { userId: user.userId, storeId } },
    });
    if (!access) {
      throw new ForbiddenException("You do not have access to this store");
    }
  }
}

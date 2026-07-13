import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthenticatedUser } from "../types/authenticated-user";

/**
 * Guards any route that operates on a specific store (path param, query, or
 * body field named `storeId`). OWNER always passes — they implicitly have
 * access to every store in their business. MANAGER/CASHIER are checked
 * against the live StoreUser table (never against a token claim), so
 * reassigning a user's stores takes effect on their very next request.
 */
@Injectable()
export class StoreAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      return false;
    }

    const storeId: string | undefined =
      request.params?.storeId ?? request.query?.storeId ?? request.body?.storeId;

    if (!storeId) {
      // Route doesn't scope to a single store — nothing for this guard to check.
      return true;
    }

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.businessId !== user.businessId) {
      throw new ForbiddenException("Store not found in your business");
    }

    if (user.role === Role.OWNER) {
      return true;
    }

    const access = await this.prisma.storeUser.findUnique({
      where: { userId_storeId: { userId: user.userId, storeId } },
    });
    if (!access) {
      throw new ForbiddenException("You do not have access to this store");
    }
    return true;
  }
}

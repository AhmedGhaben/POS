import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../types/authenticated-user";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** What an accountant may change: the books, their own sign-in and profile. */
const ACCOUNTANT_WRITES = [/^\/accounting(\/|$)/, /^\/auth\//, /^\/users\/me(\/|$)/, /^\/accountant(\/|$)/];

/**
 * An accountant has full rights in Contabilidade and reads the rest; they
 * never sell, buy, move stock, work a till or touch staff and PINs
 * (docs/ACCOUNTING-DECISIONS.md, B1). Checked for every request.
 */
@Injectable()
export class AccountantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (user?.role !== Role.ACCOUNTANT || READ_METHODS.has(request.method)) return true;
    const path: string = (request.originalUrl ?? request.url ?? "").split("?")[0].replace(/^\/api(?=\/)/, "");
    if (ACCOUNTANT_WRITES.some((re) => re.test(path))) return true;
    throw new ForbiddenException("Accountants only change the books");
  }
}

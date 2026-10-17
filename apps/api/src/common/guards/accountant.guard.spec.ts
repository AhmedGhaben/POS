import { ForbiddenException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AccountantGuard } from "./accountant.guard";

const ctx = (role: Role, method: string, url: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user: { userId: "u", businessId: "b", role }, method, originalUrl: url }) }) }) as never;

describe("AccountantGuard", () => {
  const guard = new AccountantGuard();

  it("lets an accountant read anything and change the books, their sign-in and profile", () => {
    expect(guard.canActivate(ctx(Role.ACCOUNTANT, "GET", "/sales?storeId=s"))).toBe(true);
    expect(guard.canActivate(ctx(Role.ACCOUNTANT, "POST", "/accounting/entries"))).toBe(true);
    expect(guard.canActivate(ctx(Role.ACCOUNTANT, "POST", "/api/accounting/integration/run"))).toBe(true);
    expect(guard.canActivate(ctx(Role.ACCOUNTANT, "POST", "/auth/switch-business"))).toBe(true);
    expect(guard.canActivate(ctx(Role.ACCOUNTANT, "PATCH", "/users/me/display-size"))).toBe(true);
    expect(guard.canActivate(ctx(Role.ACCOUNTANT, "PATCH", "/accountant/profile"))).toBe(true);
  });

  it("refuses an accountant anything else that changes data: sales, purchases, staff, PINs", () => {
    for (const [m, url] of [["POST", "/sales"], ["POST", "/purchases"], ["POST", "/employees"], ["PUT", "/users/abc/pin"], ["POST", "/accountingx"]]) {
      expect(() => guard.canActivate(ctx(Role.ACCOUNTANT, m, url))).toThrow(ForbiddenException);
    }
  });

  it("leaves everyone else alone", () => {
    expect(guard.canActivate(ctx(Role.CASHIER, "POST", "/sales"))).toBe(true);
    expect(guard.canActivate(ctx(Role.OWNER, "DELETE", "/employees/1"))).toBe(true);
  });
});

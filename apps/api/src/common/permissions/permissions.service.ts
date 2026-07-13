import { Injectable } from "@nestjs/common";
import { Permission, Role } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { DEFAULT_PERMISSIONS } from "./default-permissions";

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async hasPermission(userId: string, role: Role, permission: Permission): Promise<boolean> {
    const override = await this.prisma.userPermission.findUnique({
      where: { userId_permission: { userId, permission } },
    });
    if (override) return override.granted;
    return DEFAULT_PERMISSIONS[role].includes(permission);
  }

  /** Full grant/deny map for every known permission — role default unless overridden. */
  async getEffectivePermissions(userId: string, role: Role): Promise<Record<Permission, boolean>> {
    const overrides = await this.prisma.userPermission.findMany({ where: { userId } });
    const overrideMap = new Map(overrides.map((o) => [o.permission, o.granted]));

    const result = {} as Record<Permission, boolean>;
    for (const permission of Object.values(Permission)) {
      result[permission] = overrideMap.has(permission)
        ? overrideMap.get(permission)!
        : DEFAULT_PERMISSIONS[role].includes(permission);
    }
    return result;
  }

  /** `granted: null` clears the override, reverting the user to their role's default. */
  async setOverride(userId: string, permission: Permission, granted: boolean | null): Promise<void> {
    if (granted === null) {
      await this.prisma.userPermission.deleteMany({ where: { userId, permission } });
      return;
    }
    await this.prisma.userPermission.upsert({
      where: { userId_permission: { userId, permission } },
      create: { userId, permission, granted },
      update: { granted },
    });
  }
}

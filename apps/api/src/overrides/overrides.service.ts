import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Permission, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions/permissions.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { checkPinAttempt } from "../common/utils/pin-attempts";
import { generateOpaqueToken, hashToken } from "../common/utils/tokens";
import { RequestOverrideDto } from "./dto/override.dto";

/** How long an approval can wait before it's used. */
export const OVERRIDE_TTL_MS = 5 * 60 * 1000;

/** The header a request carries to use an approval. */
export const OVERRIDE_HEADER = "x-override-token";

export interface UsedOverride {
  id: string;
  approvedById: string;
  permission: Permission;
}

/**
 * Manager override (docs/plans/ANGOLA.md, phase 3): someone without a
 * permission gets one action approved by a person who has it, by that
 * person's PIN. The cashier stays signed in. Each approval is single use,
 * bound to the permission and the person who asked, and short-lived; it
 * and its use are written to the audit log.
 */
@Injectable()
export class OverridesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /** People who could approve this here: active, with a PIN, the permission and access to the store. */
  async approvers(user: AuthenticatedUser, permission: Permission, storeId?: string) {
    const candidates = await this.prisma.user.findMany({
      where: {
        businessId: user.businessId,
        isActive: true,
        pinHash: { not: null },
        id: { not: user.userId },
        ...(storeId ? { OR: [{ role: Role.OWNER }, { storeUsers: { some: { storeId } } }] } : {}),
      },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    const allowed = await Promise.all(candidates.map((c) => this.permissions.hasPermission(c.id, c.role, permission)));
    return candidates.filter((_, i) => allowed[i]);
  }

  /** Checks the approver's PIN and permission, and issues the single-use approval. */
  async approve(user: AuthenticatedUser, dto: RequestOverrideDto) {
    if (dto.approverId === user.userId) throw new BadRequestException("Someone else has to approve this");
    const approver = await this.prisma.user.findFirst({
      where: { id: dto.approverId, businessId: user.businessId, isActive: true },
    });
    if (!approver || !approver.pinHash) throw new ForbiddenException("This person can't approve it");
    try {
      await checkPinAttempt(this.prisma, approver, dto.pin);
    } catch (err) {
      // 403, not 401: the cashier's own session is fine, and a 401 would
      // make the app refresh it (and retry the wrong PIN) or sign them out.
      // The code says which, since the message is translated.
      if (err instanceof UnauthorizedException) throw new ForbiddenException({ message: "Wrong PIN", code: "WRONG_PIN" });
      if (err instanceof ForbiddenException) throw new ForbiddenException({ message: err.message, code: "PIN_LOCKED" });
      throw err;
    }
    if (!(await this.permissions.hasPermission(approver.id, approver.role, dto.permission))) {
      throw new ForbiddenException("This person can't approve it");
    }

    const token = generateOpaqueToken();
    const override = await this.prisma.managerOverride.create({
      data: {
        businessId: user.businessId,
        storeId: dto.storeId ?? null,
        requestedById: user.userId,
        approvedById: approver.id,
        permission: dto.permission,
        action: dto.action,
        details: (dto.details ?? undefined) as Prisma.InputJsonValue | undefined,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + OVERRIDE_TTL_MS),
      },
    });
    await this.audit(user.businessId, user.userId, "MANAGER_OVERRIDE_APPROVED", override.id, {
      approvedBy: approver.id,
      approverName: `${approver.firstName} ${approver.lastName}`,
      permission: dto.permission,
      action: dto.action,
      details: dto.details ?? null,
    });
    return { token, expiresAt: override.expiresAt, approver: { id: approver.id, firstName: approver.firstName, lastName: approver.lastName } };
  }

  /**
   * Uses an approval for `permission`, once. Valid only for the person it
   * was issued to, before it expires. Runs in the caller's transaction when
   * given, so a failed action gives the approval back.
   */
  async consume(
    token: string,
    user: Pick<AuthenticatedUser, "userId" | "businessId">,
    permission: Permission,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<UsedOverride> {
    const now = new Date();
    const claimed = await tx.managerOverride.updateMany({
      where: {
        tokenHash: hashToken(token),
        businessId: user.businessId,
        requestedById: user.userId,
        permission,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new ForbiddenException("The manager's approval is no longer valid");
    const override = await tx.managerOverride.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
      select: { id: true, approvedById: true, permission: true, action: true },
    });
    await this.audit(user.businessId, user.userId, "MANAGER_OVERRIDE_USED", override.id, {
      approvedBy: override.approvedById,
      permission,
      action: override.action,
    });
    return override;
  }

  /**
   * An action done while the till was offline, approved by a manager whose
   * PIN the till checked itself. It already happened, so it's recorded
   * (flagged when the approver lacks the permission now) rather than refused.
   */
  async recordOffline(
    user: Pick<AuthenticatedUser, "userId" | "businessId">,
    o: { approverId: string; permission: Permission; action: string; storeId?: string; details?: Record<string, unknown> },
  ): Promise<UsedOverride> {
    const approver = await this.prisma.user.findFirst({ where: { id: o.approverId, businessId: user.businessId } });
    if (!approver) throw new BadRequestException("Unknown approver");
    const permitted = await this.permissions.hasPermission(approver.id, approver.role, o.permission);
    const override = await this.prisma.managerOverride.create({
      data: {
        businessId: user.businessId,
        storeId: o.storeId ?? null,
        requestedById: user.userId,
        approvedById: approver.id,
        permission: o.permission,
        action: o.action,
        details: { ...(o.details ?? {}), permittedAtUpload: permitted } as Prisma.InputJsonValue,
        offline: true,
        usedAt: new Date(),
      },
    });
    await this.audit(user.businessId, user.userId, "MANAGER_OVERRIDE_OFFLINE", override.id, {
      approvedBy: approver.id,
      permission: o.permission,
      action: o.action,
      permittedAtUpload: permitted,
    });
    return { id: override.id, approvedById: approver.id, permission: o.permission };
  }

  private async audit(businessId: string, userId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: { businessId, userId, action, entityType: "manager-override", entityId, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Permission, Prisma, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions/permissions.service";
import { MailService } from "../common/mail/mail.service";
import { emailLanguage } from "../common/i18n/languages";
import { normalizeEmail } from "../common/transforms/normalize-email";
import { generateOpaqueToken, hashToken } from "../common/utils/tokens";
import { CreateUserDto } from "./dto/create-user.dto";
import { StaffLoginDto } from "./dto/staff-login.dto";
import { UpdateStaffAccessDto } from "./dto/update-staff-access.dto";

const SALT_ROUNDS = 12;
/** Staff may not check email right away, so invites last longer than a reset (1h). */
const STAFF_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/** Validated, hashed input for a staff login — the slow work done before opening a transaction. */
export interface PreparedStaffLogin {
  email: string;
  role: StaffLoginDto["role"];
  storeIds: string[];
  passwordHash: string;
  sendInvite: boolean;
}

export interface StaffAccess {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  storeIds: string[];
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly mail: MailService,
  ) {}

  private async findInBusiness(businessId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.businessId !== businessId) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async setLanguage(userId: string, language: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { language } });
    return { language };
  }

  async getEffectivePermissions(businessId: string, userId: string) {
    const user = await this.findInBusiness(businessId, userId);
    return this.permissionsService.getEffectivePermissions(user.id, user.role);
  }

  async setPermissionOverride(
    businessId: string,
    userId: string,
    permission: Permission,
    granted: boolean | null | undefined,
  ) {
    await this.findInBusiness(businessId, userId);
    await this.permissionsService.setOverride(userId, permission, granted ?? null);
    return this.getEffectivePermissions(businessId, userId);
  }

  findAll(businessId: string) {
    return this.prisma.user.findMany({
      where: { businessId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });
  }

  private async assertEmailFree(email: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("Email already in use");
    }
  }

  private async assertStoresInBusiness(businessId: string, storeIds: string[]) {
    const count = await this.prisma.store.count({ where: { id: { in: storeIds }, businessId } });
    if (count !== storeIds.length) {
      throw new NotFoundException("Store not found");
    }
  }

  async create(businessId: string, dto: CreateUserDto) {
    const email = normalizeEmail(dto.email);
    await this.assertEmailFree(email);

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        businessId,
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        // Provisioned by the business owner, who vouches for the address.
        emailVerifiedAt: new Date(),
      },
    });
    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  }

  /** Step 1 of creating a staff login: checks and bcrypt, outside any transaction. */
  async prepareStaffLogin(businessId: string, dto: StaffLoginDto): Promise<PreparedStaffLogin> {
    const sendInvite = dto.sendInvite === true;
    if (sendInvite === (dto.password !== undefined)) {
      throw new BadRequestException("Provide either a password or sendInvite, not both");
    }
    const email = normalizeEmail(dto.email);
    await this.assertEmailFree(email);
    await this.assertStoresInBusiness(businessId, dto.storeIds);

    // Invited users get a random password nobody knows until they set theirs.
    const passwordHash = await bcrypt.hash(dto.password ?? generateOpaqueToken(), SALT_ROUNDS);
    return { email, role: dto.role, storeIds: dto.storeIds, passwordHash, sendInvite };
  }

  /**
   * Step 2: writes the user, its store access and (for invites) the token,
   * inside the caller's transaction. Returns the raw invite token, if any,
   * to email via `sendStaffInvite` once the transaction commits.
   */
  async createStaffLoginInTx(
    tx: Prisma.TransactionClient,
    businessId: string,
    name: { firstName: string; lastName: string },
    login: PreparedStaffLogin,
  ): Promise<{ userId: string; inviteToken: string | null }> {
    const user = await tx.user.create({
      data: {
        businessId,
        email: login.email,
        passwordHash: login.passwordHash,
        firstName: name.firstName,
        lastName: name.lastName,
        role: login.role,
        // Provisioned by the business owner, who vouches for the address.
        emailVerifiedAt: new Date(),
      },
    });
    await tx.storeUser.createMany({
      data: login.storeIds.map((storeId) => ({ userId: user.id, storeId })),
    });

    let inviteToken: string | null = null;
    if (login.sendInvite) {
      inviteToken = generateOpaqueToken();
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(inviteToken),
          expiresAt: new Date(Date.now() + STAFF_INVITE_TTL_MS),
        },
      });
    }
    return { userId: user.id, inviteToken };
  }

  /** Step 3, after commit. Best-effort: the owner can recreate the login if mail is down. */
  async sendStaffInvite(businessId: string, userId: string, inviteToken: string): Promise<void> {
    try {
      const [user, business] = await Promise.all([
        this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        this.prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
      ]);
      await this.mail.sendStaffInviteEmail(
        user.email,
        { firstName: user.firstName, businessName: business.name, token: inviteToken },
        emailLanguage(user.language, business.language),
      );
    } catch (err) {
      this.logger.error(`Failed to send staff invite for user ${userId}: ${(err as Error).message}`);
    }
  }

  async updateStaffAccess(
    businessId: string,
    actorUserId: string,
    userId: string,
    dto: UpdateStaffAccessDto,
  ): Promise<StaffAccess> {
    const target = await this.findInBusiness(businessId, userId);
    if (target.id === actorUserId) {
      throw new ForbiddenException("You can't change your own access");
    }
    if (target.role === Role.OWNER) {
      throw new ForbiddenException("Owner access can't be changed");
    }
    if (dto.storeIds) {
      await this.assertStoresInBusiness(businessId, dto.storeIds);
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.user.update({
        where: { id: userId },
        data: { role: dto.role, isActive: dto.isActive },
      }),
    ];
    if (dto.storeIds) {
      ops.push(
        this.prisma.storeUser.deleteMany({ where: { userId, storeId: { notIn: dto.storeIds } } }),
        this.prisma.storeUser.createMany({
          data: dto.storeIds.map((storeId) => ({ userId, storeId })),
          skipDuplicates: true,
        }),
      );
    }
    if (dto.isActive === false) {
      // JwtStrategy rejects the access token on the next request; this stops refreshes too.
      ops.push(
        this.prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      );
    }
    await this.prisma.$transaction(ops);

    const updated = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, role: true, isActive: true, storeUsers: { select: { storeId: true } } },
    });
    const { storeUsers, ...rest } = updated;
    return { ...rest, storeIds: storeUsers.map((su) => su.storeId) };
  }
}

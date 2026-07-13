import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { parseDurationMs } from "../common/utils/duration";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    businessId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    accessibleStoreIds: string[];
  };
  stores: { id: string; businessId: string; name: string; address: string | null; timezone: string; isActive: boolean }[];
}

function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private signAccessToken(user: { id: string; businessId: string; role: Role }): string {
    return this.jwt.sign(
      { sub: user.id, businessId: user.businessId, role: user.role },
      {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "30m",
      },
    );
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const rawToken = generateOpaqueToken();
    const ttlMs = parseDurationMs(this.config.get<string>("JWT_REFRESH_TTL") ?? "30d");
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return rawToken;
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const allStores = await this.prisma.store.findMany({
      where: { businessId: user.businessId, isActive: true },
    });

    let accessibleStoreIds: string[];
    if (user.role === Role.OWNER) {
      accessibleStoreIds = allStores.map((s) => s.id);
    } else {
      const storeUsers = await this.prisma.storeUser.findMany({
        where: { userId: user.id },
        select: { storeId: true },
      });
      accessibleStoreIds = storeUsers.map((su) => su.storeId);
    }

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);

    const accessibleStores = allStores.filter((s) => accessibleStoreIds.includes(s.id));

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        businessId: user.businessId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        accessibleStoreIds,
      },
      stores: accessibleStores,
    };
  }

  /**
   * Rotates the refresh token on every use: the presented token is revoked
   * and a new one issued. If a token that was already revoked is presented
   * again, that's a signal of token theft (the old token was exfiltrated and
   * used after the legitimate client rotated past it) — every refresh token
   * for that user is revoked as a precaution.
   */
  async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const newRawToken = await this.issueRefreshToken(user.id);
    const newRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(newRawToken) },
    });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedByTokenId: newRecord?.id },
    });

    return { accessToken: this.signAccessToken(user), refreshToken: newRawToken };
  }

  /** Idempotent — always "succeeds" whether or not the token was still valid. */
  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Always resolves the same way regardless of whether the email exists, to avoid user enumeration. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return;

    const rawToken = generateOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    await this.mail.sendPasswordResetEmail(user.email, rawToken);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      // Force re-login on every device once the password changes.
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}

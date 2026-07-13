import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";

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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

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

    const payload = { sub: user.id, businessId: user.businessId, role: user.role };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "30m",
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      expiresIn: this.config.get<string>("JWT_REFRESH_TTL") ?? "30d",
    });

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

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: { sub: string; businessId: string; role: Role };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const accessToken = this.jwt.sign(
      { sub: user.id, businessId: user.businessId, role: user.role },
      {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "30m",
      },
    );
    return { accessToken };
  }
}

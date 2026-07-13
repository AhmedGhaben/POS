import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Permission } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions/permissions.service";
import { CreateUserDto } from "./dto/create-user.dto";

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private async findInBusiness(businessId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.businessId !== businessId) {
      throw new NotFoundException("User not found");
    }
    return user;
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

  async create(businessId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("Email already in use");
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        businessId,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
    });
    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  }
}

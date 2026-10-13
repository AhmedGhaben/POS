import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { countryConfig } from "../countries";

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAccessible(businessId: string, userId: string, role: Role) {
    if (role === Role.OWNER) {
      return this.prisma.store.findMany({ where: { businessId, isActive: true } });
    }
    return this.prisma.store.findMany({
      where: {
        businessId,
        isActive: true,
        storeUsers: { some: { userId } },
      },
    });
  }

  create(businessId: string, dto: CreateStoreDto) {
    return this.prisma.store.create({
      data: {
        businessId,
        name: dto.name,
        address: dto.address,
        timezone: dto.timezone ?? "UTC",
      },
    });
  }

  /**
   * Owner only (the route says so). The IVA regime decides how every
   * document is taxed, so a change is logged with who, when, from and to.
   */
  async update(businessId: string, storeId: string, dto: UpdateStoreDto, userId?: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.businessId !== businessId) {
      throw new NotFoundException("Store not found");
    }
    const config = countryConfig(dto.country ?? store.country);
    if (config && dto.province && !config.provinces.some((p) => p.code === dto.province)) {
      throw new BadRequestException("Unknown province");
    }
    const regimeChanged = dto.ivaRegime !== undefined && dto.ivaRegime !== store.ivaRegime;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.store.update({ where: { id: storeId }, data: dto });
      if (regimeChanged) {
        await tx.auditLog.create({
          data: {
            businessId,
            userId,
            action: "IVA_REGIME_CHANGED",
            entityType: "store",
            entityId: storeId,
            metadata: { from: store.ivaRegime, to: dto.ivaRegime },
          },
        });
      }
      return updated;
    });
  }

  async assignUser(businessId: string, storeId: string, userId: string) {
    const [store, targetUser] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!store || store.businessId !== businessId) {
      throw new NotFoundException("Store not found");
    }
    if (!targetUser || targetUser.businessId !== businessId) {
      throw new NotFoundException("User not found");
    }

    return this.prisma.storeUser.upsert({
      where: { userId_storeId: { userId, storeId } },
      create: { userId, storeId },
      update: {},
    });
  }
}

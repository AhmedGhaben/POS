import { Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateStoreDto } from "./dto/create-store.dto";

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

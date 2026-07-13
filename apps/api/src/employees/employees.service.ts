import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.employee.findMany({
      where: { businessId },
      include: { store: true, user: { select: { id: true, email: true, role: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
  }

  async create(businessId: string, dto: CreateEmployeeDto) {
    if (dto.storeId) {
      const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!store || store.businessId !== businessId) {
        throw new NotFoundException("Store not found");
      }
    }
    if (dto.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
      if (!user || user.businessId !== businessId) {
        throw new NotFoundException("User not found");
      }
      const existing = await this.prisma.employee.findUnique({ where: { userId: dto.userId } });
      if (existing) {
        throw new ConflictException("That user already has an employee profile");
      }
    }

    return this.prisma.employee.create({
      data: {
        businessId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        position: dto.position,
        phone: dto.phone,
        email: dto.email,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
        wage: dto.wage,
        storeId: dto.storeId,
        userId: dto.userId,
      },
    });
  }
}

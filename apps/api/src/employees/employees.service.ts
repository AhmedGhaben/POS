import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { StaffLoginDto } from "../users/dto/staff-login.dto";
import { CreateEmployeeDto } from "./dto/create-employee.dto";

const EMPLOYEE_INCLUDE = {
  store: true,
  user: {
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      storeUsers: { select: { storeId: true } },
    },
  },
} satisfies Prisma.EmployeeInclude;

type EmployeeWithUser = Prisma.EmployeeGetPayload<{ include: typeof EMPLOYEE_INCLUDE }>;

/** Flattens `user.storeUsers` into `user.storeIds` for the web app. */
function toEmployeeResponse(employee: EmployeeWithUser) {
  const { user, ...rest } = employee;
  if (!user) return { ...rest, user: null };
  const { storeUsers, ...userRest } = user;
  return { ...rest, user: { ...userRest, storeIds: storeUsers.map((su) => su.storeId) } };
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async findAll(businessId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { businessId },
      include: EMPLOYEE_INCLUDE,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    return employees.map(toEmployeeResponse);
  }

  async create(businessId: string, actorRole: Role, dto: CreateEmployeeDto) {
    if (dto.login && actorRole !== Role.OWNER) {
      throw new ForbiddenException("Only the owner can create logins");
    }
    if (dto.login && dto.userId) {
      throw new BadRequestException("Provide either userId or login, not both");
    }
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

    const login = dto.login ? await this.usersService.prepareStaffLogin(businessId, dto.login) : null;

    const { employee, inviteToken } = await this.prisma.$transaction(async (tx) => {
      const created = login
        ? await this.usersService.createStaffLoginInTx(tx, businessId, dto, login)
        : null;
      const employee = await tx.employee.create({
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
          userId: created?.userId ?? dto.userId,
        },
        include: EMPLOYEE_INCLUDE,
      });
      return { employee, inviteToken: created?.inviteToken ?? null };
    });

    if (inviteToken && employee.userId) {
      await this.usersService.sendStaffInvite(businessId, employee.userId, inviteToken);
    }
    return toEmployeeResponse(employee);
  }

  async createLogin(businessId: string, employeeId: string, dto: StaffLoginDto) {
    const existing = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!existing || existing.businessId !== businessId) {
      throw new NotFoundException("Employee not found");
    }
    if (existing.userId) {
      throw new ConflictException("This employee already has a login");
    }

    const login = await this.usersService.prepareStaffLogin(businessId, dto);
    const { employee, inviteToken } = await this.prisma.$transaction(async (tx) => {
      const created = await this.usersService.createStaffLoginInTx(tx, businessId, existing, login);
      const employee = await tx.employee.update({
        where: { id: employeeId },
        data: { userId: created.userId },
        include: EMPLOYEE_INCLUDE,
      });
      return { employee, inviteToken: created.inviteToken };
    });

    if (inviteToken) {
      await this.usersService.sendStaffInvite(businessId, employee.userId!, inviteToken);
    }
    return toEmployeeResponse(employee);
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role, SaleStatus } from "@prisma/client";
import { CustomerAccountsService } from "../accounts/customer-accounts.service";
import { availableCredit } from "../accounts/account-math";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCustomerDto, UpdateCustomerDto } from "./dto/create-customer.dto";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: CustomerAccountsService,
  ) {}

  /** Customers by name; with balances (what each owes on credit) when asked. */
  async findAll(businessId: string, search?: string, withBalance = false) {
    const customers = await this.prisma.customer.findMany({
      where: {
        businessId,
        // "Consumidor Final" is what a sale gets when nobody is chosen.
        isFinalConsumer: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { taxId: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    if (!withBalance) return customers;
    const balances = await this.accounts.balances(businessId, customers.map((c) => c.id));
    return customers.map((c) => ({ ...c, balance: balances.get(c.id)!.toFixed(2) }));
  }

  /** Details, completed purchases (count, total, last date), the last 5 sales and the account. */
  async card(businessId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, businessId } });
    if (!customer) throw new NotFoundException("Customer not found");
    const completed = { customerId: id, status: SaleStatus.COMPLETED };
    const [totals, recent, balances] = await Promise.all([
      this.prisma.sale.aggregate({ where: completed, _count: true, _sum: { total: true }, _max: { createdAt: true } }),
      this.prisma.sale.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          receiptNumber: true,
          createdAt: true,
          total: true,
          status: true,
          fiscalDocuments: { where: { documentType: { in: ["FR", "FT"] } }, select: { documentNo: true }, take: 1 },
        },
      }),
      this.accounts.balances(businessId, [id]),
    ]);
    const balance = balances.get(id)!;
    return {
      customer,
      purchases: {
        count: totals._count,
        total: (totals._sum.total ?? new Prisma.Decimal(0)).toFixed(2),
        lastAt: totals._max.createdAt,
      },
      recent: recent.map(({ fiscalDocuments, ...s }) => ({ ...s, documentNo: fiscalDocuments[0]?.documentNo ?? null, total: s.total.toFixed(2) })),
      account: {
        creditLimit: customer.creditLimit?.toFixed(2) ?? null,
        balance: balance.toFixed(2),
        available: availableCredit(customer.creditLimit, balance)?.toFixed(2) ?? null,
      },
    };
  }

  create(user: AuthenticatedUser, dto: CreateCustomerDto) {
    this.checkCreditLimitChange(user, dto.creditLimit);
    return this.prisma.customer.create({
      data: {
        businessId: user.businessId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        city: dto.city,
        postalCode: dto.postalCode,
        province: dto.province,
        country: dto.country,
        taxId: dto.taxId,
        creditLimit: dto.creditLimit ?? null,
      },
    });
  }

  /** Edits a customer; Consumidor Final can't be changed. */
  async update(user: AuthenticatedUser, id: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id, businessId: user.businessId } });
    if (!customer) throw new NotFoundException("Customer not found");
    if (customer.isFinalConsumer) throw new BadRequestException("Consumidor Final can't be changed");
    this.checkCreditLimitChange(user, dto.creditLimit);
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        city: dto.city,
        postalCode: dto.postalCode,
        province: dto.province,
        country: dto.country,
        taxId: dto.taxId,
        ...(dto.creditLimit !== undefined ? { creditLimit: dto.creditLimit } : {}),
      },
    });
  }

  /** Only owners and managers decide who buys on credit. */
  private checkCreditLimitChange(user: AuthenticatedUser, creditLimit: number | null | undefined) {
    if (creditLimit !== undefined && user.role === Role.CASHIER) {
      throw new ForbiddenException("Only owners and managers set credit limits");
    }
  }
}

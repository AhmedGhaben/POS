import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { SupplierAccountsService } from "../accounts/supplier-accounts.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSupplierDto, UpdateSupplierDto } from "./dto/create-supplier.dto";

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: SupplierAccountsService,
  ) {}

  /** Suppliers by name, archived ones only when asked; with what is owed to each when asked. */
  async findAll(businessId: string, withBalance = false, includeArchived = false) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { businessId, ...(includeArchived ? {} : { isActive: true }) },
      orderBy: { name: "asc" },
    });
    if (!withBalance) return suppliers;
    const balances = await this.accounts.balances(businessId, suppliers.map((s) => s.id));
    return suppliers.map((s) => ({ ...s, balance: balances.get(s.id)!.toFixed(2) }));
  }

  create(businessId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: { businessId, ...dto } });
  }

  async update(businessId: string, id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, businessId }, select: { id: true } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  /**
   * Only a supplier with no purchases or payments can be deleted; one with
   * history is archived instead (PATCH isActive: false), so reports and
   * SAF-T keep it.
   */
  async remove(businessId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, businessId },
      select: { id: true, _count: { select: { purchases: true, payments: true } } },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");
    if (supplier._count.purchases > 0 || supplier._count.payments > 0) {
      throw new ConflictException("This supplier has purchases or payments. Archive it instead.");
    }
    await this.prisma.supplier.delete({ where: { id } });
  }
}

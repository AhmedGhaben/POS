import { Injectable, NotFoundException } from "@nestjs/common";
import { SupplierAccountsService } from "../accounts/supplier-accounts.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSupplierDto, UpdateSupplierDto } from "./dto/create-supplier.dto";

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: SupplierAccountsService,
  ) {}

  /** Suppliers by name; with what is owed to each when asked. */
  async findAll(businessId: string, withBalance = false) {
    const suppliers = await this.prisma.supplier.findMany({ where: { businessId }, orderBy: { name: "asc" } });
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
}

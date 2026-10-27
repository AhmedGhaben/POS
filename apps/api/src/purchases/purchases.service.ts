import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PurchasePaymentStatus } from "@prisma/client";
import { storeDateRange } from "../common/store-period";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePurchaseDto } from "./dto/create-purchase.dto";
import { recordMovement } from "../stock/stock";
import { unitDecimals } from "../sales/pricing";
import { SupplierAccountsService } from "../accounts/supplier-accounts.service";
import { countryConfig } from "../countries";
import { fiscalTimeZone } from "../fiscal/fiscal-format";
import { localDate } from "../fiscal/saft/period";
import { purchaseTaxes } from "./purchase-taxes";

const PURCHASE_INCLUDE = { lineItems: { include: { product: true } }, supplier: true, taxLines: true } satisfies Prisma.PurchaseInclude;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: SupplierAccountsService,
  ) {}

  findByStore(storeId: string) {
    return this.prisma.purchase.findMany({
      where: { storeId },
      include: PURCHASE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /**
   * A store's purchases, newest first, filtered by supplier, payment
   * status, the supplier's document number or ours, and calendar dates in
   * the store's time zone.
   */
  async list(storeId: string, f: { supplierId?: string; paymentStatus?: string; search?: string; from?: string; to?: string; take: number; skip: number }) {
    const createdAt = await storeDateRange(this.prisma, storeId, f.from, f.to);
    const where: Prisma.PurchaseWhereInput = {
      storeId,
      ...(f.supplierId ? { supplierId: f.supplierId } : {}),
      ...(f.paymentStatus && ["UNPAID", "PARTIAL", "PAID"].includes(f.paymentStatus) ? { paymentStatus: f.paymentStatus as PurchasePaymentStatus, status: { not: "CANCELLED" } } : {}),
      ...(f.search
        ? { OR: [{ purchaseNumber: { contains: f.search, mode: "insensitive" } }, { supplierDocNo: { contains: f.search, mode: "insensitive" } }, { supplier: { name: { contains: f.search, mode: "insensitive" } } }] }
        : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({ where, include: PURCHASE_INCLUDE, orderBy: { createdAt: "desc" }, take: f.take, skip: f.skip }),
      this.prisma.purchase.count({ where }),
    ]);
    return { items, total };
  }

  async get(businessId: string, id: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, store: { businessId } },
      include: { ...PURCHASE_INCLUDE, store: { select: { id: true, name: true } }, createdBy: { select: { id: true, firstName: true, lastName: true } }, allocations: { where: { payment: { cancelledAt: null } }, include: { payment: { select: { paidOn: true, method: true, reference: true } } } } },
    });
    if (!purchase) throw new NotFoundException("Purchase not found");
    return purchase;
  }

  async create(businessId: string, createdById: string, dto: CreatePurchaseDto) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || supplier.businessId !== businessId) {
      throw new NotFoundException("Supplier not found");
    }
    if (!supplier.isActive) {
      throw new BadRequestException("This supplier is archived. Restore it to buy from it again.");
    }

    const productIds = dto.lineItems.map((li) => li.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, businessId },
    });
    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException("One or more products were not found");
    }

    const productById = new Map(products.map((p) => [p.id, p]));
    let subtotal = new Prisma.Decimal(0);
    const lineItemsData = dto.lineItems.map((li) => {
      const product = productById.get(li.productId)!;
      if (unitDecimals(product.unit) === 0 && !Number.isInteger(li.quantity)) {
        throw new BadRequestException(`"${product.name}" is sold in whole units`);
      }
      const lineTotal = new Prisma.Decimal(li.unitCost).mul(li.quantity).toDecimalPlaces(2);
      subtotal = subtotal.add(lineTotal);
      return {
        productId: li.productId,
        quantity: li.quantity,
        unitCost: li.unitCost,
        lineTotal,
      };
    });
    const purchaseNumber = `PO-${dto.storeId.slice(-4).toUpperCase()}-${Date.now()}`;
    // Unit costs are without IVA; the IVA is per rate, as on the supplier's document.
    const taxes = purchaseTaxes(subtotal, dto.taxLines, dto.withholdingPercent);
    const total = subtotal.add(taxes.taxTotal);
    const payable = total.sub(taxes.withholdingAmount);
    const paid = dto.payment ? new Prisma.Decimal(dto.payment.amount) : null;
    if (paid?.gt(payable)) throw new BadRequestException("The payment is more than what is owed");
    const doc = dto.supplierDocument;
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: dto.storeId }, select: { timezone: true, country: true } });
    const today = localDate(new Date(), fiscalTimeZone(store.timezone, countryConfig(store.country)?.timeZone));

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          storeId: dto.storeId,
          supplierId: dto.supplierId,
          createdById,
          purchaseNumber,
          subtotal,
          taxTotal: taxes.taxTotal,
          total,
          status: "RECEIVED",
          supplierDocType: doc?.type ?? null,
          supplierDocNo: doc?.number.trim() ?? null,
          supplierDocDate: doc ? new Date(`${doc.date}T00:00:00Z`) : null,
          supplierDocHash: doc ? doc.hash || "0" : null,
          withholdingPercent: dto.withholdingPercent ?? null,
          withholdingAmount: taxes.withholdingAmount,
          paymentStatus: payable.lte(0) ? "PAID" : "UNPAID",
          lineItems: { create: lineItemsData },
          taxLines: { create: taxes.lines },
        },
        include: PURCHASE_INCLUDE,
      });
      // Bought services (and other untracked items) don't add stock. What
      // was paid re-averages the store's cost.
      for (const li of dto.lineItems) {
        const product = productById.get(li.productId)!;
        if (!product.trackStock) continue;
        await recordMovement(tx, {
          storeId: dto.storeId,
          product,
          type: "PURCHASE",
          quantity: li.quantity,
          unitCost: li.unitCost,
          purchaseId: purchase.id,
          userId: createdById,
        });
      }
      // Paid (all or part) when it arrived.
      if (paid) {
        await this.accounts.record(tx, {
          businessId,
          supplierId: dto.supplierId,
          userId: createdById,
          amount: paid,
          method: dto.payment!.method,
          reference: dto.payment!.reference,
          paidOn: today,
          allocations: [{ id: purchase.id, amount: paid }],
        });
        return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: PURCHASE_INCLUDE });
      }
      return purchase;
    });
  }
}

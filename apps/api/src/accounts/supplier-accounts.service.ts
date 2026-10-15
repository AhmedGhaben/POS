import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma, PurchaseStatus } from "@prisma/client";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { countryConfig } from "../countries";
import { fiscalTimeZone } from "../fiscal/fiscal-format";
import { dateColumnValue, localDate, parseCalendarDate } from "../fiscal/saft/period";
import { PrismaService } from "../prisma/prisma.service";
import { allocateOldestFirst, checkAllocations, openAmount, paymentStatus, type Allocation, type OpenItem } from "./account-math";
import { CreateSupplierPaymentDto } from "./dto/payments.dto";

type Db = PrismaService | Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);

export interface PurchaseOnAccount extends OpenItem {
  supplierId: string;
  purchaseNumber: string;
  supplierDocNo: string | null;
  date: string;
  /** What's owed to the supplier: the total less IVA cativo (withheld for the State). */
  payable: Prisma.Decimal;
  paid: Prisma.Decimal;
  paymentStatus: string;
}

const PAYMENT_INCLUDE = {
  allocations: { select: { amount: true, purchase: { select: { id: true, purchaseNumber: true, supplierDocNo: true } } } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.SupplierPaymentInclude;

/** What a purchase owes the supplier: its total less the IVA withheld (cativo). */
export function payableOf(p: { total: Prisma.Decimal; withholdingAmount: Prisma.Decimal }): Prisma.Decimal {
  return p.total.sub(p.withholdingAmount);
}

/**
 * Suppliers' accounts (docs/plans/ANGOLA.md, phase 4): what each purchase
 * still owes, and payments set against them (oldest first unless chosen).
 * A payment made by mistake is cancelled, which re-opens what it paid.
 */
@Injectable()
export class SupplierAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async purchases(db: Db, businessId: string, supplierIds: string[], { openOnly = true } = {}): Promise<PurchaseOnAccount[]> {
    const rows = await db.purchase.findMany({
      where: { supplierId: { in: supplierIds }, supplier: { businessId }, status: { not: PurchaseStatus.CANCELLED } },
      orderBy: { createdAt: "asc" },
      select: { id: true, supplierId: true, purchaseNumber: true, supplierDocNo: true, supplierDocDate: true, createdAt: true, total: true, withholdingAmount: true, paidAmount: true, paymentStatus: true },
    });
    return rows
      .map((p) => {
        const payable = payableOf(p);
        const date = (p.supplierDocDate ?? p.createdAt).toISOString().slice(0, 10);
        return {
          id: p.id,
          supplierId: p.supplierId,
          purchaseNumber: p.purchaseNumber,
          supplierDocNo: p.supplierDocNo,
          date,
          sortKey: `${date}|${p.createdAt.toISOString()}`,
          payable,
          paid: p.paidAmount,
          paymentStatus: p.paymentStatus,
          open: openAmount(payable, p.paidAmount),
        };
      })
      .filter((p) => !openOnly || p.open.gt(0));
  }

  async balances(businessId: string, supplierIds: string[]): Promise<Map<string, Prisma.Decimal>> {
    const out = new Map<string, Prisma.Decimal>(supplierIds.map((id) => [id, ZERO]));
    for (const p of await this.purchases(this.prisma, businessId, supplierIds)) out.set(p.supplierId, out.get(p.supplierId)!.add(p.open));
    return out;
  }

  async account(businessId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, businessId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    const [purchases, payments] = await Promise.all([
      this.purchases(this.prisma, businessId, [supplierId], { openOnly: false }),
      this.prisma.supplierPayment.findMany({ where: { supplierId }, include: PAYMENT_INCLUDE, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], take: 50 }),
    ]);
    return {
      supplier,
      balance: purchases.reduce((s, p) => s.add(p.open), ZERO).toFixed(2),
      purchases: purchases
        .reverse()
        .slice(0, 100)
        .map((p) => ({ id: p.id, purchaseNumber: p.purchaseNumber, supplierDocNo: p.supplierDocNo, date: p.date, payable: p.payable.toFixed(2), paid: p.paid.toFixed(2), open: p.open.toFixed(2), paymentStatus: p.paymentStatus })),
      payments: payments.map(serializePayment),
    };
  }

  /** Records a payment to a supplier and sets it against their purchases. */
  async pay(user: AuthenticatedUser, dto: CreateSupplierPaymentDto) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, businessId: user.businessId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    const paidOn = dto.paidOn ? parseCalendarDate(dto.paidOn.slice(0, 10)) : await this.today(user.businessId);
    const amount = new Prisma.Decimal(dto.amount);
    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM suppliers WHERE id = ${supplier.id} FOR UPDATE`;
      const open = await this.purchases(tx, user.businessId, [supplier.id]);
      const allocations = dto.allocations?.length
        ? checkAllocations(open, dto.allocations.map((a) => ({ id: a.purchaseId, amount: new Prisma.Decimal(a.amount) })), amount)
        : allocateOldestFirst(open, amount);
      return this.record(tx, { businessId: user.businessId, supplierId: supplier.id, userId: user.userId, amount, method: dto.method, reference: dto.reference, note: dto.note, paidOn, allocations });
    });
    return serializePayment(payment);
  }

  /** Writes a payment and its allocations, and updates what each purchase has been paid. */
  async record(
    tx: Prisma.TransactionClient,
    input: { businessId: string; supplierId: string; userId: string; amount: Prisma.Decimal; method: PaymentMethod; reference?: string | null; note?: string | null; paidOn: string; allocations: Allocation[] },
  ) {
    const payment = await tx.supplierPayment.create({
      data: {
        businessId: input.businessId,
        supplierId: input.supplierId,
        amount: input.amount,
        method: input.method,
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        paidOn: dateColumnValue(input.paidOn),
        createdById: input.userId,
        allocations: { create: input.allocations.map((a) => ({ purchaseId: a.id, amount: a.amount })) },
      },
      include: PAYMENT_INCLUDE,
    });
    for (const a of input.allocations) await this.refreshPaid(tx, a.id);
    return payment;
  }

  /** Cancels a payment made by mistake: what it paid is owed again. */
  async cancel(user: AuthenticatedUser, paymentId: string, reason: string) {
    const payment = await this.prisma.supplierPayment.findFirst({ where: { id: paymentId, businessId: user.businessId }, include: { allocations: true } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.cancelledAt) throw new BadRequestException("This payment was already cancelled");
    await this.prisma.$transaction(async (tx) => {
      await tx.supplierPayment.update({ where: { id: payment.id }, data: { cancelledAt: new Date(), cancelledById: user.userId, cancelReason: reason.trim() } });
      for (const a of payment.allocations) await this.refreshPaid(tx, a.purchaseId);
    });
    return serializePayment(await this.prisma.supplierPayment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE }));
  }

  /** A purchase's paidAmount and status from its live (not cancelled) allocations. */
  private async refreshPaid(tx: Prisma.TransactionClient, purchaseId: string) {
    const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId }, select: { total: true, withholdingAmount: true } });
    const paid = await tx.supplierPaymentAllocation.aggregate({ where: { purchaseId, payment: { cancelledAt: null } }, _sum: { amount: true } });
    const paidAmount = paid._sum.amount ?? ZERO;
    await tx.purchase.update({ where: { id: purchaseId }, data: { paidAmount, paymentStatus: paymentStatus(payableOf(purchase), paidAmount) } });
  }

  private async today(businessId: string): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { country: true } });
    return localDate(new Date(), fiscalTimeZone(null, countryConfig(business.country)?.timeZone));
  }
}

function serializePayment(p: Prisma.SupplierPaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>) {
  return {
    id: p.id,
    supplierId: p.supplierId,
    amount: p.amount.toFixed(2),
    method: p.method,
    reference: p.reference,
    note: p.note,
    paidOn: p.paidOn.toISOString().slice(0, 10),
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    cancelledAt: p.cancelledAt,
    cancelReason: p.cancelReason,
    allocations: p.allocations.map((a) => ({ amount: a.amount.toFixed(2), purchaseId: a.purchase.id, purchaseNumber: a.purchase.purchaseNumber, supplierDocNo: a.purchase.supplierDocNo })),
  };
}

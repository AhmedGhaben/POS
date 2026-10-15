import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma, Role, ShiftStatus } from "@prisma/client";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { buyerOf, FiscalService } from "../fiscal/fiscal.service";
import { PrismaService } from "../prisma/prisma.service";
import { allocateOldestFirst, availableCredit, checkAllocations, openAmount, totalOpen, type OpenItem } from "./account-math";
import { CreateCustomerPaymentDto } from "./dto/payments.dto";

type Db = PrismaService | Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const sum = (values: Prisma.Decimal[]) => values.reduce((a, v) => a.add(v), ZERO);

export interface InvoiceOnAccount extends OpenItem {
  documentNo: string;
  date: string;
  storeId: string;
  grossTotal: Prisma.Decimal;
  paid: Prisma.Decimal;
  credited: Prisma.Decimal;
}

const PAYMENT_INCLUDE = {
  document: { select: { id: true, documentNo: true, status: true, statusReason: true, hashExcerpt: true, hashControl: true, invoiceDate: true, systemEntryDate: true, seller: true, buyerName: true, buyerTaxId: true } },
  allocations: { select: { amount: true, document: { select: { id: true, documentNo: true, invoiceDate: true, grossTotal: true } } } },
  receivedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.CustomerPaymentInclude;

/**
 * Customers' accounts (docs/plans/ANGOLA.md, phase 4): what they owe from
 * sales on credit (Facturas, FT), the receipts (RC) for what they paid, and
 * their credit limit. An invoice's open amount is its total less the
 * receipts set against it and the credit notes (returns) issued for it;
 * annulled documents count for nothing.
 */
@Injectable()
export class CustomerAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscal: FiscalService,
  ) {}

  /** Every invoice still open (or all of them), oldest first, with what was paid and credited. */
  async invoices(db: Db, businessId: string, customerIds: string[], { openOnly = true } = {}): Promise<(InvoiceOnAccount & { customerId: string })[]> {
    const rows = await db.fiscalDocument.findMany({
      where: { businessId, customerId: { in: customerIds }, documentType: "FT", status: "N" },
      orderBy: [{ invoiceDate: "asc" }, { systemEntryDate: "asc" }],
      select: {
        id: true,
        documentNo: true,
        invoiceDate: true,
        systemEntryDate: true,
        storeId: true,
        customerId: true,
        grossTotal: true,
        settledBy: { where: { payment: { document: { status: "N" } } }, select: { amount: true } },
        referencingDocuments: { where: { documentType: "NC", status: "N" }, select: { grossTotal: true } },
      },
    });
    return rows
      .map((d) => {
        const paid = sum(d.settledBy.map((a) => a.amount));
        const credited = sum(d.referencingDocuments.map((n) => n.grossTotal));
        const date = d.invoiceDate.toISOString().slice(0, 10);
        return {
          id: d.id,
          customerId: d.customerId!,
          documentNo: d.documentNo,
          date,
          storeId: d.storeId,
          sortKey: `${date}|${d.systemEntryDate.toISOString()}`,
          grossTotal: d.grossTotal,
          paid,
          credited,
          open: openAmount(d.grossTotal, paid, credited),
        };
      })
      .filter((i) => !openOnly || i.open.gt(0));
  }

  /** What's still owed on a sale's invoice (FT); zero when the sale wasn't on credit. */
  async openOnSale(db: Db, saleId: string): Promise<Prisma.Decimal> {
    const ft = await db.fiscalDocument.findFirst({ where: { saleId, documentType: "FT", status: "N" }, select: { businessId: true, customerId: true, id: true } });
    if (!ft?.customerId) return ZERO;
    const invoice = (await this.invoices(db, ft.businessId, [ft.customerId], { openOnly: false })).find((i) => i.id === ft.id);
    return invoice?.open ?? ZERO;
  }

  /** What each customer owes now. */
  async balances(businessId: string, customerIds: string[]): Promise<Map<string, Prisma.Decimal>> {
    const out = new Map<string, Prisma.Decimal>(customerIds.map((id) => [id, ZERO]));
    for (const i of await this.invoices(this.prisma, businessId, customerIds)) out.set(i.customerId, out.get(i.customerId)!.add(i.open));
    return out;
  }

  /**
   * Inside a sale's transaction: may this customer take `amount` more on
   * credit? Locks the customer so two tills can't both use the last of the
   * limit. Consumidor Final and customers without a limit can't.
   */
  async checkCredit(tx: Prisma.TransactionClient, businessId: string, customerId: string, amount: Prisma.Decimal) {
    await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`;
    const customer = await tx.customer.findFirst({ where: { id: customerId, businessId }, select: { isFinalConsumer: true, creditLimit: true } });
    if (!customer || customer.isFinalConsumer) throw new BadRequestException("Choose the customer to sell on credit to");
    if (customer.creditLimit === null) throw new BadRequestException("This customer has no credit limit. Set one on the Customers page first.");
    const balance = totalOpen(await this.invoices(tx, businessId, [customerId]));
    const available = availableCredit(customer.creditLimit, balance)!;
    if (amount.gt(available)) {
      throw new BadRequestException(`That's more than this customer's credit allows (${available.toFixed(2)} left)`);
    }
  }

  /** The customer's account: limit, balance, open invoices and the latest receipts. */
  async account(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) throw new NotFoundException("Customer not found");
    const [invoices, payments] = await Promise.all([
      this.invoices(this.prisma, businessId, [customerId], { openOnly: false }),
      this.prisma.customerPayment.findMany({ where: { customerId }, include: PAYMENT_INCLUDE, orderBy: { receivedAt: "desc" }, take: 50 }),
    ]);
    const balance = sum(invoices.map((i) => i.open));
    return {
      customer,
      creditLimit: customer.creditLimit?.toFixed(2) ?? null,
      balance: balance.toFixed(2),
      available: availableCredit(customer.creditLimit, balance)?.toFixed(2) ?? null,
      invoices: invoices
        .reverse()
        .slice(0, 100)
        .map((i) => ({ id: i.id, documentNo: i.documentNo, date: i.date, storeId: i.storeId, grossTotal: i.grossTotal.toFixed(2), paid: i.paid.toFixed(2), credited: i.credited.toFixed(2), open: i.open.toFixed(2) })),
      payments: payments.map(serializePayment),
    };
  }

  /**
   * Records money a customer paid and issues its receipt (RC), set against
   * their open invoices (oldest first unless chosen). Cash goes into a
   * till's drawer, so it needs the open shift of the person taking it;
   * cashiers always take payments in their shift.
   */
  async receive(user: AuthenticatedUser, dto: CreateCustomerPaymentDto, at = new Date()) {
    if (dto.clientId) {
      const existing = await this.prisma.customerPayment.findUnique({ where: { storeId_clientId: { storeId: dto.storeId, clientId: dto.clientId } }, include: PAYMENT_INCLUDE });
      if (existing) return serializePayment(existing);
    }
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, businessId: user.businessId } });
    if (!customer) throw new NotFoundException("Customer not found");
    if (customer.isFinalConsumer) throw new BadRequestException("Consumidor Final has no account");

    const shift = dto.shiftClientId
      ? await this.prisma.shift.findUnique({
          where: { storeId_clientId: { storeId: dto.storeId, clientId: dto.shiftClientId } },
          select: { id: true, status: true, openedById: true, terminal: { select: { id: true, code: true } } },
        })
      : null;
    if (dto.shiftClientId && (!shift || shift.status !== ShiftStatus.OPEN)) throw new BadRequestException("Open a shift before taking payments");
    if (shift && shift.openedById !== user.userId) throw new ForbiddenException("This shift belongs to someone else");
    if (!shift && (dto.method === PaymentMethod.CASH || user.role === Role.CASHIER)) {
      throw new BadRequestException("Cash goes into a till: take it in your open shift");
    }

    const issuer = await this.fiscal.issuer(user.businessId, dto.storeId);
    if (!issuer.config) throw new BadRequestException("Sales on credit and receipts need a store that issues fiscal documents");
    const amount = new Prisma.Decimal(dto.amount);
    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id} FOR UPDATE`;
      const open = await this.invoices(tx, user.businessId, [customer.id]);
      const allocations = dto.allocations?.length
        ? checkAllocations(open, dto.allocations.map((a) => ({ id: a.documentId, amount: new Prisma.Decimal(a.amount) })), amount)
        : allocateOldestFirst(open, amount);
      const receipt = await this.fiscal.issueReceipt(tx, { issuer, terminal: shift?.terminal ?? null, userId: user.userId, buyer: buyerOf(customer), amount, method: dto.method, at });
      return tx.customerPayment.create({
        data: {
          businessId: user.businessId,
          storeId: dto.storeId,
          customerId: customer.id,
          documentId: receipt.id,
          amount,
          method: dto.method,
          reference: dto.reference?.trim() || null,
          shiftId: shift?.id ?? null,
          receivedById: user.userId,
          clientId: dto.clientId ?? null,
          receivedAt: at,
          allocations: { create: allocations.map((a) => ({ documentId: a.id, amount: a.amount })) },
        },
        include: PAYMENT_INCLUDE,
      });
    });
    return serializePayment(payment);
  }

  /**
   * What was paid at the till with a sale on credit: a receipt for it, set
   * against the sale's own invoice. Inside the sale's transaction.
   */
  async receiveWithSale(
    tx: Prisma.TransactionClient,
    input: { businessId: string; storeId: string; saleId: string; invoiceId: string; customer: Parameters<typeof buyerOf>[0]; payments: { method: PaymentMethod; amount: Prisma.Decimal }[]; shiftId: string | null; terminal: { id: string; code: string } | null; userId: string; at: Date },
  ) {
    const issuer = await this.fiscal.issuer(input.businessId, input.storeId);
    for (const p of input.payments) {
      const receipt = await this.fiscal.issueReceipt(tx, { issuer, terminal: input.terminal, userId: input.userId, buyer: buyerOf(input.customer), amount: p.amount, method: p.method, at: input.at });
      await tx.customerPayment.create({
        data: {
          businessId: input.businessId,
          storeId: input.storeId,
          customerId: input.customer.id,
          documentId: receipt.id,
          amount: p.amount,
          method: p.method,
          saleId: input.saleId,
          shiftId: input.shiftId,
          receivedById: input.userId,
          receivedAt: input.at,
          allocations: { create: [{ documentId: input.invoiceId, amount: p.amount }] },
        },
      });
    }
  }

  /** Annuls a receipt (status A): the invoices it paid are open again. */
  async annul(user: AuthenticatedUser, paymentId: string, reason: string) {
    const payment = await this.prisma.customerPayment.findFirst({ where: { id: paymentId, businessId: user.businessId }, select: { id: true, documentId: true, saleId: true } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.saleId) throw new BadRequestException("This was paid with a sale: cancel the sale instead");
    await this.prisma.$transaction((tx) => this.fiscal.annulReceipt(tx, payment.documentId, reason, user.userId));
    return serializePayment(await this.prisma.customerPayment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE }));
  }

  async getPayment(businessId: string, id: string) {
    const payment = await this.prisma.customerPayment.findFirst({ where: { id, businessId }, include: PAYMENT_INCLUDE });
    if (!payment) throw new NotFoundException("Payment not found");
    return serializePayment(payment);
  }
}

function serializePayment(p: Prisma.CustomerPaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>) {
  return {
    id: p.id,
    storeId: p.storeId,
    customerId: p.customerId,
    amount: p.amount.toFixed(2),
    method: p.method,
    reference: p.reference,
    saleId: p.saleId,
    receivedAt: p.receivedAt,
    receivedBy: p.receivedBy,
    document: p.document,
    allocations: p.allocations.map((a) => ({ amount: a.amount.toFixed(2), documentId: a.document.id, documentNo: a.document.documentNo, invoiceDate: a.document.invoiceDate, grossTotal: a.document.grossTotal.toFixed(2) })),
  };
}

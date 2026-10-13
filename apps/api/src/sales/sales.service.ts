import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Permission, Prisma, PaymentMethod, Role, SaleStatus, ShiftStatus } from "@prisma/client";
import { OverridesService } from "../overrides/overrides.service";
import { finalConsumerData } from "../customers/final-consumer";
import { PermissionsService } from "../common/permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { emailLanguage } from "../common/i18n/languages";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { VoidSaleDto } from "./dto/void-sale.dto";
import { priceSaleCents, type DiscountInput, type PricedSale } from "./pricing";

/** How far an offline sale's clock may run ahead of the server's. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
/** After this, a sale is undone with a return instead of being cancelled. */
const VOID_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Receipt number for a sale rung up offline. The till prints the same value
 * before the server has seen the sale (keep in step with
 * apps/web/src/features/pos/offline-sale.ts), so a later return can find the
 * sale by what's on the paper.
 */
export function offlineReceiptNumber(storeId: string, clientId: string): string {
  const store = storeId.slice(-4).toUpperCase();
  const client = clientId.replace(/-/g, "").slice(0, 12).toUpperCase();
  return `OFF-${store}-${client}`;
}

function isUniqueViolation(error: unknown, field: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta?.target ?? "").includes(field)
  );
}

const fromCents = (cents: number) => new Prisma.Decimal(cents).div(100);

/** A discount worth recording, or null. */
function given(discount: DiscountInput | undefined): DiscountInput | null {
  return discount && discount.value > 0 ? discount : null;
}

function clampToNow(date: Date): Date {
  const now = Date.now();
  if (Number.isNaN(date.getTime()) || date.getTime() > now + MAX_CLOCK_SKEW_MS) {
    return new Date(now);
  }
  return date;
}

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

const SALE_INCLUDE = {
  lineItems: { include: { product: true } },
  payments: true,
  cashier: PERSON,
  voidedBy: PERSON,
} satisfies Prisma.SaleInclude;

/**
 * Shows each line's product under the name and SKU it was sold with, so
 * receipts, invoices and returns read the same after a product is renamed.
 */
export function withSoldNames<
  T extends { lineItems: { productName: string; productSku: string; product: { name: string; sku: string } }[] },
>(sale: T): T {
  return {
    ...sale,
    lineItems: sale.lineItems.map((li) => ({
      ...li,
      product: { ...li.product, name: li.productName, sku: li.productSku },
    })),
  };
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly permissions: PermissionsService,
    private readonly overrides: OverridesService,
  ) {}

  async findByStore(storeId: string) {
    const sales = await this.prisma.sale.findMany({
      where: { storeId },
      include: SALE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return sales.map(withSoldNames);
  }

  async create(businessId: string, cashierId: string, dto: CreateSaleDto, role: Role = Role.CASHIER) {
    const offline = dto.offline;
    if (offline && !dto.clientId) {
      throw new BadRequestException("Offline sales need a clientId");
    }

    // A retry of a sale the server already has (e.g. the response was lost).
    if (dto.clientId) {
      const existing = await this.findByClientId(dto.storeId, dto.clientId);
      if (existing) return existing;
    }

    const productIds = dto.lineItems.map((li) => li.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, businessId },
    });
    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException("One or more products were not found");
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    for (const discount of [dto.discount, ...dto.lineItems.map((li) => li.discount)]) {
      if (discount?.type === "PERCENT" && discount.value > 100) {
        throw new BadRequestException("A percentage discount can't be more than 100%");
      }
    }

    // An offline sale records what already happened at the till, so it
    // keeps the price, tax and discounts the cashier gave even if they've
    // changed on the server since (or the cashier wasn't allowed to).
    // Online, a price other than the product's is a price change.
    const unitPrices = dto.lineItems.map((li) => {
      const product = productById.get(li.productId)!;
      return li.unitPrice !== undefined ? new Prisma.Decimal(li.unitPrice) : product.sellPrice;
    });
    const priceChanged = dto.lineItems.map((li, i) => !unitPrices[i].equals(productById.get(li.productId)!.sellPrice));
    const priced = priceSaleCents(
      dto.lineItems.map((li, i) => {
        const product = productById.get(li.productId)!;
        const taxRate = offline && li.taxRate !== undefined ? li.taxRate : Number(product.taxRate);
        return { unitPrice: Number(unitPrices[i]), quantity: li.quantity, taxRate, discount: given(li.discount) };
      }),
      given(dto.discount),
    );

    // What the cashier may not do alone needs a manager's approval, used
    // (once) inside the sale's transaction.
    const approvals: { permission: Permission; token: string }[] = [];
    if (!offline) {
      const needed: { permission: Permission; message: string }[] = [];
      if (priceChanged.some(Boolean) && !(await this.permissions.hasPermission(cashierId, role, Permission.CHANGE_PRICE))) {
        needed.push({ permission: Permission.CHANGE_PRICE, message: "Changing a price needs a manager's approval" });
      }
      if (priced.discountTotal > 0) {
        const need = await this.discountApproval(businessId, cashierId, role, priced);
        if (need) needed.push(need);
      }
      for (const { permission, message } of needed) {
        const token = dto.overrides?.find((o) => o.permission === permission)?.token;
        if (!token) {
          throw permission === Permission.DISCOUNT_ABOVE_LIMIT ? new BadRequestException(message) : new ForbiddenException(message);
        }
        approvals.push({ permission, token });
      }
    }

    const offlineApproved = (permission: Permission) =>
      !!offline && !!dto.offlineOverrides?.some((o) => o.permission === permission);
    const lineItemsData = dto.lineItems.map((li, i) => {
      const product = productById.get(li.productId)!;
      const line = priced.lines[i];
      const discount = given(li.discount);
      return {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        quantity: li.quantity,
        unitPrice: unitPrices[i],
        // A price the cashier changed (offline, only when a manager's approval came with it).
        originalUnitPrice: priceChanged[i] && (!offline || offlineApproved(Permission.CHANGE_PRICE)) ? product.sellPrice : null,
        taxAmount: fromCents(line.tax),
        discountType: discount?.type ?? null,
        discountValue: discount ? new Prisma.Decimal(discount.value) : null,
        lineDiscountAmount: fromCents(line.lineDiscount),
        discountAmount: fromCents(line.discount),
        lineTotal: fromCents(line.total),
      };
    });
    const saleDiscount = given(dto.discount);
    const subtotal = fromCents(priced.subtotal);
    const taxTotal = fromCents(priced.taxTotal);
    const total = fromCents(priced.total);
    const receiptNumber = offline
      ? offlineReceiptNumber(dto.storeId, dto.clientId!)
      : `${dto.storeId.slice(-4).toUpperCase()}-${Date.now()}`;

    const paymentsTotal = dto.payments.reduce(
      (sum, p) => sum.add(new Prisma.Decimal(p.amount)),
      new Prisma.Decimal(0),
    );
    if (paymentsTotal.sub(total).abs().gt(0.01)) {
      throw new BadRequestException("Payment amounts do not cover the total");
    }

    let amountTendered: Prisma.Decimal | null = null;
    let changeDue: Prisma.Decimal | null = null;
    const paymentsData = dto.payments.map((p) => {
      const amount = new Prisma.Decimal(p.amount);
      if (p.method !== PaymentMethod.CASH) {
        return { method: p.method, amount, tendered: null, change: null };
      }
      const tendered = p.tendered !== undefined ? new Prisma.Decimal(p.tendered) : amount;
      const change = tendered.sub(amount);
      if (change.lt(0)) {
        throw new BadRequestException("Tendered amount is less than the payment amount");
      }
      amountTendered = (amountTendered ?? new Prisma.Decimal(0)).add(tendered);
      changeDue = (changeDue ?? new Prisma.Decimal(0)).add(change);
      return { method: p.method, amount, tendered, change };
    });

    const terminalId = await this.resolveTerminal(businessId, dto.terminalId);
    // The shift was opened before this sale (the till uploads in order).
    const shift = await this.saleShift(dto, cashierId, terminalId);
    const customerId = dto.customerId || (await this.finalConsumerId(businessId));
    const createdAt = offline ? clampToNow(new Date(offline.createdAt)) : undefined;
    // Services and the like don't move stock.
    const stockLines = dto.lineItems.filter((li) => productById.get(li.productId)!.trackStock);

    let sale: Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;
    try {
      sale = await this.prisma.$transaction(async (tx) => {
        for (const approval of approvals) {
          await this.overrides.consume(approval.token, { userId: cashierId, businessId }, approval.permission, tx);
        }
        if (offline) {
          // The goods already left the shop: record the sale even if the
          // server's stock count says there weren't enough.
          for (const li of stockLines) {
            await tx.inventoryItem.upsert({
              where: { storeId_productId: { storeId: dto.storeId, productId: li.productId } },
              update: { quantity: { decrement: li.quantity } },
              create: { storeId: dto.storeId, productId: li.productId, quantity: -li.quantity },
            });
          }
        } else {
          for (const li of stockLines) {
            const inventoryItem = await tx.inventoryItem.findUnique({
              where: { storeId_productId: { storeId: dto.storeId, productId: li.productId } },
            });
            if (!inventoryItem || inventoryItem.quantity < li.quantity) {
              const product = productById.get(li.productId)!;
              throw new BadRequestException(`Insufficient stock for "${product.name}"`);
            }
          }

          for (const li of stockLines) {
            await tx.inventoryItem.update({
              where: { storeId_productId: { storeId: dto.storeId, productId: li.productId } },
              data: { quantity: { decrement: li.quantity } },
            });
          }
        }

        if (terminalId) {
          await tx.terminal.update({ where: { id: terminalId }, data: { lastSeenAt: new Date() } });
        }

        return tx.sale.create({
          data: {
            storeId: dto.storeId,
            cashierId,
            customerId,
            receiptNumber,
            subtotal,
            taxTotal,
            discountTotal: fromCents(priced.discountTotal),
            discountType: saleDiscount?.type ?? null,
            discountValue: saleDiscount ? new Prisma.Decimal(saleDiscount.value) : null,
            saleDiscountAmount: fromCents(priced.saleDiscount),
            total,
            paymentMethod: dto.payments[0].method,
            amountTendered,
            changeDue,
            clientId: dto.clientId,
            createdOffline: !!offline,
            terminalId,
            shiftId: shift?.id ?? null,
            ...(createdAt ? { createdAt } : {}),
            lineItems: { create: lineItemsData },
            payments: { create: paymentsData },
          },
          include: SALE_INCLUDE,
        });
      });
    } catch (error) {
      // Two copies of the same sale raced and the other one won. Usually a
      // unique violation, but a copy that waited behind the winner's locks
      // can fail in other ways too: if the sale exists now, that's success.
      if (dto.clientId) {
        const existing = await this.findByClientId(dto.storeId, dto.clientId);
        if (existing) return existing;
        if (isUniqueViolation(error, "clientId")) {
          this.logger.warn(`Sale ${dto.clientId} hit its unique key but isn't there`);
        }
      }
      throw error;
    }

    // Approvals the till checked while offline: recorded now the sale exists.
    if (offline) {
      for (const o of dto.offlineOverrides ?? []) {
        await this.overrides.recordOffline(
          { userId: cashierId, businessId },
          { ...o, action: `sale.${o.permission.toLowerCase()}`, storeId: dto.storeId, details: { saleId: sale.id, receiptNumber } },
        );
      }
    }

    // Best-effort — a mail failure shouldn't fail an already-completed sale.
    this.emailReceiptIfRequested(dto, sale).catch((error) => {
      this.logger.error(`Failed to email receipt for sale ${sale.id}: ${error}`);
    });

    return withSoldNames(sale);
  }

  /**
   * Which approval a discount needs, if any. Discounts need APPLY_DISCOUNT
   * and must stay within the business's maximum (overall and on each line)
   * unless the person has DISCOUNT_ABOVE_LIMIT. Over the limit, one
   * DISCOUNT_ABOVE_LIMIT approval covers it.
   */
  private async discountApproval(
    businessId: string,
    userId: string,
    role: Role,
    priced: PricedSale,
  ): Promise<{ permission: Permission; message: string } | null> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { maxDiscountPercent: true },
    });
    if (business?.maxDiscountPercent != null) {
      const max = Number(business.maxDiscountPercent);
      const limit = (base: number) => Math.round((base * max) / 100);
      const over =
        priced.discountTotal > limit(priced.subtotal) || priced.lines.some((l) => l.lineDiscount > limit(l.gross));
      if (over && !(await this.permissions.hasPermission(userId, role, Permission.DISCOUNT_ABOVE_LIMIT))) {
        return { permission: Permission.DISCOUNT_ABOVE_LIMIT, message: `Discounts can't be more than ${max}% of the price` };
      }
      if (over) return null;
    }
    if (!(await this.permissions.hasPermission(userId, role, Permission.APPLY_DISCOUNT))) {
      return { permission: Permission.APPLY_DISCOUNT, message: "You don't have permission to give discounts" };
    }
    return null;
  }

  /**
   * The shift a sale belongs to. Online: an open shift on this till, opened
   * by the cashier ringing it up. Offline uploads record what happened: the
   * shift may have closed since, and sales queued by older apps may have
   * none; if it hasn't uploaded yet, the till tries again later.
   */
  private async saleShift(dto: CreateSaleDto, cashierId: string, terminalId: string | null) {
    const offline = !!dto.offline;
    if (!dto.shiftClientId) {
      if (offline) return null;
      throw new BadRequestException("Open a shift before selling");
    }
    const shift = await this.prisma.shift.findUnique({
      where: { storeId_clientId: { storeId: dto.storeId, clientId: dto.shiftClientId } },
      select: { id: true, status: true, openedById: true, terminalId: true },
    });
    if (!shift) {
      if (offline) throw new ConflictException("This sale's shift hasn't reached the server yet");
      throw new BadRequestException("Open a shift before selling");
    }
    if (!offline) {
      if (shift.status !== ShiftStatus.OPEN) throw new BadRequestException("This shift is closed. Open a new one to sell.");
      if (shift.openedById !== cashierId) {
        throw new ForbiddenException("This shift belongs to someone else. They have to close it before you can sell.");
      }
      if (shift.terminalId && terminalId && shift.terminalId !== terminalId) {
        throw new BadRequestException("This shift is open on another till");
      }
    }
    return shift;
  }

  /**
   * "Consumidor Final" (NIF 999999999). Every business gets one when it's
   * created (and existing ones in the migration); made here only if missing.
   */
  async finalConsumerId(businessId: string): Promise<string> {
    const existing = await this.prisma.customer.findFirst({ where: { businessId, isFinalConsumer: true }, select: { id: true } });
    if (existing) return existing.id;
    const created = await this.prisma.customer.upsert({
      where: { id: `fc_${businessId}` },
      update: {},
      create: { id: `fc_${businessId}`, ...finalConsumerData(businessId) },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Cancels a completed sale: it drops out of reports and its stock goes back
   * on the shelf. A sale with a return or an invoice, or older than 24 hours,
   * is undone with a return instead. Cancelling twice returns the same sale.
   */
  async void(userId: string, dto: VoidSaleDto) {
    if (!dto.saleId && !dto.saleClientId) {
      throw new BadRequestException("Say which sale to cancel");
    }
    const sale = await this.prisma.sale.findFirst({
      where: { storeId: dto.storeId, ...(dto.saleId ? { id: dto.saleId } : { clientId: dto.saleClientId }) },
      include: {
        lineItems: true,
        returns: { select: { id: true } },
        invoice: { select: { id: true } },
        shift: { select: { status: true } },
      },
    });
    if (!sale) throw new NotFoundException("Sale not found for this store");

    if (sale.status === SaleStatus.COMPLETED) {
      if (sale.shift?.status === "CLOSED") {
        throw new BadRequestException("This sale's shift is closed. Use Returns instead.");
      }
      if (sale.returns.length > 0) {
        throw new BadRequestException("This sale has a return, so it can't be cancelled. Use Returns instead.");
      }
      if (sale.invoice) {
        throw new BadRequestException("An invoice was issued for this sale, so it can't be cancelled");
      }
      // A cancel queued offline counts from when the cashier did it.
      const voidedAt = dto.occurredAt ? clampToNow(new Date(dto.occurredAt)) : new Date();
      if (voidedAt.getTime() - sale.createdAt.getTime() > VOID_WINDOW_MS) {
        throw new BadRequestException("Sales older than 24 hours can't be cancelled. Use Returns instead.");
      }

      await this.prisma.$transaction(async (tx) => {
        // Only one cancel wins, so the stock goes back once.
        const { count } = await tx.sale.updateMany({
          where: { id: sale.id, status: SaleStatus.COMPLETED },
          data: {
            status: SaleStatus.VOIDED,
            voidedAt: voidedAt < sale.createdAt ? sale.createdAt : voidedAt,
            voidedById: userId,
            voidReason: dto.reason,
            voidNote: dto.note?.trim() || null,
          },
        });
        if (count === 0) return;
        for (const li of sale.lineItems) {
          await tx.inventoryItem.upsert({
            where: { storeId_productId: { storeId: sale.storeId, productId: li.productId } },
            update: { quantity: { increment: li.quantity } },
            create: { storeId: sale.storeId, productId: li.productId, quantity: li.quantity },
          });
        }
      });
    }

    const voided = await this.prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, include: SALE_INCLUDE });
    return withSoldNames(voided);
  }

  private async findByClientId(storeId: string, clientId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { storeId_clientId: { storeId, clientId } },
      include: SALE_INCLUDE,
    });
    return sale && withSoldNames(sale);
  }

  /** A till that's been removed is ignored rather than failing a sale that
   * already happened. */
  private async resolveTerminal(businessId: string, terminalId?: string): Promise<string | null> {
    if (!terminalId) return null;
    const terminal = await this.prisma.terminal.findFirst({
      where: { id: terminalId, businessId },
      select: { id: true },
    });
    if (!terminal) {
      this.logger.warn(`Ignoring unknown terminal ${terminalId} on a sale`);
    }
    return terminal?.id ?? null;
  }

  private async emailReceiptIfRequested(
    dto: CreateSaleDto,
    sale: Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>,
  ): Promise<void> {
    let email = dto.receiptEmail;
    if (!email && dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      email = customer?.email ?? undefined;
    }
    if (!email) {
      return;
    }

    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
      include: { business: { select: { currency: true, language: true } } },
    });
    await this.mail.sendReceiptEmail(
      email,
      {
      storeName: store?.name ?? "Store",
      currency: store?.business.currency ?? "USD",
      receiptNumber: sale.receiptNumber,
      items: sale.lineItems.map((li) => ({
        name: li.productName,
        quantity: li.quantity,
        unitPrice: li.unitPrice.toString(),
        lineTotal: li.lineTotal.toString(),
      })),
      subtotal: sale.subtotal.toString(),
      discountTotal: sale.discountTotal.toString(),
      taxTotal: sale.taxTotal.toString(),
      total: sale.total.toString(),
      },
      // For the shop's customer: the business language.
      emailLanguage(null, store?.business.language),
    );
  }
}

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
import { priceSaleCents, unitDecimals, type DiscountInput, type PricedSale } from "./pricing";
import { countryConfig, lineTax, type IvaRegime, type LineTax } from "../countries";
import { recordMovement } from "../stock/stock";
import { annulmentCode, buyerOf, DOCUMENT_SUMMARY, FiscalService } from "../fiscal/fiscal.service";
import { CustomerAccountsService } from "../accounts/customer-accounts.service";

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
  fiscalDocuments: DOCUMENT_SUMMARY,
  customer: { select: { id: true, name: true, taxId: true, isFinalConsumer: true } },
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
    private readonly fiscal: FiscalService,
    private readonly accounts: CustomerAccountsService,
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
    const store = await this.prisma.store.findFirst({
      where: { id: dto.storeId, businessId },
      select: { country: true, ivaRegime: true, pricesIncludeTax: true },
    });
    if (!store) throw new NotFoundException("Store not found");

    for (const discount of [dto.discount, ...dto.lineItems.map((li) => li.discount)]) {
      if (discount?.type === "PERCENT" && discount.value > 100) {
        throw new BadRequestException("A percentage discount can't be more than 100%");
      }
    }
    for (const li of dto.lineItems) {
      const product = productById.get(li.productId)!;
      if (unitDecimals(product.unit) === 0 && !Number.isInteger(li.quantity)) {
        throw new BadRequestException(`"${product.name}" is sold in whole units`);
      }
    }

    // The tax on each line: the product's, unless the store's regime makes
    // everything exempt. An offline sale keeps the rate the till charged.
    const config = countryConfig(store.country);
    const taxes: LineTax[] = dto.lineItems.map((li) => {
      const tax = lineTax(config, store.ivaRegime as IvaRegime, productById.get(li.productId)!);
      if (!offline || li.taxRate === undefined || li.taxRate === tax.rate) return tax;
      return li.taxRate > 0
        ? { ...tax, taxCode: tax.rate > 0 ? tax.taxCode : "NOR", rate: li.taxRate, exemptionCode: null }
        : { ...tax, taxCode: "ISE", rate: 0 };
    });
    const taxIncluded = offline?.pricesIncludeTax ?? store.pricesIncludeTax;

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
      dto.lineItems.map((li, i) => ({
        unitPrice: Number(unitPrices[i]),
        quantity: li.quantity,
        taxRate: taxes[i].rate,
        discount: given(li.discount),
      })),
      given(dto.discount),
      { taxIncluded },
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
      if ((dto.creditAmount ?? 0) > 0 && !(await this.permissions.hasPermission(cashierId, role, Permission.SELL_ON_CREDIT))) {
        needed.push({ permission: Permission.SELL_ON_CREDIT, message: "Selling on credit needs a manager's approval" });
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
        quantity: new Prisma.Decimal(li.quantity),
        unit: product.unit,
        unitPrice: unitPrices[i],
        taxRate: new Prisma.Decimal(taxes[i].rate),
        taxCode: taxes[i].taxCode,
        exemptionCode: taxes[i].exemptionCode,
        // Services: their cost price; stock: the store's average, filled in when it moves.
        unitCost: product.costPrice as Prisma.Decimal | null,
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

    // A sale on credit leaves part (or all) of the total on the customer's
    // account; what was paid now and what's on credit make up the total.
    const creditAmount = new Prisma.Decimal(dto.creditAmount ?? 0);
    const onCredit = creditAmount.gt(0);
    if (creditAmount.gt(total)) throw new BadRequestException("The amount on credit is more than the total");
    const paymentsTotal = dto.payments.reduce(
      (sum, p) => sum.add(new Prisma.Decimal(p.amount)),
      new Prisma.Decimal(0),
    );
    if (paymentsTotal.add(creditAmount).sub(total).abs().gt(0.01)) {
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

    const terminal = await this.resolveTerminal(businessId, dto.terminalId);
    const terminalId = terminal?.id ?? null;
    // A till whose access was withdrawn can't issue documents any more.
    if (dto.fiscal?.hash && terminal && !terminal.isActive) {
      throw new ForbiddenException("This till's access was withdrawn; it can't issue documents");
    }
    // The shift was opened before this sale (the till uploads in order).
    const shift = await this.saleShift(dto, cashierId, terminalId);
    const customerId = dto.customerId || (await this.finalConsumerId(businessId));
    // The buyer and seller frozen on the sale's Factura-Recibo.
    const buyer = await this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
    if (!buyer) throw new NotFoundException("Customer not found");
    const issuer = await this.fiscal.issuer(businessId, dto.storeId);
    if (onCredit) {
      if (buyer.isFinalConsumer) throw new BadRequestException("Choose the customer to sell on credit to");
      if (!issuer.config) throw new BadRequestException("Sales on credit and receipts need a store that issues fiscal documents");
    }
    const createdAt = offline ? clampToNow(new Date(offline.createdAt)) : undefined;
    let sale: Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;
    try {
      sale = await this.prisma.$transaction(async (tx) => {
        for (const approval of approvals) {
          await this.overrides.consume(approval.token, { userId: cashierId, businessId }, approval.permission, tx);
        }
        // Within the customer's credit limit (locked until the sale is in).
        // An offline upload records a sale that already happened.
        if (onCredit && !offline) await this.accounts.checkCredit(tx, businessId, customerId, creditAmount);
        // Services and the like don't move stock. Offline, the goods already
        // left the shop: the sale is recorded even if the server's count says
        // there weren't enough. Online there must be enough.
        const movementIds: string[] = [];
        for (const [i, li] of dto.lineItems.entries()) {
          const product = productById.get(li.productId)!;
          if (!product.trackStock) continue;
          const movement = await recordMovement(tx, {
            storeId: dto.storeId,
            product,
            type: "SALE",
            quantity: -li.quantity,
            requireStock: !offline,
            userId: cashierId,
            occurredAt: createdAt,
          });
          movementIds.push(movement.id);
          lineItemsData[i].unitCost = movement.unitCost;
        }

        if (terminalId) {
          await tx.terminal.update({ where: { id: terminalId }, data: { lastSeenAt: new Date() } });
        }

        const created = await tx.sale.create({
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
            // All on credit: no payment leg (receipts show "on account").
            paymentMethod: dto.payments[0]?.method ?? PaymentMethod.OTHER,
            creditAmount,
            amountTendered,
            changeDue,
            clientId: dto.clientId,
            createdOffline: !!offline,
            terminalId,
            shiftId: shift?.id ?? null,
            pricesIncludeTax: taxIncluded,
            ...(createdAt ? { createdAt } : {}),
            lineItems: { create: lineItemsData },
            payments: { create: paymentsData },
          },
          include: SALE_INCLUDE,
        });
        if (movementIds.length > 0) {
          await tx.stockMovement.updateMany({ where: { id: { in: movementIds } }, data: { saleId: created.id } });
        }
        // Where sales are fiscal documents (the store's country has a fiscal
        // config: Angola), every completed sale is a Factura-Recibo, numbered
        // by the till that rang it up (or the store's series) and signed.
        if (issuer.config) {
          const document = await this.fiscal.issueForSale(tx, {
            issuer,
            saleId: created.id,
            terminal,
            userId: cashierId,
            buyer: buyerOf(buyer),
            requested: dto.fiscal,
            proformaId: dto.proformaId,
          });
          // On credit, what was paid now is a receipt against the sale's own invoice.
          if (onCredit && paymentsData.length > 0) {
            await this.accounts.receiveWithSale(tx, {
              businessId,
              storeId: dto.storeId,
              saleId: created.id,
              invoiceId: document.id,
              customer: buyer,
              payments: paymentsData.map((p) => ({ method: p.method, amount: p.amount })),
              shiftId: shift?.id ?? null,
              terminal,
              userId: cashierId,
              at: created.createdAt,
            });
          }
        }
        return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: SALE_INCLUDE });
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
        lineItems: { include: { product: true } },
        returns: { select: { id: true } },
        invoice: { select: { id: true } },
        fiscalDocuments: { where: { documentType: { in: ["FR", "FT"] }, status: "N" }, select: { id: true } },
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
      // A Factura-Recibo can only be annulled for the two reasons the law
      // allows (I, N); anything else is corrected with a credit note.
      const annulment = annulmentCode(dto.reason);
      if (sale.fiscalDocuments.length > 0 && !annulment) {
        throw new BadRequestException(
          "This sale's Factura-Recibo can only be annulled if the customer was wrongly identified or it never reached the customer. Otherwise make a return (credit note).",
        );
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
        // Its Factura-Recibo is annulled (status A), never deleted.
        if (annulment) await this.fiscal.annulForSale(tx, sale.id, annulment, userId, voidedAt < sale.createdAt ? sale.createdAt : voidedAt);
        for (const li of sale.lineItems) {
          if (!li.product.trackStock) continue;
          await recordMovement(tx, {
            storeId: sale.storeId,
            product: li.product,
            type: "SALE_VOID",
            quantity: li.quantity,
            // Back at what it left at.
            unitCost: li.unitCost,
            saleId: sale.id,
            userId,
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
  private async resolveTerminal(businessId: string, terminalId?: string): Promise<{ id: string; code: string; isActive: boolean } | null> {
    if (!terminalId) return null;
    const terminal = await this.prisma.terminal.findFirst({
      where: { id: terminalId, businessId },
      select: { id: true, code: true, isActive: true },
    });
    if (!terminal) {
      this.logger.warn(`Ignoring unknown terminal ${terminalId} on a sale`);
    }
    return terminal ?? null;
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
        quantity: li.unit === "un" ? li.quantity.toNumber() : `${li.quantity.toNumber()} ${li.unit}`,
        unitPrice: li.unitPrice.toString(),
        lineTotal: li.lineTotal.toString(),
      })),
      subtotal: sale.subtotal.toString(),
      discountTotal: sale.discountTotal.toString(),
      taxTotal: sale.taxTotal.toString(),
      total: sale.total.toString(),
      taxIncluded: sale.pricesIncludeTax,
      },
      // For the shop's customer: the business language.
      emailLanguage(null, store?.business.language),
    );
  }
}

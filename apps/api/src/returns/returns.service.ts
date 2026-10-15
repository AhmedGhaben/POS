import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma, ShiftStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReturnDto } from "./dto/create-return.dto";
import { recordMovement } from "../stock/stock";
import { DOCUMENT_SUMMARY, FiscalService } from "../fiscal/fiscal.service";
import { CustomerAccountsService } from "../accounts/customer-accounts.service";

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscal: FiscalService,
    private readonly accounts: CustomerAccountsService,
  ) {}

  findByStore(storeId: string) {
    return this.prisma.return.findMany({
      where: { storeId },
      include: { lineItems: { include: { product: true } }, sale: true, fiscalDocument: DOCUMENT_SUMMARY },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async create(processedById: string, dto: CreateReturnDto) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: dto.saleId },
      include: { lineItems: true, returns: { include: { lineItems: true } }, store: { select: { businessId: true } } },
    });
    if (!sale || sale.storeId !== dto.storeId) {
      throw new NotFoundException("Sale not found for this store");
    }
    if (sale.status === "VOIDED") {
      throw new BadRequestException("This sale was cancelled");
    }

    const alreadyReturned = new Map<string, Prisma.Decimal>();
    for (const ret of sale.returns) {
      for (const li of ret.lineItems) {
        alreadyReturned.set(li.productId, (alreadyReturned.get(li.productId) ?? new Prisma.Decimal(0)).add(li.quantity));
      }
    }

    let totalRefund = new Prisma.Decimal(0);
    const lineItemsData = dto.lineItems.map((li) => {
      const saleLine = sale.lineItems.find((sl) => sl.productId === li.productId);
      if (!saleLine) {
        throw new BadRequestException(`Product ${li.productId} was not part of this sale`);
      }
      if (saleLine.unit === "un" && !Number.isInteger(li.quantity)) {
        throw new BadRequestException(`"${saleLine.productName}" is sold in whole units`);
      }
      const returnedSoFar = alreadyReturned.get(li.productId) ?? new Prisma.Decimal(0);
      if (returnedSoFar.add(li.quantity).gt(saleLine.quantity)) {
        throw new BadRequestException(
          `Cannot return more than was sold for one of the products`,
        );
      }

      // What the customer actually paid per item: after discounts, with tax.
      const unitPrice = saleLine.unitPrice;
      // Same proportion as the credit note's line (fiscal/document-lines.ts#partOfLine).
      const lineTotal = saleLine.lineTotal.mul(li.quantity).div(saleLine.quantity).toDecimalPlaces(2);
      totalRefund = totalRefund.add(lineTotal);

      return {
        productId: li.productId,
        quantity: li.quantity,
        unitPrice,
        lineTotal,
      };
    });

    // On a sale on credit, the return first lowers what the customer still
    // owes on its invoice; only the rest goes back as money.
    const owed = await this.accounts.openOnSale(this.prisma, sale.id);
    const accountCredit = Prisma.Decimal.min(owed, totalRefund);
    const moneyBack = totalRefund.sub(accountCredit);

    // Cash back leaves a drawer, so it happens in that till's open shift. A
    // credit note with no cash (refund by transfer, card, to the customer's
    // balance) can be done from the back office, linked to the person and store.
    const refundMethod = dto.refundMethod ?? PaymentMethod.CASH;
    const shift = dto.shiftClientId
      ? await this.prisma.shift.findUnique({
          where: { storeId_clientId: { storeId: dto.storeId, clientId: dto.shiftClientId } },
          select: { id: true, status: true, terminal: { select: { id: true, code: true } } },
        })
      : null;
    if (refundMethod === PaymentMethod.CASH && moneyBack.gt(0) && shift?.status !== ShiftStatus.OPEN) {
      throw new BadRequestException("A cash refund has to be done at a till with an open shift");
    }

    const issuer = await this.fiscal.issuer(sale.store.businessId, dto.storeId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.lineItems.map((li) => li.productId) } },
      select: { id: true, name: true, costPrice: true, trackStock: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.return.create({
        data: {
          saleId: dto.saleId,
          storeId: dto.storeId,
          processedById,
          reason: dto.reason,
          totalRefund,
          refundMethod,
          accountCredit,
          shiftId: shift?.status === ShiftStatus.OPEN ? shift.id : null,
          lineItems: { create: lineItemsData },
        },
        include: { lineItems: { include: { product: true } } },
      });
      // Back on the shelf at what it left at.
      for (const li of dto.lineItems) {
        const product = productById.get(li.productId);
        if (!product?.trackStock) continue;
        await recordMovement(tx, {
          storeId: dto.storeId,
          product,
          type: "RETURN",
          quantity: li.quantity,
          unitCost: sale.lineItems.find((sl) => sl.productId === li.productId)?.unitCost,
          returnId: created.id,
          saleId: sale.id,
          userId: processedById,
        });
      }
      // The Nota de Crédito, in the till's series when it was done at a till.
      if (issuer.config) await this.fiscal.issueCreditNote(tx, {
        issuer,
        returnId: created.id,
        terminal: shift?.status === ShiftStatus.OPEN ? (shift.terminal ?? null) : null,
        userId: processedById,
        reason: dto.reason ?? null,
      });
      return tx.return.findUniqueOrThrow({
        where: { id: created.id },
        include: { lineItems: { include: { product: true } }, fiscalDocument: DOCUMENT_SUMMARY },
      });
    });
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { generateOpaqueToken } from "../common/utils/tokens";
import { toBusinessSettings } from "../businesses/businesses.service";
import { IssueInvoiceDto } from "./dto/issue-invoice.dto";
import { ListInvoicesDto } from "./dto/list-invoices.dto";

const INVOICE_INCLUDE = {
  sale: {
    include: {
      lineItems: { include: { product: true } },
      payments: true,
    },
  },
} satisfies Prisma.InvoiceInclude;

/** What the A4 layout needs from the seller, frozen at issue time. */
export interface SellerSnapshot {
  name: string;
  legalName: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  currency: string;
  logoUrl: string | null;
  invoiceFooter: string | null;
  store: { id: string; name: string; address: string | null; phone: string | null };
}

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(4, "0")}`;
}

/** Calendar year of `at` in the store's timezone, so 23:30 on 31 Dec isn't numbered into next year. */
export function yearInTimezone(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone, year: "numeric" }).format(at));
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Same visibility as the POS: owners see every store, others only their assigned ones. */
  private async findSaleForUser(user: AuthenticatedUser, saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { store: true, invoice: { include: INVOICE_INCLUDE } },
    });
    if (!sale || sale.store.businessId !== user.businessId) {
      throw new NotFoundException("Sale not found");
    }
    if (user.role !== Role.OWNER) {
      const access = await this.prisma.storeUser.findUnique({
        where: { userId_storeId: { userId: user.userId, storeId: sale.storeId } },
      });
      if (!access) throw new NotFoundException("Sale not found");
    }
    return sale;
  }

  /**
   * Issues the A4 invoice for a sale, or returns the existing one: a sale is
   * invoiced at most once, so retries and double-clicks are safe.
   */
  async issueForSale(user: AuthenticatedUser, saleId: string, dto: IssueInvoiceDto) {
    const sale = await this.findSaleForUser(user, saleId);
    if (sale.invoice) return sale.invoice;

    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: user.businessId } });
    const settings = toBusinessSettings(business);
    const seller: SellerSnapshot = {
      name: settings.name,
      legalName: settings.legalName,
      taxId: settings.taxId,
      registrationNumber: settings.registrationNumber,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      currency: settings.currency,
      logoUrl: settings.logoUrl,
      invoiceFooter: settings.invoiceFooter,
      store: { id: sale.store.id, name: sale.store.name, address: sale.store.address, phone: sale.store.phone },
    };
    const issuedAt = new Date();
    const year = yearInTimezone(issuedAt, sale.store.timezone);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Upsert-and-increment in one statement. The row lock it takes is held
        // until commit, so concurrent invoices queue up and get consecutive
        // numbers; if anything below fails, the increment rolls back too.
        const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
          INSERT INTO "invoice_counters" ("id", "businessId", "year", "next")
          VALUES (${generateOpaqueToken().slice(0, 25)}, ${user.businessId}, ${year}, 2)
          ON CONFLICT ("businessId", "year") DO UPDATE SET "next" = "invoice_counters"."next" + 1
          RETURNING "next"`;
        const sequence = next - 1;

        if (dto.saveToCustomer && sale.customerId) {
          await tx.customer.update({
            where: { id: sale.customerId },
            data: {
              name: dto.buyerName,
              address: dto.buyerAddress ?? null,
              taxId: dto.buyerTaxId ?? null,
              ...(dto.buyerEmail ? { email: dto.buyerEmail } : {}),
            },
          });
        }

        return tx.invoice.create({
          data: {
            businessId: user.businessId,
            saleId: sale.id,
            year,
            sequence,
            number: formatInvoiceNumber(year, sequence),
            issuedAt,
            seller: seller as unknown as Prisma.InputJsonValue,
            buyerName: dto.buyerName,
            buyerAddress: dto.buyerAddress,
            buyerTaxId: dto.buyerTaxId,
            buyerEmail: dto.buyerEmail,
            customerId: sale.customerId,
          },
          include: INVOICE_INCLUDE,
        });
      });
    } catch (err) {
      // Two tills invoicing the same sale at once: the loser hits the unique
      // saleId; its transaction (and counter increment) rolled back, so
      // return the winner's invoice.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.prisma.invoice.findUnique({ where: { saleId }, include: INVOICE_INCLUDE });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async findAll(businessId: string, query: ListInvoicesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.InvoiceWhereInput = {
      businessId,
      issuedAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ year: "desc" }, { sequence: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          number: true,
          issuedAt: true,
          buyerName: true,
          buyerTaxId: true,
          sale: { select: { total: true, receiptNumber: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(businessId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, include: INVOICE_INCLUDE });
    if (!invoice || invoice.businessId !== businessId) {
      throw new NotFoundException("Invoice not found");
    }
    return invoice;
  }
}

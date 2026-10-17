import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { zip } from "../common/xlsx";
import { FiscalService } from "../fiscal/fiscal.service";
import { exportPeriod } from "../fiscal/saft/period";
import { SaftExportService } from "../fiscal/saft-export.service";
import { PrismaService } from "../prisma/prisma.service";
import { businessTimeZone, dateValue } from "./accounting-dates";

export const OWNER_TYPES = ["PURCHASE", "EXPENSE", "ENTRY"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];
const MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/** Documents handed to the app per request, to be drawn as PDFs. */
const DOCUMENTS_PAGE = 25;
/** By type, date and number; every till numbers from 1, so the document number and id settle ties and pages never overlap. */
const ARCHIVE_ORDER: Prisma.FiscalDocumentOrderByWithRelationInput[] = [{ documentType: "asc" }, { invoiceDate: "asc" }, { number: "asc" }, { documentNo: "asc" }, { id: "asc" }];

const safeName = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "ficheiro";

/**
 * The document archive (docs/ACCOUNTING-DECISIONS.md, B2): scanned papers
 * attached to purchases, expenses and entries, and a period's archive as
 * one ZIP for the accountant.
 */
@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saft: SaftExportService,
    private readonly fiscal: FiscalService,
  ) {}

  /** Where a document's PDF goes in the archive. */
  private documentPath(d: { documentType: string; documentNo: string }) {
    return `documentos/${d.documentType}/${safeName(d.documentNo)}.pdf`;
  }

  private documentsWhere(businessId: string, period: { startDate: string; endDate: string }) {
    return { businessId, invoiceDate: { gte: dateValue(period.startDate), lte: dateValue(period.endDate) } };
  }

  /** Attaches a file (data: URL, PDF or image, up to 5 MB) to a purchase, expense or entry of the business. */
  async attach(businessId: string, userId: string, input: { ownerType: OwnerType; ownerId: string; fileName: string; dataUrl: string }) {
    await this.owner(businessId, input.ownerType, input.ownerId);
    const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl);
    if (!m || !MIME_TYPES.includes(m[1])) throw new BadRequestException("Attach a PDF or an image (JPEG, PNG, WebP)");
    const data = Buffer.from(m[2], "base64");
    if (data.length > MAX_BYTES) throw new BadRequestException("Files are 5 MB at most");
    const a = await this.prisma.attachment.create({
      data: { businessId, ownerType: input.ownerType, ownerId: input.ownerId, fileName: input.fileName.trim().slice(0, 120) || "ficheiro", mimeType: m[1], size: data.length, data, uploadedById: userId },
      select: { id: true, ownerType: true, ownerId: true, fileName: true, mimeType: true, size: true, createdAt: true },
    });
    return a;
  }

  list(businessId: string, ownerType: string, ownerId: string) {
    return this.prisma.attachment.findMany({
      where: { businessId, ownerType, ownerId },
      select: { id: true, ownerType: true, ownerId: true, fileName: true, mimeType: true, size: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async file(businessId: string, id: string) {
    const a = await this.prisma.attachment.findFirst({ where: { id, businessId } });
    if (!a) throw new NotFoundException("Attachment not found");
    return a;
  }

  async remove(businessId: string, id: string) {
    const { count } = await this.prisma.attachment.deleteMany({ where: { id, businessId } });
    if (!count) throw new NotFoundException("Attachment not found");
    return { removed: true };
  }

  private async owner(businessId: string, type: OwnerType, id: string) {
    const found =
      type === "PURCHASE"
        ? await this.prisma.purchase.findFirst({ where: { id, store: { businessId } }, select: { id: true } })
        : type === "EXPENSE"
          ? await this.prisma.expense.findFirst({ where: { id, store: { businessId } }, select: { id: true } })
          : await this.prisma.journalEntry.findFirst({ where: { id, businessId }, select: { id: true } });
    if (!found) throw new NotFoundException("Not found");
  }

  /**
   * The period's archive as one ZIP: the SAF-T invoicing and purchases files
   * for the period (when it's within one year), the attachments of its
   * purchases, expenses and entries, and an index that lists every fiscal
   * document too. The documents' PDFs are added by the app, drawn with the
   * same template it prints them with ("2ª Via"), from `documents` below.
   */
  async archive(businessId: string, userId: string, startDate: string, endDate: string) {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const period = exportPeriod(startDate, endDate, businessTimeZone(business));
    const files: { name: string; data: Buffer }[] = [];
    const index: string[] = ["Ficheiro;Tipo;Número;Data;Cliente/Fornecedor;Total"];

    const documents = await this.prisma.fiscalDocument.findMany({
      where: this.documentsWhere(businessId, period),
      select: { documentType: true, documentNo: true, invoiceDate: true, buyerName: true, grossTotal: true },
      orderBy: ARCHIVE_ORDER,
    });
    for (const d of documents) {
      index.push([this.documentPath(d), d.documentType, d.documentNo, d.invoiceDate.toISOString().slice(0, 10), d.buyerName.replace(/;/g, ","), d.grossTotal.toFixed(2)].join(";"));
    }

    // The SAF-T files need a NIF and kwanzas; a period across two years has none.
    if (period.startDate.slice(0, 4) === period.endDate.slice(0, 4) && business.taxId && business.currency === "AOA") {
      for (const make of [() => this.saft.facturacao(businessId, userId, { startDate, endDate }), () => this.saft.aquisicao(businessId, userId, { startDate, endDate })]) {
        try {
          const f = await make();
          files.push({ name: `saft/${f.fileName}`, data: typeof f.body === "string" ? Buffer.from(f.body, "utf8") : f.body });
        } catch {
          // Left out (e.g. a document without its exemption reason): the index says so.
          index.push("saft;;não gerado;;;");
        }
      }
    }

    const purchases = await this.prisma.purchase.findMany({ where: { store: { businessId }, createdAt: { gte: period.from, lt: period.until } }, select: { id: true, purchaseNumber: true, supplierDocNo: true } });
    const expenses = await this.prisma.expense.findMany({ where: { store: { businessId }, incurredAt: { gte: period.from, lt: period.until } }, select: { id: true } });
    const entries = await this.prisma.journalEntry.findMany({ where: { businessId, postingDate: { gte: dateValue(period.startDate), lte: dateValue(period.endDate) } }, select: { id: true, docArchivalNumber: true, journal: { select: { code: true } } } });
    const owners = new Map<string, string>([
      ...purchases.map((p): [string, string] => [p.id, `anexos/compras/${safeName(p.supplierDocNo ?? p.purchaseNumber)}`]),
      ...expenses.map((e): [string, string] => [e.id, `anexos/despesas/${e.id}`]),
      ...entries.map((e): [string, string] => [e.id, `anexos/lancamentos/${e.journal.code}_${safeName(e.docArchivalNumber)}`]),
    ]);
    const attachments = await this.prisma.attachment.findMany({ where: { businessId, ownerId: { in: [...owners.keys()] } }, orderBy: { createdAt: "asc" } });
    for (const a of attachments) {
      const name = `${owners.get(a.ownerId)}/${a.id.slice(-6)}_${safeName(a.fileName)}`;
      files.push({ name, data: Buffer.from(a.data) });
      index.push([name, a.ownerType, "", a.createdAt.toISOString().slice(0, 10), "", ""].join(";"));
    }
    files.push({ name: "indice.csv", data: Buffer.from(`\ufeff${index.join("\r\n")}\r\n`, "utf8") });
    await this.prisma.auditLog.create({ data: { businessId, userId, action: "ACCOUNTING_ARCHIVE", entityType: "Export", metadata: { startDate: period.startDate, endDate: period.endDate, documents: documents.length, attachments: attachments.length } } });
    return { fileName: `Arquivo_${period.startDate}_${period.endDate}.zip`, mimeType: "application/zip", body: zip(files) };
  }

  /**
   * The period's fiscal documents, a page at a time, as the document screen
   * gets them (what the print template needs), each with its path in the
   * archive. In the archive's order: by type, date and number.
   */
  async documents(businessId: string, startDate: string, endDate: string, offset = 0) {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const period = exportPeriod(startDate, endDate, businessTimeZone(business));
    const where = this.documentsWhere(businessId, period);
    const [total, page] = await Promise.all([
      this.prisma.fiscalDocument.count({ where }),
      this.prisma.fiscalDocument.findMany({
        where,
        select: { id: true, documentType: true, documentNo: true },
        orderBy: ARCHIVE_ORDER,
        skip: offset,
        take: DOCUMENTS_PAGE,
      }),
    ]);
    const documents = await Promise.all(page.map(async (d) => ({ path: this.documentPath(d), document: await this.fiscal.get(businessId, d.id) })));
    return { total, documents, next: offset + page.length < total ? offset + page.length : null };
  }
}

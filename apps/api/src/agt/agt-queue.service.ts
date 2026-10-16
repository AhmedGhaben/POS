import { randomUUID } from "crypto";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AgtStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { agtConfigFromEnv, type AgtConfig } from "./agt-config";
import { buildAgtDocument, isoSeconds, type AgtDocumentInput } from "./payload";
import { pollDelay, readStatus, retryDelay, THROTTLED_DELAY } from "./queue-rules";

/** registarFactura takes at most 30 documents. */
const BATCH = 30;
const TIMEOUT_MS = 30_000;

const DOCUMENT_FOR_AGT = {
  lines: { include: { taxes: true }, orderBy: { lineNumber: "asc" } },
  customerPayment: { select: { allocations: { select: { amount: true, document: { select: { documentNo: true, invoiceDate: true, netTotal: true, grossTotal: true } } } } } },
} satisfies Prisma.FiscalDocumentInclude;

const MISSING_EXEMPTION = "Not sent: an exempt line has no exemption reason (M-code)";
/** A held document is looked at again once a day (it can't change; it stays visible on the AGT page). */
const HELD_DELAY = 24 * 60 * 60 * 1000;

type Submission = Prisma.AgtSubmissionGetPayload<{ include: { document: { include: typeof DOCUMENT_FOR_AGT } } }>;
/** status 0 = no answer (network, timeout): error says why. */
type Reply = { status: number; body: Record<string, unknown>; error?: string };

const dateOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Sends fiscal documents to AGT and collects the verdicts (docs/plans/
 * ANGOLA.md, phase 9). Every few seconds: queued documents go out in
 * requests of up to 30 per business (registarFactura); sent ones are asked
 * about (obterEstado) until AGT says valid or rejected. Failures wait and
 * try again (longer each time; 5 minutes after "too many requests").
 */
@Injectable()
export class AgtQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgtQueueService.name);
  readonly config: AgtConfig = agtConfigFromEnv();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (this.config.enabled && this.config.intervalMs > 0) {
      this.timer = setInterval(() => void this.runOnce().catch((e) => this.logger.error(`AGT queue: ${e}`)), this.config.intervalMs);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass: send what's due, then ask about what's due. Never overlaps itself. */
  async runOnce(now = new Date()): Promise<void> {
    if (!this.config.enabled || this.running) return;
    this.running = true;
    try {
      await this.sendDue(now);
      await this.pollDue(now);
    } finally {
      this.running = false;
    }
  }

  private softwareInfo() {
    const detail = { productId: this.config.productId, productVersion: this.config.productVersion, softwareValidationNumber: this.config.softwareValidationNumber };
    return {
      softwareInfoDetail: { ...detail, signatureVersion: this.config.signatureVersion },
      // AGT's signature page: the producer signs productId, productVersion and softwareValidationNumber.
      jwsSoftwareSignature: this.config.softwareSigner!.sign(detail),
    };
  }

  private async post(service: string, body: object): Promise<Reply> {
    try {
      const res = await fetch(`${this.config.baseUrl}/${service}`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.user}:${this.config.password}`).toString("base64")}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text.slice(0, 500) };
      }
      return { status: res.status, body: parsed };
    } catch (error) {
      return { status: 0, body: {}, error: (error as Error).message };
    }
  }

  private async sendDue(now: Date) {
    const due = await this.prisma.agtSubmission.findMany({
      where: { status: AgtStatus.QUEUED, nextAttemptAt: { lte: now } },
      include: { document: { include: DOCUMENT_FOR_AGT } },
      orderBy: { createdAt: "asc" },
      take: 10 * BATCH,
    });
    const byBusiness = new Map<string, Submission[]>();
    for (const s of due) byBusiness.set(s.businessId, [...(byBusiness.get(s.businessId) ?? []), s]);
    for (const subs of byBusiness.values()) {
      for (let i = 0; i < subs.length; i += BATCH) await this.sendBatch(subs.slice(i, i + BATCH), now);
    }
  }

  private async sendBatch(batch: Submission[], now: Date) {
    // AGT needs the M-code on every exempt line; a document without one
    // (only from before that rule) is held back, with the reason, not sent.
    const held = batch.filter((s) => s.document.lines.some((l) => l.taxes.some((t) => t.percentage.isZero() && !t.exemptionCode)));
    if (held.length) {
      await this.prisma.agtSubmission.updateMany({
        where: { id: { in: held.map((s) => s.id) } },
        data: { lastError: MISSING_EXEMPTION, nextAttemptAt: new Date(now.getTime() + HELD_DELAY) },
      });
    }
    const subs = batch.filter((s) => !held.includes(s));
    if (!subs.length) return;
    const nif = this.issuerTaxId(subs[0]);
    const productTypes = await this.productTypes(subs);
    const documents = subs.map((s) => buildAgtDocument(this.documentInput(s, nif, productTypes), (p) => this.config.documentSigner!.sign(p)));
    const reply = await this.post("registarFactura", {
      schemaVersion: "2.0",
      submissionUUID: randomUUID(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: isoSeconds(now),
      softwareInfo: this.softwareInfo(),
      numberOfEntries: documents.length,
      documents,
    });
    const ids = subs.map((s) => s.id);
    if (reply.status === 200 && typeof reply.body.requestID === "string") {
      await this.prisma.agtSubmission.updateMany({
        where: { id: { in: ids } },
        data: { status: AgtStatus.SENT, requestId: reply.body.requestID, attempts: { increment: 1 }, polls: 0, sentAt: now, nextAttemptAt: new Date(now.getTime() + pollDelay(1)), lastError: null },
      });
      return;
    }
    if (reply.status === 400 && Array.isArray(reply.body.errorList) && reply.body.errorList.some((e) => (e as { documentNo?: string }).documentNo)) {
      // Refused at format validation: the documents named are rejected; the rest go again.
      const errors = reply.body.errorList as { idError?: string; descriptionError?: string; documentNo?: string }[];
      for (const s of subs) {
        const mine = errors.filter((e) => e.documentNo === s.document.documentNo);
        if (mine.length) {
          await this.prisma.agtSubmission.update({
            where: { id: s.id },
            data: { status: AgtStatus.REJECTED, attempts: { increment: 1 }, decidedAt: now, errors: mine.map((e) => ({ code: e.idError ?? "", description: e.descriptionError ?? "" })), lastError: null },
          });
        } else {
          await this.prisma.agtSubmission.update({ where: { id: s.id }, data: { nextAttemptAt: now } });
        }
      }
      return;
    }
    const throttled = reply.status === 429;
    const lastError = reply.status === 0 ? reply.error : `HTTP ${reply.status} ${JSON.stringify(reply.body).slice(0, 400)}`;
    for (const s of subs) {
      await this.prisma.agtSubmission.update({
        where: { id: s.id },
        data: { attempts: { increment: 1 }, lastError, nextAttemptAt: new Date(now.getTime() + (throttled ? THROTTLED_DELAY : retryDelay(s.attempts + 1))) },
      });
    }
    this.logger.warn(`AGT registarFactura: ${lastError}`);
  }

  private async pollDue(now: Date) {
    const due = await this.prisma.agtSubmission.findMany({
      where: { status: AgtStatus.SENT, nextAttemptAt: { lte: now }, requestId: { not: null } },
      include: { document: { select: { documentNo: true, seller: true } } },
      take: 300,
    });
    const byRequest = new Map<string, typeof due>();
    for (const s of due) byRequest.set(s.requestId!, [...(byRequest.get(s.requestId!) ?? []), s]);
    for (const [requestId, subs] of byRequest) {
      const nif = this.issuerTaxId(subs[0]);
      const reply = await this.post("obterEstado", {
        schemaVersion: "2.0",
        submissionUUID: randomUUID(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: isoSeconds(now),
        softwareInfo: this.softwareInfo(),
        jwsSignature: this.config.documentSigner!.sign({ taxRegistrationNumber: nif, requestID: requestId }),
        requestID: requestId,
      });
      const ids = subs.map((s) => s.id);
      const later = (ms: number, lastError: string | null = null) =>
        this.prisma.agtSubmission.updateMany({ where: { id: { in: ids } }, data: { polls: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + ms), lastError } });
      if (reply.status === 429) {
        await later(THROTTLED_DELAY, "E98: too many requests");
        continue;
      }
      if (reply.status !== 200) {
        // 422 E96/E97: still processing, or asked too soon; anything else: try again later.
        await later(pollDelay(subs[0].polls + 1), reply.status === 0 ? reply.error : reply.status === 422 ? null : `HTTP ${reply.status}`);
        continue;
      }
      const reading = readStatus(reply.body as Parameters<typeof readStatus>[0]);
      if (reading.kind === "wait") {
        await later(pollDelay(subs[0].polls + 1));
      } else if (reading.kind === "resend") {
        await this.prisma.agtSubmission.updateMany({ where: { id: { in: ids } }, data: { status: AgtStatus.QUEUED, requestId: null, polls: 0, nextAttemptAt: now, lastError: "AGT cancelled processing (9)" } });
      } else {
        const outcomes = new Map(reading.documents.map((d) => [d.documentNo, d]));
        const allValid = Number(reply.body.resultCode) === 0;
        for (const s of subs) {
          const o = outcomes.get(s.document.documentNo);
          if (!o && !allValid) {
            await this.prisma.agtSubmission.update({ where: { id: s.id }, data: { polls: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + pollDelay(s.polls + 1)) } });
            continue;
          }
          const valid = o ? o.valid : true;
          await this.prisma.agtSubmission.update({
            where: { id: s.id },
            data: { status: valid ? AgtStatus.VALID : AgtStatus.REJECTED, decidedAt: now, errors: valid ? Prisma.DbNull : o!.errors, lastError: null },
          });
        }
      }
    }
  }

  private issuerTaxId(s: { document: { seller: Prisma.JsonValue } }): string {
    return String((s.document.seller as { taxId?: string } | null)?.taxId ?? "").replace(/\s+/g, "");
  }

  private async productTypes(subs: Submission[]): Promise<Map<string, string>> {
    const ids = [...new Set(subs.flatMap((s) => s.document.lines.map((l) => l.productId)).filter((id): id is string => !!id))];
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, productType: true } });
    return new Map(products.map((p) => [p.id, p.productType]));
  }

  private documentInput(s: Submission, nif: string, productTypes: Map<string, string>): AgtDocumentInput {
    const d = s.document;
    const seller = d.seller as { eacCode?: string | null } | null;
    const buyer = d.buyerAddress as { country?: string } | null;
    return {
      documentNo: d.documentNo,
      documentType: d.documentType,
      documentDate: dateOf(d.invoiceDate),
      systemEntryDate: d.systemEntryDate,
      issuerTaxId: nif,
      eacCode: seller?.eacCode ?? null,
      buyerName: d.buyerName,
      buyerTaxId: d.buyerTaxId,
      buyerCountry: buyer?.country || "AO",
      reason: d.reason,
      netTotal: d.netTotal,
      taxPayable: d.taxPayable,
      grossTotal: d.grossTotal,
      lines: d.lines.map((l) => ({
        lineNumber: l.lineNumber,
        productCode: l.productCode,
        productDescription: l.productDescription,
        productType: (l.productId && productTypes.get(l.productId)) || "P",
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        netAmount: l.netAmount,
        discountAmount: l.discountAmount,
        referenceDocumentNo: l.referenceDocumentNo,
        taxes: l.taxes.map((t) => ({ taxType: t.taxType, taxCountryRegion: t.taxCountryRegion, taxCode: t.taxCode, percentage: t.percentage, amount: t.amount, exemptionCode: t.exemptionCode })),
      })),
      settled: d.customerPayment?.allocations.map((a) => ({
        documentNo: a.document.documentNo,
        documentDate: dateOf(a.document.invoiceDate),
        amount: a.amount,
        netTotal: a.document.netTotal,
        grossTotal: a.document.grossTotal,
      })),
      correctionOf: s.correctionOfDocumentNo,
    };
  }
}

import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AgtStatus, Role } from "@prisma/client";
import { IsString } from "class-validator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { paging } from "../common/store-period";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { AgtQueueService } from "./agt-queue.service";

class CorrectSubmissionDto {
  /** The new document (new number) that corrects the rejected one. */
  @IsString()
  documentId!: string;
}

const SUBMISSION_SELECT = {
  id: true,
  status: true,
  requestId: true,
  attempts: true,
  nextAttemptAt: true,
  lastError: true,
  errors: true,
  correctionOfDocumentNo: true,
  correctedByDocumentId: true,
  sentAt: true,
  decidedAt: true,
  createdAt: true,
  document: { select: { id: true, documentNo: true, documentType: true, invoiceDate: true, buyerName: true, grossTotal: true, storeId: true } },
} as const;

/** E-invoicing with AGT (docs/plans/ANGOLA.md, phase 9): what's pending, rejected, and correcting it. */
@Controller("agt")
@UseGuards(RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class AgtController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: AgtQueueService,
  ) {}

  /** For the pending-sync indicator: on or off, and how many in each state. */
  @Get("status")
  async status(@CurrentUser() user: AuthenticatedUser) {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: user.businessId }, select: { eInvoicingActive: true } });
    const counts = await this.prisma.agtSubmission.groupBy({ by: ["status"], where: { businessId: user.businessId }, _count: true });
    return {
      enabled: this.queue.config.enabled,
      environment: this.queue.config.baseUrl.includes("sifphml") ? "homologation" : "production",
      businessActive: business.eInvoicingActive,
      counts: Object.fromEntries(Object.values(AgtStatus).map((s) => [s, counts.find((c) => c.status === s)?._count ?? 0])),
    };
  }

  @Get("submissions")
  async list(@CurrentUser() user: AuthenticatedUser, @Query("status") status?: string, @Query("take") take?: string, @Query("skip") skip?: string) {
    const where = { businessId: user.businessId, ...(status && status in AgtStatus ? { status: status as AgtStatus } : {}) };
    const p = paging(take, skip);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.agtSubmission.findMany({ where, select: SUBMISSION_SELECT, orderBy: { createdAt: "desc" }, ...p }),
      this.prisma.agtSubmission.count({ where }),
    ]);
    return { items, total };
  }

  /** Send a queued document now instead of waiting for its next try. */
  @Post("submissions/:id/retry")
  @HttpCode(200)
  async retry(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const sub = await this.prisma.agtSubmission.findFirst({ where: { id, businessId: user.businessId } });
    if (!sub) throw new NotFoundException("Submission not found");
    if (sub.status !== AgtStatus.QUEUED) throw new BadRequestException("Only documents waiting to be sent can be retried");
    return this.prisma.agtSubmission.update({ where: { id }, data: { nextAttemptAt: new Date() }, select: SUBMISSION_SELECT });
  }

  /**
   * A rejected document is corrected by a new document (a new number: AGT
   * refuses a rejected number again), sent as a correction of it
   * (documentStatus C, rejectedDocumentNo).
   */
  @Post("submissions/:id/correct")
  @HttpCode(200)
  async correct(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CorrectSubmissionDto) {
    const rejected = await this.prisma.agtSubmission.findFirst({ where: { id, businessId: user.businessId }, include: { document: { select: { documentNo: true, documentType: true } } } });
    if (!rejected) throw new NotFoundException("Submission not found");
    if (rejected.status !== AgtStatus.REJECTED || rejected.correctedByDocumentId) throw new BadRequestException("Only a rejected document not yet corrected can be corrected");
    const correction = await this.prisma.agtSubmission.findFirst({ where: { documentId: dto.documentId, businessId: user.businessId }, include: { document: { select: { documentType: true } } } });
    if (!correction || correction.status !== AgtStatus.QUEUED || correction.attempts > 0) {
      throw new BadRequestException("The correcting document must be a new document not yet sent to AGT");
    }
    if (correction.document.documentType !== rejected.document.documentType) throw new BadRequestException("The correcting document must be of the same type");
    await this.prisma.$transaction([
      this.prisma.agtSubmission.update({ where: { id: correction.id }, data: { correctionOfDocumentNo: rejected.document.documentNo, nextAttemptAt: new Date() } }),
      this.prisma.agtSubmission.update({ where: { id: rejected.id }, data: { correctedByDocumentId: dto.documentId } }),
    ]);
    return this.prisma.agtSubmission.findUniqueOrThrow({ where: { id: rejected.id }, select: SUBMISSION_SELECT });
  }
}

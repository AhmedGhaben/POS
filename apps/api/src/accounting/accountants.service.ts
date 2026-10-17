import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PeriodStatus, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { emailLanguage } from "../common/i18n/languages";
import { MailService } from "../common/mail/mail.service";
import { normalizeEmail } from "../common/transforms/normalize-email";
import { generateOpaqueToken, hashToken } from "../common/utils/tokens";
import { PrismaService } from "../prisma/prisma.service";
import { businessToday } from "./accounting-dates";
import { IntegrationService } from "./integration.service";

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Outside accountants (docs/ACCOUNTING-DECISIONS.md, B1): an owner invites
 * one by email; the same login can be given access by several companies
 * and switches between them.
 */
@Injectable()
export class AccountantsService {
  private readonly logger = new Logger(AccountantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly integration: IntegrationService,
  ) {}

  async list(businessId: string) {
    const rows = await this.prisma.accountantAccess.findMany({
      where: { businessId, revokedAt: null },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, ocpcaNumber: true, isActive: true, emailVerifiedAt: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({ userId: r.user.id, email: r.user.email, firstName: r.user.firstName, lastName: r.user.lastName, ocpcaNumber: r.user.ocpcaNumber, since: r.createdAt }));
  }

  /**
   * Gives an accountant access: an accountant who already has a login gets
   * this company added to their clients; someone new gets a login and an
   * email to choose their password. Staff of any company can't be made accountants.
   */
  async invite(businessId: string, invitedById: string, input: { email: string; firstName: string; lastName: string; ocpcaNumber?: string }) {
    const email = normalizeEmail(input.email);
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.role !== Role.ACCOUNTANT) throw new ConflictException("That email belongs to someone who isn't an accountant");
    let inviteToken: string | null = null;
    const user = await this.prisma.$transaction(async (tx) => {
      const u =
        existing ??
        (await tx.user.create({
          data: {
            businessId,
            email,
            // Unusable until they choose a password from the email.
            passwordHash: await bcrypt.hash(generateOpaqueToken(), 10),
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            role: Role.ACCOUNTANT,
            ocpcaNumber: input.ocpcaNumber?.trim() || null,
          },
        }));
      const access = await tx.accountantAccess.findUnique({ where: { userId_businessId: { userId: u.id, businessId } } });
      if (access && !access.revokedAt) throw new ConflictException("This accountant already has access");
      if (access) await tx.accountantAccess.update({ where: { id: access.id }, data: { revokedAt: null, revokedById: null, invitedById } });
      else await tx.accountantAccess.create({ data: { userId: u.id, businessId, invitedById } });
      if (!existing) {
        inviteToken = generateOpaqueToken();
        await tx.passwordResetToken.create({ data: { userId: u.id, tokenHash: hashToken(inviteToken), expiresAt: new Date(Date.now() + INVITE_TTL_MS) } });
      }
      await tx.auditLog.create({ data: { businessId, userId: invitedById, action: "ACCOUNTANT_INVITED", entityType: "Accounting", entityId: u.id, metadata: { email, newLogin: !existing } } });
      return u;
    });
    if (inviteToken) {
      // Best effort: without the email, the owner can invite again after revoking.
      await this.mail
        .sendStaffInviteEmail(email, { firstName: user.firstName, businessName: business.legalName || business.name, token: inviteToken }, emailLanguage(null, business.language))
        .catch((e) => this.logger.warn(`Accountant invite email to ${email} failed: ${e}`));
    }
    return { userId: user.id, email, newLogin: !existing };
  }

  /** Takes an accountant's access away: their sessions in this company stop at once. */
  async revoke(businessId: string, revokedById: string, userId: string) {
    const access = await this.prisma.accountantAccess.findUnique({ where: { userId_businessId: { userId, businessId } } });
    if (!access || access.revokedAt) throw new NotFoundException("Accountant not found");
    await this.prisma.$transaction([
      this.prisma.accountantAccess.update({ where: { id: access.id }, data: { revokedAt: new Date(), revokedById } }),
      this.prisma.refreshToken.updateMany({ where: { userId, businessId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.auditLog.create({ data: { businessId, userId: revokedById, action: "ACCOUNTANT_REVOKED", entityType: "Accounting", entityId: userId } }),
    ]);
    return { revoked: true };
  }

  /**
   * An accountant's clients, with what needs doing in each: records not
   * posted, integration errors, months gone by still open, and whether last
   * year's SAF-T accounting file was made.
   */
  async clients(userId: string, currentBusinessId: string) {
    const access = await this.prisma.accountantAccess.findMany({
      where: { userId, revokedAt: null },
      include: { business: { include: { accountingSettings: true } } },
      orderBy: { createdAt: "asc" },
    });
    const out = [];
    for (const a of access) {
      const b = a.business;
      const enabled = !!b.accountingSettings?.enabled;
      const today = businessToday(b);
      const year = Number(today.slice(0, 4));
      const month = Number(today.slice(5, 7));
      const [pending, errors, openMonths, lastYearFile] = enabled
        ? await Promise.all([
            this.integration.pending(b.id).then((p) => p.total),
            this.prisma.accountingIntegrationError.count({ where: { businessId: b.id } }),
            this.prisma.accountingPeriod.count({ where: { businessId: b.id, year, number: { gte: 1, lt: month }, status: PeriodStatus.OPEN } }),
            this.prisma.auditLog.count({ where: { businessId: b.id, action: "SAFT_CONTABILIDADE", metadata: { path: ["year"], equals: year - 1 } } }),
          ])
        : [0, 0, 0, 0];
      out.push({
        businessId: b.id,
        name: b.legalName || b.name,
        taxId: b.taxId,
        country: b.country,
        current: b.id === currentBusinessId,
        accountingEnabled: enabled,
        pending,
        errors,
        openMonths,
        lastYearSaftMade: lastYearFile > 0,
        today,
      });
    }
    return out;
  }

  async profile(userId: string, input: { ocpcaNumber?: string | null }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== Role.ACCOUNTANT) throw new BadRequestException("Only accountants have a professional number here");
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { ocpcaNumber: input.ocpcaNumber?.trim() || null } });
    return { ocpcaNumber: updated.ocpcaNumber };
  }
}

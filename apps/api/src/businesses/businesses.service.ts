import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Business } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { UpdateBusinessDto } from "./dto/update-business.dto";
import { countryConfig } from "../countries";
import { aiInsightsEnabled } from "../insights/ai-insights-flag";

const MAX_LOGO_BYTES = 300 * 1024;

/** Accepted logo types with their file signatures, checked against the decoded bytes. */
const LOGO_SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
};

export type BusinessSettings = Omit<Business, "logo" | "logoMimeType" | "logoUpdatedAt"> & {
  /** Relative to the API root; null when no logo is set. */
  logoUrl: string | null;
  /** This server can send email (receipts to customers); without it the till hides "Email receipt". */
  emailEnabled: boolean;
  /** AI insights are switched on for this server (AI_INSIGHTS_ENABLED); without it the app hides them. */
  aiInsightsEnabled: boolean;
};

/** Strips the logo bytes; the logo is fetched separately so it can be cached. */
export function toBusinessSettings(business: Business, emailEnabled = false): BusinessSettings {
  const { logo: _logo, logoMimeType: _mime, logoUpdatedAt, ...rest } = business;
  return {
    ...rest,
    logoUrl: logoUpdatedAt ? `/businesses/${business.id}/logo?v=${logoUpdatedAt.getTime()}` : null,
    emailEnabled,
    aiInsightsEnabled: aiInsightsEnabled(),
  };
}

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private async get(businessId: string): Promise<Business> {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException("Business not found");
    }
    return business;
  }

  async findOwn(businessId: string): Promise<BusinessSettings> {
    return toBusinessSettings(await this.get(businessId), this.mail.configured);
  }

  async update(businessId: string, dto: UpdateBusinessDto): Promise<BusinessSettings> {
    const current = await this.get(businessId);
    // Legal form and province come from the country's lists.
    const config = countryConfig(dto.country ?? current.country);
    if (config) {
      if (dto.legalForm && !config.legalForms.some((f) => f.code === dto.legalForm)) {
        throw new BadRequestException("Unknown legal form");
      }
      if (dto.province && !config.provinces.some((p) => p.code === dto.province)) {
        throw new BadRequestException("Unknown province");
      }
    }
    const business = await this.prisma.business.update({ where: { id: businessId }, data: dto });
    return toBusinessSettings(business, this.mail.configured);
  }

  async setLogo(businessId: string, dataUrl: string): Promise<BusinessSettings> {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      throw new BadRequestException("Logo must be a PNG, JPEG or WebP image");
    }
    const [, mimeType, base64] = match;
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > MAX_LOGO_BYTES) {
      throw new BadRequestException("Logo must be 300 KB or smaller");
    }
    if (!LOGO_SIGNATURES[mimeType](bytes)) {
      throw new BadRequestException("Logo file doesn't match its image type");
    }

    await this.get(businessId);
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { logo: bytes, logoMimeType: mimeType, logoUpdatedAt: new Date() },
    });
    return toBusinessSettings(business, this.mail.configured);
  }

  async removeLogo(businessId: string): Promise<BusinessSettings> {
    await this.get(businessId);
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { logo: null, logoMimeType: null, logoUpdatedAt: null },
    });
    return toBusinessSettings(business, this.mail.configured);
  }

  async getLogo(businessId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { logo: true, logoMimeType: true },
    });
    if (!business?.logo || !business.logoMimeType) {
      throw new NotFoundException("No logo");
    }
    return { bytes: Buffer.from(business.logo), mimeType: business.logoMimeType };
  }
}

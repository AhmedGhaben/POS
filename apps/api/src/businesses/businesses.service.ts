import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Business } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateBusinessDto } from "./dto/update-business.dto";

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
};

/** Strips the logo bytes; the logo is fetched separately so it can be cached. */
export function toBusinessSettings(business: Business): BusinessSettings {
  const { logo: _logo, logoMimeType: _mime, logoUpdatedAt, ...rest } = business;
  return {
    ...rest,
    logoUrl: logoUpdatedAt ? `/businesses/${business.id}/logo?v=${logoUpdatedAt.getTime()}` : null,
  };
}

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  private async get(businessId: string): Promise<Business> {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException("Business not found");
    }
    return business;
  }

  async findOwn(businessId: string): Promise<BusinessSettings> {
    return toBusinessSettings(await this.get(businessId));
  }

  async update(businessId: string, dto: UpdateBusinessDto): Promise<BusinessSettings> {
    await this.get(businessId);
    const business = await this.prisma.business.update({ where: { id: businessId }, data: dto });
    return toBusinessSettings(business);
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
    return toBusinessSettings(business);
  }

  async removeLogo(businessId: string): Promise<BusinessSettings> {
    await this.get(businessId);
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { logo: null, logoMimeType: null, logoUpdatedAt: null },
    });
    return toBusinessSettings(business);
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

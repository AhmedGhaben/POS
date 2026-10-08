import { BadRequestException } from "@nestjs/common";
import { BusinessesService, toBusinessSettings } from "./businesses.service";
import { formatMoney, SUPPORTED_CURRENCIES } from "../common/utils/currency";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const BUSINESS: any = {
  id: "biz-1",
  name: "Corner Cafe",
  currency: "USD",
  logo: PNG_BYTES,
  logoMimeType: "image/png",
  logoUpdatedAt: new Date(1_700_000_000_000),
};

function buildService() {
  const prisma = {
    business: {
      findUnique: jest.fn().mockResolvedValue(BUSINESS),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...BUSINESS, ...data })),
    },
  };
  return { service: new BusinessesService(prisma as any), prisma };
}

const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;

describe("BusinessesService", () => {
  describe("toBusinessSettings", () => {
    it("drops the logo bytes and exposes a cache-busting logoUrl", () => {
      const settings = toBusinessSettings(BUSINESS);

      expect(settings).not.toHaveProperty("logo");
      expect(settings).not.toHaveProperty("logoMimeType");
      expect(settings.logoUrl).toBe("/businesses/biz-1/logo?v=1700000000000");
    });

    it("returns a null logoUrl without a logo", () => {
      expect(toBusinessSettings({ ...BUSINESS, logo: null, logoUpdatedAt: null }).logoUrl).toBeNull();
    });
  });

  describe("setLogo", () => {
    it("stores a valid PNG", async () => {
      const { service, prisma } = buildService();

      await service.setLogo("biz-1", dataUrl("image/png", PNG_BYTES));

      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: "biz-1" },
        data: { logo: PNG_BYTES, logoMimeType: "image/png", logoUpdatedAt: expect.any(Date) },
      });
    });

    it("rejects an unsupported type", async () => {
      const { service } = buildService();

      await expect(service.setLogo("biz-1", dataUrl("image/svg+xml", PNG_BYTES))).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects bytes that don't match the declared type", async () => {
      const { service } = buildService();

      await expect(service.setLogo("biz-1", dataUrl("image/jpeg", PNG_BYTES))).rejects.toThrow(
        "doesn't match",
      );
    });

    it("rejects files over 300 KB", async () => {
      const { service } = buildService();
      const big = Buffer.concat([PNG_BYTES, Buffer.alloc(301 * 1024)]);

      await expect(service.setLogo("biz-1", dataUrl("image/png", big))).rejects.toThrow("300 KB");
    });
  });
});

describe("currency utils", () => {
  it("offers 0-2 decimal currencies and excludes 3-decimal ones", () => {
    expect(SUPPORTED_CURRENCIES).toEqual(expect.arrayContaining(["USD", "EUR", "JPY", "MAD"]));
    expect(SUPPORTED_CURRENCIES).not.toContain("TND");
    expect(SUPPORTED_CURRENCIES).not.toContain("KWD");
  });

  it("formats with the currency's own symbol and decimals", () => {
    expect(formatMoney("12.5", "USD")).toBe("$12.50");
    expect(formatMoney(1234, "EUR")).toBe("€1,234.00");
    expect(formatMoney(500, "JPY")).toBe("¥500");
  });
});

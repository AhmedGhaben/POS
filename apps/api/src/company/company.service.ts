import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { countryConfig } from "../countries";
import { CreateBankAccountDto, CreateTaxRateDto, UpdateBankAccountDto, UpdateTaxRateDto } from "./dto/company.dto";

/** "AO06 0040 0000 …" → "AO060040…"; null if it can't be an IBAN. */
export function normalizeIban(raw: string): string | null {
  const iban = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return null;
  // ISO 13616 check digits: move the first 4 to the end, letters to numbers, mod 97 = 1.
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1 ? iban : null;
}

/**
 * The business's bank accounts and tax rates ("Dados da Empresa",
 * docs/plans/ANGOLA.md phase 7). Rates start as a copy of the country's
 * defaults and are the owner's to change.
 */
@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  private async country(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { country: true } });
    return countryConfig(business.country);
  }

  // ------------------------------------------------------------ bank accounts

  listBankAccounts(businessId: string) {
    return this.prisma.bankAccount.findMany({ where: { businessId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  }

  private async bankFields(businessId: string, dto: Partial<CreateBankAccountDto>) {
    const data: Prisma.BankAccountUncheckedUpdateInput = {};
    if (dto.bankCode !== undefined) {
      if (dto.bankCode === "OTHER") {
        if (!dto.bankName?.trim()) throw new BadRequestException("Type the bank's name");
        data.bankCode = "OTHER";
        data.bankName = dto.bankName.trim();
      } else {
        const bank = (await this.country(businessId))?.banks.find((b) => b.code === dto.bankCode);
        if (!bank) throw new BadRequestException("Unknown bank");
        data.bankCode = bank.code;
        data.bankName = bank.name;
      }
    }
    if (dto.iban !== undefined) {
      const iban = normalizeIban(dto.iban);
      if (!iban) throw new BadRequestException("This IBAN isn't valid");
      data.iban = iban;
    }
    if (dto.accountHolder !== undefined) data.accountHolder = dto.accountHolder.trim();
    if (dto.showOnQuotes !== undefined) data.showOnQuotes = dto.showOnQuotes;
    if (dto.showOnInvoices !== undefined) data.showOnInvoices = dto.showOnInvoices;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    return data;
  }

  async createBankAccount(businessId: string, dto: CreateBankAccountDto) {
    const data = await this.bankFields(businessId, dto);
    return this.prisma.bankAccount.create({ data: { ...(data as Prisma.BankAccountUncheckedCreateInput), businessId } });
  }

  async updateBankAccount(businessId: string, id: string, dto: UpdateBankAccountDto) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, businessId } });
    if (!account) throw new NotFoundException("Bank account not found");
    const data = await this.bankFields(businessId, { ...dto, ...(dto.bankCode === "OTHER" && !dto.bankName ? { bankName: account.bankName } : {}) });
    return this.prisma.bankAccount.update({ where: { id }, data });
  }

  async deleteBankAccount(businessId: string, id: string) {
    const { count } = await this.prisma.bankAccount.deleteMany({ where: { id, businessId } });
    if (!count) throw new NotFoundException("Bank account not found");
    return { deleted: true };
  }

  // ------------------------------------------------------------ tax rates

  /** The business's rates, seeded from the country's defaults the first time. */
  async listTaxRates(businessId: string) {
    const existing = await this.prisma.taxRate.findMany({ where: { businessId }, orderBy: [{ isDefault: "desc" }, { percentage: "desc" }] });
    if (existing.length > 0) return existing;
    const config = await this.country(businessId);
    if (!config) return [];
    await this.prisma.taxRate.createMany({
      data: config.taxRates.map((r) => ({
        businessId,
        key: r.key,
        name: r.name,
        taxType: r.taxType,
        taxCode: r.taxCode,
        percentage: new Prisma.Decimal(r.percentage),
        region: r.region,
        isDefault: r.isDefault,
        verifyValidity: !!r.verifyValidity,
        note: r.note ?? null,
      })),
      skipDuplicates: true,
    });
    const rates = await this.prisma.taxRate.findMany({ where: { businessId }, orderBy: [{ isDefault: "desc" }, { percentage: "desc" }] });
    // Products from before rates were picked by name: link the rate with the same percentage.
    for (const r of rates.filter((x) => x.region === config.code && x.taxType === "IVA")) {
      await this.prisma.product.updateMany({
        where: { businessId, taxRateId: null, taxRate: r.percentage, NOT: { taxRate: 0 } },
        data: { taxRateId: r.id, taxCode: r.taxCode },
      });
    }
    return rates;
  }

  async createTaxRate(businessId: string, dto: CreateTaxRateDto) {
    const config = await this.country(businessId);
    const regions = config ? [config.code, ...(config.specialRegion ? [config.specialRegion.region] : [])] : [dto.region];
    if (!regions.includes(dto.region)) throw new BadRequestException("Unknown tax region");
    await this.listTaxRates(businessId);
    return this.prisma.taxRate.create({
      data: {
        businessId,
        name: dto.name.trim(),
        taxType: "IVA",
        taxCode: dto.taxCode,
        percentage: new Prisma.Decimal(dto.percentage),
        region: dto.region,
        note: dto.note?.trim() || null,
      },
    });
  }

  async updateTaxRate(businessId: string, id: string, dto: UpdateTaxRateDto) {
    const rate = await this.prisma.taxRate.findFirst({ where: { id, businessId } });
    if (!rate) throw new NotFoundException("Tax rate not found");
    if (dto.active === false && (dto.isDefault || rate.isDefault)) throw new BadRequestException("The default rate can't be turned off");
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.taxRate.updateMany({ where: { businessId, isDefault: true }, data: { isDefault: false } });
      // Products charge the rate they picked: a new percentage applies to them
      // from the next sale (past sales keep what they were charged).
      if (dto.percentage !== undefined && !rate.percentage.equals(dto.percentage)) {
        await tx.product.updateMany({ where: { businessId, taxRateId: id }, data: { taxRate: new Prisma.Decimal(dto.percentage) } });
      }
      return tx.taxRate.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          percentage: dto.percentage !== undefined ? new Prisma.Decimal(dto.percentage) : undefined,
          active: dto.isDefault ? true : dto.active,
          isDefault: dto.isDefault,
          verifyValidity: dto.verifyValidity,
          note: dto.note === undefined ? undefined : dto.note.trim() || null,
        },
      });
    });
  }
}

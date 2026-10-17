import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LedgerAccountCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isMappingKey, MAPPING_KEYS } from "./mapping";

/** The integration's account mapping, as the settings screen shows and changes it (step A4). */
@Injectable()
export class MappingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string) {
    const [rows, accounts] = await Promise.all([
      this.prisma.accountMapping.findMany({ where: { businessId }, include: { account: { select: { id: true, code: true, name: true } } } }),
      this.prisma.ledgerAccount.findMany({ where: { businessId }, select: { id: true, code: true, name: true } }),
    ]);
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const mapped = new Map(rows.map((r) => [r.key, r.account]));
    const keys = [...MAPPING_KEYS.map((k) => k.key), ...rows.map((r) => r.key).filter((k) => !MAPPING_KEYS.some((m) => m.key === k))];
    return keys.map((key) => {
      const def = MAPPING_KEYS.find((k) => k.key === key);
      const custom = mapped.get(key) ?? null;
      const fallback = def && !def.defaultCode.startsWith("@") ? (byCode.get(def.defaultCode) ?? null) : null;
      return {
        key,
        group: def?.group ?? "sales",
        defaultCode: def?.defaultCode ?? null,
        account: custom ?? fallback,
        custom: !!custom,
      };
    });
  }

  /** Points a key at an account (a movement account), or back to its default (null). */
  async set(businessId: string, key: string, accountId: string | null) {
    if (!isMappingKey(key)) throw new BadRequestException("Unknown mapping key");
    if (accountId === null) {
      await this.prisma.accountMapping.deleteMany({ where: { businessId, key } });
      return { key, accountId: null };
    }
    const account = await this.prisma.ledgerAccount.findFirst({ where: { id: accountId, businessId } });
    if (!account) throw new NotFoundException("Account not found");
    if (account.category !== LedgerAccountCategory.GM) throw new BadRequestException(`Account ${account.code} is not a movement account: only movement (GM) accounts take postings`);
    await this.prisma.accountMapping.upsert({
      where: { businessId_key: { businessId, key } },
      create: { businessId, key, accountId },
      update: { accountId },
    });
    return { key, accountId };
  }
}

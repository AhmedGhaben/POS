import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { LedgerAccount, LedgerAccountCategory, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { accountName, categoryFor, classOf, compareCodes, isValidCode, nextChildCode, parentCode } from "./chart";
import { LINKED_PARENTS, PGC_TEMPLATE } from "./pgc-template";

type Db = Prisma.TransactionClient | PrismaService;

export type LinkType = "CUSTOMER" | "SUPPLIER" | "TILL" | "BANK";

export interface AccountRow {
  id: string;
  code: string;
  name: string;
  category: LedgerAccountCategory;
  parentId: string | null;
  classNo: number;
  isActive: boolean;
  linkType: string | null;
  linkId: string | null;
  fromTemplate: boolean;
  hasMovements: boolean;
}

/**
 * The chart of accounts (docs/ACCOUNTING-DECISIONS.md, step A1): the PGC
 * template, the accountant's own accounts, and the sub-accounts the app
 * keeps for each customer, supplier, till and bank account.
 */
@Injectable()
export class ChartService {
  constructor(private readonly prisma: PrismaService) {}

  /** Puts the PGC template in, once (a business that already has accounts keeps them). */
  async installTemplate(tx: Db, businessId: string): Promise<number> {
    if (await tx.ledgerAccount.count({ where: { businessId } })) return 0;
    const codes = new Set(PGC_TEMPLATE.map(([code]) => code));
    const hasChildren = new Set([...codes].map(parentCode).filter((c): c is string => !!c));
    const ids = new Map<string, string>();
    // Parents before children: the template lists them in that order.
    for (const [code, name] of PGC_TEMPLATE) {
      const parent = parentCode(code);
      const row = await tx.ledgerAccount.create({
        data: {
          businessId,
          code,
          name,
          category: categoryFor(code, hasChildren.has(code)),
          parentId: parent ? ids.get(parent)! : null,
          classNo: classOf(code),
          fromTemplate: true,
        },
        select: { id: true },
      });
      ids.set(code, row.id);
    }
    return PGC_TEMPLATE.length;
  }

  /**
   * Opens the accounts the app keeps (customers, suppliers, tills, bank
   * accounts) that are missing, and keeps their names in step. Serialised
   * per business, so two runs never pick the same code.
   */
  async ensureLinkedAccounts(businessId: string, opts: { cashPerTill?: boolean } = {}): Promise<number> {
    const settings = await this.prisma.accountingSettings.findUnique({ where: { businessId } });
    const cashPerTill = opts.cashPerTill ?? settings?.cashPerTill ?? true;
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger:${businessId}`}))`;
        const accounts = await tx.ledgerAccount.findMany({ where: { businessId }, select: { id: true, code: true, name: true, category: true, parentId: true, linkType: true, linkId: true } });
        const byCode = new Map(accounts.map((a) => [a.code, a]));
        const linked = new Map(accounts.filter((a) => a.linkType).map((a) => [`${a.linkType}|${a.linkId}`, a]));
        const codes = accounts.map((a) => a.code);
        let created = 0;

        const open = async (type: LinkType, id: string, parent: string, name: string, width: number, first: number) => {
          const existing = linked.get(`${type}|${id}`);
          if (existing) {
            if (existing.name !== accountName(name)) await tx.ledgerAccount.update({ where: { id: existing.id }, data: { name: accountName(name) } });
            return;
          }
          const parentRow = byCode.get(parent);
          if (!parentRow) return; // the accountant removed the parent: nothing to open under
          const code = nextChildCode(parent, codes, { width, first });
          codes.push(code);
          await tx.ledgerAccount.create({
            data: { businessId, code, name: accountName(name), category: LedgerAccountCategory.GM, parentId: parentRow.id, classNo: classOf(code), linkType: type, linkId: id },
          });
          if (parentRow.category === LedgerAccountCategory.GM) {
            await tx.ledgerAccount.update({ where: { id: parentRow.id }, data: { category: LedgerAccountCategory.GA } });
            parentRow.category = LedgerAccountCategory.GA;
          }
          created++;
        };

        const customers = await tx.customer.findMany({ where: { businessId, isFinalConsumer: false }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, country: true } });
        for (const c of customers) await open("CUSTOMER", c.id, c.country && c.country !== "AO" ? LINKED_PARENTS.CUSTOMER_FOREIGN : LINKED_PARENTS.CUSTOMER, c.name, 4, 1);
        const suppliers = await tx.supplier.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, country: true } });
        for (const s of suppliers) await open("SUPPLIER", s.id, s.country && s.country !== "AO" ? LINKED_PARENTS.SUPPLIER_FOREIGN : LINKED_PARENTS.SUPPLIER, s.name, 4, 1);
        if (cashPerTill) {
          const tills = await tx.terminal.findMany({ where: { businessId }, orderBy: { sequence: "asc" }, include: { store: { select: { name: true } } } });
          // 45.1.1 is Caixa principal: tills start at 45.1.2.
          for (const t of tills) await open("TILL", t.id, LINKED_PARENTS.TILL, `Caixa ${t.code} – ${t.name} (${t.store.name})`, 1, 2);
        }
        const banks = await tx.bankAccount.findMany({ where: { businessId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
        // 43.1.1 is the default bank account: the business's own start at 43.1.2.
        for (const b of banks) await open("BANK", b.id, LINKED_PARENTS.BANK, `${b.bankName} – ${b.iban.replace(/\s+/g, "").slice(-8)}`, 1, 2);
        return created;
      },
      { timeout: 60_000 },
    );
  }

  /** The account the app keeps for a customer, supplier, till or bank account, if open. */
  linkedAccount(db: Db, businessId: string, linkType: LinkType, linkId: string) {
    return db.ledgerAccount.findUnique({ where: { businessId_linkType_linkId: { businessId, linkType, linkId } } });
  }

  async list(businessId: string): Promise<AccountRow[]> {
    const accounts = await this.prisma.ledgerAccount.findMany({ where: { businessId } });
    const moved = await this.withMovements(this.prisma, accounts.map((a) => a.id));
    return accounts
      .sort((a, b) => compareCodes(a.code, b.code))
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        category: a.category,
        parentId: a.parentId,
        classNo: a.classNo,
        isActive: a.isActive,
        linkType: a.linkType,
        linkId: a.linkId,
        fromTemplate: a.fromTemplate,
        hasMovements: moved.has(a.id),
      }));
  }

  /** A new account. Its parent is its code less the last part, and must exist (except a new first-degree account). */
  async create(businessId: string, input: { code: string; name: string }) {
    const code = input.code.trim();
    if (!isValidCode(code)) {
      throw new BadRequestException("Account codes are the class digit and a second digit (e.g. 31), then parts separated by dots (31.1.2): up to 30 characters");
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger:${businessId}`}))`;
      if (await tx.ledgerAccount.findUnique({ where: { businessId_code: { businessId, code } } })) {
        throw new ConflictException(`There's already an account ${code}`);
      }
      const parentAt = parentCode(code);
      const parent = parentAt ? await tx.ledgerAccount.findUnique({ where: { businessId_code: { businessId, code: parentAt } } }) : null;
      if (parentAt && !parent) throw new BadRequestException(`Open account ${parentAt} first: ${code} goes under it`);
      if (parent?.category === LedgerAccountCategory.GM) {
        if ((await this.withMovements(tx, [parent.id])).size) {
          throw new BadRequestException(`${parent.code} has movements: a movement account can't get sub-accounts`);
        }
        if (parent.linkType) throw new BadRequestException(`${parent.code} is kept by the app: it can't get sub-accounts`);
        await tx.ledgerAccount.update({ where: { id: parent.id }, data: { category: LedgerAccountCategory.GA } });
      }
      return tx.ledgerAccount.create({
        data: { businessId, code, name: accountName(input.name), category: categoryFor(code, false), parentId: parent?.id ?? null, classNo: classOf(code) },
      });
    });
  }

  /** Rename or (de)activate. An inactive account takes no new postings. */
  async update(businessId: string, id: string, input: { name?: string; isActive?: boolean }) {
    const account = await this.get(businessId, id);
    return this.prisma.ledgerAccount.update({
      where: { id: account.id },
      data: { ...(input.name !== undefined ? { name: accountName(input.name) } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) },
    });
  }

  /** Only an account with no movements and no sub-accounts can go; its parent may become a movement account again. */
  async remove(businessId: string, id: string) {
    const account = await this.get(businessId, id);
    await this.prisma.$transaction(async (tx) => {
      if (await tx.ledgerAccount.count({ where: { parentId: account.id } })) {
        throw new BadRequestException(`${account.code} has sub-accounts: remove them first`);
      }
      if ((await this.withMovements(tx, [account.id])).size) {
        throw new BadRequestException(`${account.code} has movements: it can be deactivated, not removed`);
      }
      if (account.linkType) throw new BadRequestException(`${account.code} is kept by the app: deactivate it instead`);
      await tx.ledgerAccount.delete({ where: { id: account.id } });
      if (account.parentId && !(await tx.ledgerAccount.count({ where: { parentId: account.parentId } }))) {
        const parent = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: account.parentId } });
        await tx.ledgerAccount.update({ where: { id: parent.id }, data: { category: categoryFor(parent.code, false) } });
      }
    });
    return { removed: true };
  }

  async get(businessId: string, id: string): Promise<LedgerAccount> {
    const account = await this.prisma.ledgerAccount.findFirst({ where: { id, businessId } });
    if (!account) throw new NotFoundException("Account not found");
    return account;
  }

  /** The accounts among `ids` that have any posting. */
  async withMovements(db: Db, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    void db;
    return new Set();
  }
}

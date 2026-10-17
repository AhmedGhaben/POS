import { LedgerAccount, LedgerAccountCategory } from "@prisma/client";
import { DEFAULT_BANK, LINKED_PARENTS } from "./pgc-template";
import { compareCodes } from "./chart";
import { defaultCodeFor, keyChain } from "./mapping";
import { AccountLookup, MappingError } from "./posting-rules";

/**
 * Mapping keys → accounts for one integration run: the business's own
 * mapping first, then the default account; "@till" and "@bank" are the
 * till's cash account and the first bank account. An account that's
 * missing, inactive or not a movement account is a MappingError.
 */
export class AccountResolver implements AccountLookup {
  private readonly byId: Map<string, LedgerAccount>;
  private readonly byCode: Map<string, LedgerAccount>;
  private readonly linked: Map<string, LedgerAccount>;
  private readonly mapped: Map<string, string>;

  constructor(
    accounts: LedgerAccount[],
    mappings: { key: string; accountId: string }[],
    private readonly cashPerTill: boolean,
  ) {
    this.byId = new Map(accounts.map((a) => [a.id, a]));
    this.byCode = new Map(accounts.map((a) => [a.code, a]));
    this.linked = new Map(accounts.filter((a) => a.linkType).map((a) => [`${a.linkType}|${a.linkId}`, a]));
    this.mapped = new Map(mappings.map((m) => [m.key, m.accountId]));
  }

  key(key: string, ctx: { terminalId?: string | null } = {}): string {
    for (const k of keyChain(key)) {
      const id = this.mapped.get(k);
      if (id) return this.usable(this.byId.get(id), `"${k}"`);
    }
    const code = defaultCodeFor(key);
    if (!code) throw new MappingError(`No account is set for "${key}"`);
    if (code === "@till") return this.till(ctx.terminalId ?? null);
    if (code === "@bank") return this.bank();
    return this.usable(this.byCode.get(code), `"${key}" (${code})`);
  }

  till(terminalId: string | null): string {
    if (this.cashPerTill && terminalId) {
      const account = this.linked.get(`TILL|${terminalId}`);
      if (!account) throw new MappingError("This till has no cash account yet: open the missing accounts in the chart of accounts");
      return this.usable(account, account.code);
    }
    return this.key("cash.main");
  }

  customer(customerId: string): string {
    const account = this.linked.get(`CUSTOMER|${customerId}`);
    if (!account) throw new MappingError("This customer has no account yet: open the missing accounts in the chart of accounts");
    return this.usable(account, account.code);
  }

  supplier(supplierId: string): string {
    const account = this.linked.get(`SUPPLIER|${supplierId}`);
    if (!account) throw new MappingError("This supplier has no account yet: open the missing accounts in the chart of accounts");
    return this.usable(account, account.code);
  }

  /** The first of the business's bank accounts, or the default one. */
  private bank(): string {
    const banks = [...this.linked.values()].filter((a) => a.linkType === "BANK" && a.isActive && a.code.startsWith(`${LINKED_PARENTS.BANK}.`)).sort((a, b) => compareCodes(a.code, b.code));
    if (banks.length) return this.usable(banks[0], banks[0].code);
    return this.usable(this.byCode.get(DEFAULT_BANK), DEFAULT_BANK);
  }

  private usable(account: LedgerAccount | undefined, what: string): string {
    if (!account) throw new MappingError(`The account for ${what} doesn't exist: set it in Contabilidade → Configuração`);
    if (account.category !== LedgerAccountCategory.GM) throw new MappingError(`The account for ${what}, ${account.code}, is not a movement account`);
    if (!account.isActive) throw new MappingError(`The account for ${what}, ${account.code}, is inactive`);
    return account.id;
  }
}

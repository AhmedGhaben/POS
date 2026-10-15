import { countryConfig, SaleStatus } from "@pos/shared";
import type { CreateCustomerDto, CreateSaleDto, CustomerDto, FiscalNumberDto, ProductDto, SaleDto, VoidReason, VoidSaleDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { desktop, useDeviceStore } from "@/features/desktop/bridge";
import { useShiftStore } from "@/features/shifts/shift-store";
import { apiClient, ApiError, isRetryableError, isUnreachableError } from "@/lib/api-client";
import { addToOutbox } from "@/lib/offline-db";
import { findSavedByBarcode } from "./catalog";
import { currentTaxContext, linePrice, priceCart, productTax, type CartLine } from "./hooks/useCart";
import { approvalHeaders, type Approval } from "@/features/overrides/approval";
import { buildOfflineSale } from "./offline-sale";
import { isWorkingOffline, useOfflineStore } from "./offline-store";
import { peekNumber, useFiscalNumbering, type NextNumber } from "@/features/fiscal/numbering";
import { fiscalTimeZone, hashMessage, localDateTime } from "@/features/fiscal/hash";
import i18n from "@/i18n";

/** Long enough for a slow connection, short enough not to hold up a queue. */
const SALE_TIMEOUT_MS = 8_000;

export async function findByBarcode(barcode: string): Promise<ProductDto | null> {
  if (isWorkingOffline()) return findSavedByBarcode(barcode);
  try {
    return await apiClient.get<ProductDto>(`/products/barcode/${encodeURIComponent(barcode)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    if (isUnreachableError(err)) return findSavedByBarcode(barcode);
    throw err;
  }
}

/**
 * Completes a sale. Tries the server first (unless the till already knows
 * it's offline); if the server can't be reached, errors, times out, or the
 * session has lapsed, the sale goes into the local outbox instead and the
 * cashier carries on. Only a real rejection (bad stock, bad payment) is
 * shown as an error. `lines` builds the local receipt for a queued sale.
 */
export async function createSale(dto: CreateSaleDto, lines: CartLine[], approvals: Approval[] = []): Promise<SaleDto> {
  const sale: CreateSaleDto = {
    ...dto,
    // A changed price goes up with the line; otherwise the server uses the product's.
    lineItems: dto.lineItems.map((li, i) => (lines[i]?.unitPrice != null ? { ...li, unitPrice: lines[i].unitPrice! } : li)),
    // Managers' approvals: tokens online; a sale queued offline says who approved instead.
    overrides: approvals.flatMap((a) => (a.kind === "token" ? [{ permission: a.permission, token: a.token }] : [])),
    // One key for every attempt at this sale, online or later from the queue.
    clientId: crypto.randomUUID(),
    terminalId: useDeviceStore.getState().terminal?.id,
    // Uploaded later with the till's key, it stays this person's sale.
    actingUserId: useAuthStore.getState().user?.id,
  };
  // A registered till numbers and signs its Factura-Recibo itself, as it
  // issues it (where sales are fiscal documents), so the receipt has its
  // number and hash characters online or offline.
  const next = tillNumber();
  const gross = priceCart(lines, dto.discount ?? null).total;
  if (next) sale.fiscal = await signForTill(next, gross);
  // The number is used once the sale is accepted or queued; a refused sale gives it back.
  const used = (result: SaleDto) => {
    if (sale.fiscal) useFiscalNumbering.getState().commit("FR", sale.fiscal);
    return result;
  };
  if (isWorkingOffline()) {
    return used(await queueSaleOffline(sale, lines, approvals));
  }
  try {
    return used(await postSale(sale, gross));
  } catch (err) {
    // Sales still waiting in the queue come first: this one joins them.
    if (isRetryableError(err) || (err instanceof ApiError && (err.status === 401 || fiscalCode(err) === "FISCAL_NUMBER_AHEAD"))) {
      return used(await queueSaleOffline(sale, lines, approvals));
    }
    throw err;
  }
}

/**
 * Sends a sale; if its number was already used (the till's count fell
 * behind the server's), takes the server's next number and tries once more.
 */
async function postSale(sale: CreateSaleDto, gross: number): Promise<SaleDto> {
  try {
    return await apiClient.post<SaleDto>("/sales", sale, { timeoutMs: SALE_TIMEOUT_MS });
  } catch (err) {
    const body = err instanceof ApiError && fiscalCode(err) === "FISCAL_NUMBER_USED" ? (err.body as { nextNumber?: number; lastHash?: string }) : null;
    if (!sale.fiscal || !body?.nextNumber) throw err;
    // Carry on from where the server's chain is, and sign again.
    useFiscalNumbering.getState().adopt("FR", sale.fiscal.series, body.nextNumber, body.lastHash ?? "");
    sale.fiscal = await signForTill({ series: sale.fiscal.series, number: body.nextNumber, previousHash: body.lastHash ?? "" }, gross);
    return apiClient.post<SaleDto>("/sales", sale, { timeoutMs: SALE_TIMEOUT_MS });
  }
}

/**
 * Signs the document on the till (the key stays in the Windows app): the
 * message over the previous document's hash, dated by the shop's clock.
 */
async function signForTill(next: NextNumber, grossTotal: number, at = new Date()): Promise<FiscalNumberDto> {
  const local = localDateTime(at, storeTimeZone());
  const { hash, keyVersion } = await desktop!.signing!.sign(
    hashMessage({ invoiceDate: local.date, systemEntryDate: local.dateTime, documentNo: `FR ${next.series}/${next.number}`, grossTotal: grossTotal.toFixed(2), previousHash: next.previousHash }),
  );
  return { series: next.series, number: next.number, hash, signedAt: at.toISOString(), keyVersion };
}

/** The current store's time zone for fiscal dates (stores left on UTC take the country's). */
function storeTimeZone(): string {
  const { stores, currentStoreId } = useAuthStore.getState();
  const store = stores.find((s) => s.id === currentStoreId);
  return fiscalTimeZone(store?.timezone, countryConfig(store?.country ?? null)?.timeZone);
}

function fiscalCode(err: ApiError): string | undefined {
  return (err.body as { code?: string } | undefined)?.code;
}

/**
 * This till's next FR number, when it numbers and signs its own: a
 * registered till holding its signing key, in a country with fiscal documents.
 */
function tillNumber(): NextNumber | null {
  if (!fiscalSales()) return null;
  if (!desktop?.signing || !useDeviceStore.getState().signing?.hasKey) return null;
  return peekNumber(useFiscalNumbering.getState(), useDeviceStore.getState().terminal, "FR", localDateTime(new Date(), storeTimeZone()).year);
}

/** Sales here are fiscal documents (the store's country has a fiscal config). */
function fiscalSales(): boolean {
  return !!countryConfig(currentTaxContext().country);
}

async function queueSaleOffline(sale: CreateSaleDto, lines: CartLine[], approvals: Approval[]): Promise<SaleDto> {
  // A fiscal document has to be signed when it's issued: without the till's
  // signing key it can't be issued offline (the customer would hold an
  // unsigned receipt).
  if (fiscalSales() && !sale.fiscal?.hash) throw new Error(i18n.t("pos:fiscal.cantIssueOffline"));
  const createdAt = sale.fiscal?.signedAt ?? new Date().toISOString();
  const ctx = currentTaxContext();
  const payload: CreateSaleDto = {
    ...sale,
    offline: { createdAt, pricesIncludeTax: ctx.taxIncluded },
    overrides: undefined,
    offlineOverrides: approvals.map((a) => ({ approverId: a.approverId, permission: a.permission })),
    // The server records these prices, not whatever they are by sync time.
    lineItems: lines.map((l) => ({
      productId: l.product.id,
      quantity: l.quantity,
      unitPrice: linePrice(l),
      taxRate: productTax(l.product, ctx).rate,
      discount: l.discount ?? undefined,
    })),
  };
  const receipt = { ...buildOfflineSale(sale.clientId!, payload, lines), ...currentCashier() };
  await addToOutbox({ clientId: sale.clientId!, kind: "sale", payload, createdAt, receipt });
  await useOfflineStore.getState().refreshPendingCount();
  return receipt;
}

function currentCashier(): Pick<SaleDto, "cashierId" | "cashier"> {
  const user = useAuthStore.getState().user;
  return user
    ? { cashierId: user.id, cashier: { id: user.id, firstName: user.firstName, lastName: user.lastName } }
    : { cashierId: "" };
}

/** This store's latest sales on the server, newest first. */
export function fetchRecentSales(storeId: string) {
  return apiClient.get<SaleDto[]>(`/sales/store/${storeId}`);
}

/**
 * Cancels a sale. Online, the server does it straight away. Offline, or for
 * a sale still waiting to upload, the cancel waits in the outbox behind the
 * sale and the till shows the sale as cancelled meanwhile.
 */
export async function voidSale(
  sale: SaleDto,
  reason: VoidReason,
  note?: string,
  /** A manager's approval, for someone without VOID_SALE. */
  approval?: Approval | null,
): Promise<{ sale: SaleDto; queued: boolean }> {
  const base: VoidSaleDto = {
    storeId: sale.storeId,
    reason,
    note: note?.trim() || undefined,
    actingUserId: useAuthStore.getState().user?.id,
    // Uploaded later by the till: who approved it (checked on the till or the server).
    offlineOverride: approval ? { approverId: approval.approverId, permission: approval.permission } : undefined,
  };

  const queue = async () => {
    const occurredAt = new Date().toISOString();
    const clientId = crypto.randomUUID();
    await addToOutbox({
      clientId,
      kind: "void-sale",
      createdAt: occurredAt,
      // By the till's own key when there is one: the sale may not have
      // reached the server yet.
      payload: { ...base, occurredAt, ...(sale.clientId ? { saleClientId: sale.clientId } : { saleId: sale.id }) },
    });
    await useOfflineStore.getState().refreshPendingCount();
    const { cashier } = currentCashier();
    return {
      sale: { ...sale, status: SaleStatus.VOIDED, voidedAt: occurredAt, voidReason: reason, voidNote: base.note ?? null, voidedBy: cashier ?? null },
      queued: true,
    };
  };

  const result = await (async () => {
    if (sale.queued || isWorkingOffline()) return queue();
    try {
      const { offlineOverride: _offline, ...online } = base;
      const voided = await apiClient.post<SaleDto>(
        "/sales/void",
        { ...online, saleId: sale.id },
        { timeoutMs: SALE_TIMEOUT_MS, headers: approvalHeaders(approval) },
      );
      return { sale: voided, queued: false };
    } catch (err) {
      if (isRetryableError(err) || (err instanceof ApiError && err.status === 401)) return queue();
      throw err;
    }
  })();
  // Out of the open shift's expected cash too.
  useShiftStore.getState().recordVoid(sale.clientId ?? sale.id);
  return result;
}

export function searchCustomers(search: string) {
  return apiClient.get<CustomerDto[]>(`/customers?search=${encodeURIComponent(search)}`);
}

export function createCustomer(dto: CreateCustomerDto) {
  return apiClient.post<CustomerDto>("/customers", dto);
}

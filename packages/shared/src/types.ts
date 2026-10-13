import type { DiscountInput, DiscountType } from "./pricing";
import type { IvaRegime } from "./countries/types";
import type {
  Plan,
  Role,
  SaleStatus,
  PaymentMethod,
  PurchaseStatus,
  ExpenseCategory,
  Permission,
  DrawerOpenReason,
} from "./enums";

export interface BusinessDto {
  id: string;
  name: string;
  plan: Plan;
  legalName: string | null;
  /** NIF (alphanumeric in Angola). */
  taxId: string | null;
  /** Número de Registo Comercial. */
  registrationNumber: string | null;
  /** Legal form code from the country config. */
  legalForm?: string | null;
  /** CAE. */
  eacCode?: string | null;
  address: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  country?: string;
  /** Documents go to AGT in real time: no monthly SAF-T reminder. */
  eInvoicingActive?: boolean;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** ISO 4217, 0-2 decimal places. */
  currency: string;
  /** Receipts, quotes, invoices and customer emails: "en", "pt-PT" or "pt-BR". */
  language: string;
  /** Decimal string, e.g. "19". */
  defaultTaxRate: string;
  /** Largest discount % anyone but the owner may give (decimal string); null = no limit. */
  maxDiscountPercent: string | null;
  /** A shift's cash difference above this (decimal string, either way) is flagged; null = never. */
  shiftDifferenceThreshold?: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  invoiceFooter: string | null;
  /** Relative to the API root (prefix with /api in the web app); null without a logo. */
  logoUrl: string | null;
}

export type UpdateBusinessDto = Partial<
  Pick<
    BusinessDto,
    | "name"
    | "legalForm"
    | "eacCode"
    | "city"
    | "postalCode"
    | "province"
    | "country"
    | "eInvoicingActive"
    | "legalName"
    | "taxId"
    | "registrationNumber"
    | "address"
    | "phone"
    | "email"
    | "website"
    | "currency"
    | "language"
    | "receiptHeader"
    | "receiptFooter"
    | "invoiceFooter"
  >
> & { defaultTaxRate?: number; maxDiscountPercent?: number | null; shiftDifferenceThreshold?: number | null };

export interface UpdateStoreDto {
  name?: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  country?: string;
  /** Owner only; logged. */
  ivaRegime?: IvaRegime;
  pricesIncludeTax?: boolean;
  phone?: string | null;
  timezone?: string;
}

export interface StoreDto {
  id: string;
  businessId: string;
  name: string;
  address: string | null;
  city?: string | null;
  postalCode?: string | null;
  /** Province code from the country config (CA = Cabinda gets the regional rate). */
  province?: string | null;
  /** The country config that applies (absent on sessions saved before it existed: AO). */
  country?: string;
  ivaRegime?: IvaRegime;
  /** Shelf prices include IVA. */
  pricesIncludeTax?: boolean;
  phone: string | null;
  timezone: string;
  isActive: boolean;
}

/** Structured address (SAF-T) for customers and suppliers. */
export interface AddressFields {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  /** ISO alpha-2. */
  country?: string;
}

/** GET /bank-accounts */
export interface BankAccountDto {
  id: string;
  bankCode: string;
  bankName: string;
  accountHolder: string;
  iban: string;
  showOnQuotes: boolean;
  showOnInvoices: boolean;
  sortOrder: number;
}

export interface SaveBankAccountDto {
  bankCode: string;
  bankName?: string;
  accountHolder: string;
  iban: string;
  showOnQuotes?: boolean;
  showOnInvoices?: boolean;
}

/** GET /tax-rates: the business's rates (seeded from the country config). */
export interface TaxRateDto {
  id: string;
  key: string | null;
  name: string;
  taxType: string;
  taxCode: string;
  /** Decimal string. */
  percentage: string;
  region: string;
  isDefault: boolean;
  verifyValidity: boolean;
  note: string | null;
  active: boolean;
}

export interface UserDto {
  id: string;
  businessId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  /** Only present on login/register responses; absent on older persisted sessions. */
  emailVerified?: boolean;
  /** The person's chosen language ("en", "pt-PT", "pt-BR"); null until chosen. Absent on older sessions. */
  language?: string | null;
  accessibleStoreIds: string[];
}

export type EffectivePermissionsDto = Record<Permission, boolean>;

export interface UpdateUserPermissionDto {
  permission: Permission;
  granted?: boolean | null;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface RegisterRequestDto {
  businessName: string;
  storeName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** IANA zone, e.g. "Europe/Paris"; the API defaults to UTC. */
  timezone?: string;
  /** The sign-up page's language; becomes the owner's and the business's. */
  language?: string;
}

export interface LoginResponseDto {
  accessToken: string;
  user: UserDto;
  stores: StoreDto[];
  business: BusinessDto;
}

export interface CategoryDto {
  id: string;
  businessId: string;
  name: string;
}

export interface ProductDto {
  id: string;
  businessId: string;
  categoryId: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  costPrice: string;
  sellPrice: string;
  taxRate: string;
  /** False for services etc.: always sellable, never moves stock (absent on older cached catalogs = true). */
  trackStock?: boolean;
  isActive: boolean;
}

export interface CreateProductDto {
  categoryId?: string | null;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  costPrice: number;
  sellPrice: number;
  taxRate?: number;
  /** False for services etc.; defaults to true. */
  trackStock?: boolean;
}

/** PATCH /products/:id. `isActive: false` archives, `true` restores. */
export type UpdateProductDto = Partial<CreateProductDto> & { isActive?: boolean };

export interface InventoryItemDto {
  id: string;
  storeId: string;
  productId: string;
  product: ProductDto;
  quantity: number;
  reorderLevel: number;
}

export interface AdjustStockDto {
  quantity: number;
  reorderLevel?: number;
}

export interface CreateCustomerDto extends Omit<AddressFields, "address"> {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
}

export interface CustomerDto {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  country?: string;
  taxId: string | null;
  /** "Consumidor Final" (NIF 999999999), used when no customer is chosen. */
  isFinalConsumer?: boolean;
}

/** GET /customers/:id/card */
export interface CustomerCardDto {
  customer: CustomerDto;
  purchases: { count: number; total: string; lastAt: string | null };
  recent: { id: string; receiptNumber: string; createdAt: string; total: string; status: SaleStatus }[];
}

export interface SaleLineItemInputDto {
  productId: string;
  quantity: number;
  /**
   * The price the till used. Offline: whatever it was. Online: only when
   * the cashier changed it (needs CHANGE_PRICE or a manager's approval).
   */
  unitPrice?: number;
  taxRate?: number;
  /** Off this line. */
  discount?: DiscountInput | null;
}

export interface SalePaymentInputDto {
  method: PaymentMethod;
  amount: number;
  /** Only meaningful for a CASH leg; omitted means "exact cash, no change". */
  tendered?: number;
}

export interface CreateSaleDto {
  storeId: string;
  customerId?: string | null;
  /** Ad-hoc address to email the receipt to. If omitted and a customer with
   * an email is attached, that email is used automatically. */
  receiptEmail?: string;
  payments: SalePaymentInputDto[];
  lineItems: SaleLineItemInputDto[];
  /** Idempotency key generated by the till before the first attempt. */
  clientId?: string;
  /** The desktop till that rang the sale up. */
  terminalId?: string;
  /** Set when the sale was rung up without reaching the server. */
  offline?: { createdAt: string };
  /** Off the whole sale, after the lines' own discounts. */
  discount?: DiscountInput | null;
  /** Who was on the till (used when it uploads with the till's key). */
  actingUserId?: string;
  /** The till's id for its open shift. */
  shiftClientId?: string;
  /** Online: managers' approvals for what the cashier may not do alone (price change, discounts). */
  overrides?: SaleOverrideDto[];
  /** Offline: approvals the till checked itself (approver's PIN). */
  offlineOverrides?: OfflineOverrideDto[];
}

/** A manager's approval (POST /overrides) used by a sale. */
export interface SaleOverrideDto {
  permission: Permission;
  token: string;
}

/** A manager approval checked on the till while offline. */
export interface OfflineOverrideDto {
  approverId: string;
  permission: Permission;
}

/** POST /overrides: a manager approves one action with their PIN. */
export interface RequestOverrideDto {
  approverId: string;
  pin: string;
  permission: Permission;
  action: string;
  storeId?: string;
  details?: Record<string, unknown>;
}

export interface OverrideGrantDto {
  token: string;
  expiresAt: string;
  approver: { id: string; firstName: string; lastName: string };
}

export interface ApproverDto {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
}

export interface SalePaymentDto {
  id: string;
  method: PaymentMethod;
  amount: string;
  tendered: string | null;
  change: string | null;
}

export interface SaleLineItemDto {
  id: string;
  productId: string;
  product: ProductDto;
  quantity: number;
  unitPrice: string;
  taxAmount: string;
  /** Everything taken off the line: its own discount plus its share of the sale's. */
  discountAmount: string;
  lineTotal: string;
  /** The line's own discount as given, and what it came to (absent on older sales). */
  discountType?: DiscountType | null;
  discountValue?: string | null;
  lineDiscountAmount?: string;
}

export interface SupplierDto {
  id: string;
  businessId: string;
  name: string;
  contactName: string | null;
  /** NIF. */
  taxId?: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  country?: string;
}

export interface CreateSupplierDto extends Omit<AddressFields, "address"> {
  name: string;
  contactName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface EmployeeDto {
  id: string;
  businessId: string;
  storeId: string | null;
  store: StoreDto | null;
  userId: string | null;
  user: StaffAccessDto | null;
  firstName: string;
  lastName: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  hireDate: string | null;
  wage: string | null;
  isActive: boolean;
}

export interface CreateEmployeeDto {
  firstName: string;
  lastName: string;
  position?: string;
  phone?: string;
  email?: string;
  hireDate?: string;
  wage?: number;
  storeId?: string;
  userId?: string;
  /** Owner only: create a login for the employee in the same request. */
  login?: StaffLoginDto;
}

/** Roles an owner can give a staff login. */
export type StaffRole = "CASHIER" | "MANAGER";

/** Exactly one of `password` or `sendInvite: true`. */
export interface StaffLoginDto {
  email: string;
  role: StaffRole;
  storeIds: string[];
  password?: string;
  sendInvite?: boolean;
}

export interface StaffAccessDto {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  storeIds: string[];
  /** Can sign in on a till with a PIN (employee lists only). */
  hasPin?: boolean;
}

export interface UpdateStaffAccessDto {
  role?: StaffRole;
  storeIds?: string[];
  isActive?: boolean;
}

export interface PurchaseLineItemInputDto {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseDto {
  storeId: string;
  supplierId: string;
  lineItems: PurchaseLineItemInputDto[];
}

export interface PurchaseLineItemDto {
  id: string;
  productId: string;
  product: ProductDto;
  quantity: number;
  unitCost: string;
  lineTotal: string;
}

export interface PurchaseDto {
  id: string;
  storeId: string;
  supplierId: string;
  supplier: SupplierDto;
  purchaseNumber: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  status: PurchaseStatus;
  createdAt: string;
  lineItems: PurchaseLineItemDto[];
}

export interface TransferLineItemInputDto {
  productId: string;
  quantity: number;
}

export interface CreateTransferDto {
  fromStoreId: string;
  toStoreId: string;
  note?: string;
  lineItems: TransferLineItemInputDto[];
}

export interface TransferLineItemDto {
  id: string;
  productId: string;
  product: ProductDto;
  quantity: number;
}

export interface TransferStoreSummaryDto {
  id: string;
  name: string;
}

export interface StockTransferDto {
  id: string;
  fromStoreId: string;
  fromStore: TransferStoreSummaryDto;
  toStoreId: string;
  toStore: TransferStoreSummaryDto;
  transferredById: string;
  note: string | null;
  createdAt: string;
  lineItems: TransferLineItemDto[];
}

export interface CreateExpenseDto {
  storeId: string;
  category: ExpenseCategory;
  description?: string;
  amount: number;
  incurredAt?: string;
}

export interface ExpenseDto {
  id: string;
  storeId: string;
  category: ExpenseCategory;
  description: string | null;
  amount: string;
  incurredAt: string;
  createdAt: string;
}

export interface ReturnLineItemInputDto {
  productId: string;
  quantity: number;
}

export interface CreateReturnDto {
  storeId: string;
  saleId: string;
  reason?: string;
  lineItems: ReturnLineItemInputDto[];
  /** Default cash. */
  refundMethod?: PaymentMethod;
  /** This till's open shift: a cash refund comes out of its cash. */
  shiftClientId?: string;
}

export interface ReturnLineItemDto {
  id: string;
  productId: string;
  product: ProductDto;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface ReturnDto {
  id: string;
  saleId: string;
  storeId: string;
  reason: string | null;
  totalRefund: string;
  createdAt: string;
  lineItems: ReturnLineItemDto[];
}

export interface ReportSummaryDto {
  revenue: number;
  profit: number;
  orderCount: number;
  avgOrderValue: number;
  revenueDeltaPct: number | null;
  profitDeltaPct: number | null;
  orderCountDeltaPct: number | null;
  avgOrderValueDeltaPct: number | null;
}

export interface SalesTrendPointDto {
  date: string;
  revenue: number;
  orderCount: number;
}

export interface TopProductReportDto {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface LowStockReportItemDto {
  id: string;
  storeId: string;
  productId: string;
  product: ProductDto;
  quantity: number;
  reorderLevel: number;
}

export interface InsightHighlightDto {
  title: string;
  detail: string;
}

export interface RestockSuggestionDto {
  productName: string;
  reason: string;
}

export interface BusinessInsightsDto {
  summary: string;
  highlights: InsightHighlightDto[];
  restockSuggestions: RestockSuggestionDto[];
}

export interface StoreComparisonDto {
  storeId: string;
  storeName: string;
  revenue: number;
  profit: number;
  orderCount: number;
}

export interface SaleDto {
  id: string;
  storeId: string;
  cashierId: string;
  customerId: string | null;
  receiptNumber: string;
  /** Before any discount. total = subtotal - discountTotal + taxTotal. */
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  total: string;
  /** The whole-sale discount as given, and what it came to (absent on older sales). */
  discountType?: DiscountType | null;
  discountValue?: string | null;
  saleDiscountAmount?: string;
  paymentMethod: PaymentMethod;
  amountTendered: string | null;
  changeDue: string | null;
  status: SaleStatus;
  createdAt: string;
  createdOffline?: boolean;
  terminalId?: string | null;
  /** The till's idempotency key for this sale. */
  clientId?: string | null;
  /** Client-only: a receipt built on the till for a sale still waiting in the outbox. */
  queued?: boolean;
  lineItems: SaleLineItemDto[];
  payments: SalePaymentDto[];
  /** Who rang it up (sales from the server). */
  cashier?: PersonRefDto;
  /** Set once the sale is cancelled (status VOIDED). */
  voidedAt?: string | null;
  voidReason?: VoidReason | null;
  voidNote?: string | null;
  voidedBy?: PersonRefDto | null;
}

export interface PersonRefDto {
  id: string;
  firstName: string;
  lastName: string;
}

export type VoidReason = "WRONG_ITEMS" | "CUSTOMER_CHANGED_MIND" | "PAYMENT_PROBLEM" | "TRAINING" | "OTHER";

export const VOID_REASONS: VoidReason[] = ["WRONG_ITEMS", "CUSTOMER_CHANGED_MIND", "PAYMENT_PROBLEM", "TRAINING", "OTHER"];

/** Cancels a sale, named by id or (when it may not have synced yet) by its clientId. */
export interface VoidSaleDto {
  storeId: string;
  saleId?: string;
  saleClientId?: string;
  reason: VoidReason;
  note?: string;
  /** When the cashier cancelled it, for a cancel queued offline. */
  occurredAt?: string;
  /** Who was on the till (used when it uploads with the till's key). */
  actingUserId?: string;
  /** Cancelled offline with a manager's approval checked on the till. */
  offlineOverride?: OfflineOverrideDto;
  /** Till only: an online approval, sent as the X-Override-Token header (not in the body). */
  overrideToken?: string;
}

/** Seller details frozen when an invoice is issued. */
export interface SellerSnapshotDto {
  name: string;
  legalName: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  currency: string;
  logoUrl: string | null;
  invoiceFooter: string | null;
  store: { id: string; name: string; address: string | null; phone: string | null };
}

export interface InvoiceDto {
  id: string;
  businessId: string;
  saleId: string;
  year: number;
  sequence: number;
  /** e.g. INV-2026-0001 */
  number: string;
  issuedAt: string;
  seller: SellerSnapshotDto;
  buyerName: string;
  buyerAddress: string | null;
  buyerTaxId: string | null;
  buyerEmail: string | null;
  customerId: string | null;
  sale: SaleDto;
}

export interface IssueInvoiceDto {
  buyerName: string;
  buyerAddress?: string;
  buyerTaxId?: string;
  buyerEmail?: string;
  saveToCustomer?: boolean;
}

export interface InvoiceListItemDto {
  id: string;
  number: string;
  issuedAt: string;
  buyerName: string;
  buyerTaxId: string | null;
  sale: { total: string; receiptNumber: string };
}

export interface PagedDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TerminalDto {
  id: string;
  storeId: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface CreateTerminalDto {
  storeId: string;
  name: string;
}

export interface UpdateTerminalDto {
  name?: string;
  storeId?: string;
  isActive?: boolean;
}

export type DrawerSubReason = "CASH_PICKUP" | "FLOAT_ADJUSTMENT" | "MANAGER_INSPECTION" | "TEST" | "OTHER";

export interface CreateDrawerEventDto {
  storeId: string;
  clientId: string;
  terminalId?: string;
  reason: DrawerOpenReason;
  subReason?: DrawerSubReason;
  note?: string;
  saleClientId?: string;
  succeeded: boolean;
  error?: string;
  offline: boolean;
  occurredAt: string;
  /** Who was on the till (used when it uploads with the till's key). */
  actingUserId?: string;
}

export interface DrawerEventDto {
  id: string;
  storeId: string;
  terminalId: string | null;
  reason: DrawerOpenReason;
  subReason: DrawerSubReason | null;
  note: string | null;
  saleId: string | null;
  saleClientId: string | null;
  succeeded: boolean;
  error: string | null;
  permitted: boolean;
  createdOffline: boolean;
  occurredAt: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
  terminal: { name: string; code: string } | null;
  store: { name: string };
}

export type PermissionMap = Partial<Record<Permission, boolean>>;

export type CashMovementReason = "CASH_PICKUP" | "PETTY_CASH" | "CHANGE_TOPUP" | "OTHER";

export interface OpenShiftDto {
  storeId: string;
  /** The till's own id for the shift. */
  clientId: string;
  terminalId?: string;
  openingFloat: number;
  openedAt?: string;
  offline?: boolean;
  actingUserId?: string;
}

export interface CashMovementInputDto {
  storeId: string;
  shiftClientId: string;
  clientId: string;
  type: "IN" | "OUT";
  amount: number;
  reason: CashMovementReason;
  note?: string;
  occurredAt?: string;
  offline?: boolean;
  actingUserId?: string;
  /** A cash out by someone without CASH_OUT, approved offline on the till. */
  offlineOverride?: OfflineOverrideDto;
  /** Till only: an online approval, sent as the X-Override-Token header (not in the body). */
  overrideToken?: string;
}

export interface CloseShiftDto {
  storeId: string;
  shiftClientId: string;
  countedCash: number;
  /** The blind count by note/coin (value in the currency → how many). */
  countedDenominations?: Record<string, number>;
  tillExpectedCash?: number;
  note?: string;
  closedAt?: string;
  offline?: boolean;
  actingUserId?: string;
}

export interface ShiftSaleLineDto {
  receiptNumber: string;
  at: string;
  total: string;
  /** The payment method, or "SPLIT" when paid several ways. */
  method: PaymentMethod | "SPLIT";
  voided: boolean;
  cashier: string;
}

export interface ShiftSummaryDto {
  salesCount: number;
  salesTotal: string;
  byMethod: Partial<Record<PaymentMethod, string>>;
  discounts: string;
  voided: { count: number; total: string };
  returns: { count: number; total: string; cash: string };
  cashIn: string;
  cashOut: string;
  movements: { id: string; type: "IN" | "OUT"; amount: string; reason: CashMovementReason; note: string | null; occurredAt: string; user: string }[];
  byCashier: { id: string; name: string; count: number; total: string }[];
  /** Every sale in the shift, oldest first (for the report's optional full list). */
  sales?: ShiftSaleLineDto[];
  expectedCash: string;
}

export interface ShiftDto {
  id: string;
  storeId: string;
  terminalId: string | null;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  openingFloat: string;
  closedAt: string | null;
  countedCash: string | null;
  expectedCash: string | null;
  tillExpectedCash: string | null;
  difference: string | null;
  /** The blind count by note/coin, when given: { "5000": 3, … }. */
  countedDenominations?: Record<string, number> | null;
  /** Closed by a manager for someone else (abandoned shift). */
  forcedClose?: boolean;
  /** Difference over the business's threshold. */
  flagged?: boolean;
  note: string | null;
  clientId: string;
  createdOffline: boolean;
  openedBy: PersonRefDto;
  closedBy: PersonRefDto | null;
  terminal: { id: string; name: string; code: string } | null;
  store: { id: string; name: string };
  /** On single-shift answers (open, close, current, report). */
  summary?: ShiftSummaryDto;
}

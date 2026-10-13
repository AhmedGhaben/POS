export enum Plan {
  SIMPLE = "SIMPLE",
  PRO = "PRO",
}

export enum Role {
  OWNER = "OWNER",
  MANAGER = "MANAGER",
  CASHIER = "CASHIER",
}

export enum SaleStatus {
  COMPLETED = "COMPLETED",
  VOIDED = "VOIDED",
}

export enum PaymentMethod {
  CASH = "CASH",
  CARD = "CARD",
  MOBILE_MONEY = "MOBILE_MONEY",
  OTHER = "OTHER",
  CREDIT_CARD = "CREDIT_CARD",
  MULTICAIXA_REFERENCE = "MULTICAIXA_REFERENCE",
  BANK_TRANSFER = "BANK_TRANSFER",
  CHEQUE = "CHEQUE",
}

/** The order payment methods are offered in (most used first). */
export const PAYMENT_METHOD_ORDER: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.MOBILE_MONEY,
  PaymentMethod.MULTICAIXA_REFERENCE,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CREDIT_CARD,
  PaymentMethod.CHEQUE,
  PaymentMethod.OTHER,
];

export enum PurchaseStatus {
  PENDING = "PENDING",
  RECEIVED = "RECEIVED",
  CANCELLED = "CANCELLED",
}

export enum ExpenseCategory {
  RENT = "RENT",
  UTILITIES = "UTILITIES",
  SUPPLIES = "SUPPLIES",
  PAYROLL = "PAYROLL",
  MARKETING = "MARKETING",
  MAINTENANCE = "MAINTENANCE",
  OTHER = "OTHER",
}

export enum Permission {
  VIEW_COST_PRICE = "VIEW_COST_PRICE",
  PROCESS_RETURN = "PROCESS_RETURN",
  OPEN_DRAWER = "OPEN_DRAWER",
  VOID_SALE = "VOID_SALE",
  APPLY_DISCOUNT = "APPLY_DISCOUNT",
  DISCOUNT_ABOVE_LIMIT = "DISCOUNT_ABOVE_LIMIT",
  CHANGE_PRICE = "CHANGE_PRICE",
  SELL_ON_CREDIT = "SELL_ON_CREDIT",
  CASH_OUT = "CASH_OUT",
}

export enum DrawerOpenReason {
  SALE_CASH_PAYMENT = "SALE_CASH_PAYMENT",
  MANUAL_OPEN = "MANUAL_OPEN",
  SALE_VOIDED = "SALE_VOIDED",
  SHIFT_OPEN = "SHIFT_OPEN",
  SHIFT_CLOSE = "SHIFT_CLOSE",
}

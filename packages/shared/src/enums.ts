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
}

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
}

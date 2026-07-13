import type { Plan, Role, SaleStatus, PaymentMethod } from "./enums";

export interface BusinessDto {
  id: string;
  name: string;
  plan: Plan;
}

export interface StoreDto {
  id: string;
  businessId: string;
  name: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
}

export interface UserDto {
  id: string;
  businessId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  accessibleStoreIds: string[];
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  accessToken: string;
  user: UserDto;
  stores: StoreDto[];
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
}

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

export interface CustomerDto {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface SaleLineItemInputDto {
  productId: string;
  quantity: number;
}

export interface CreateSaleDto {
  storeId: string;
  customerId?: string | null;
  paymentMethod: PaymentMethod;
  lineItems: SaleLineItemInputDto[];
}

export interface SaleLineItemDto {
  id: string;
  productId: string;
  product: ProductDto;
  quantity: number;
  unitPrice: string;
  taxAmount: string;
  discountAmount: string;
  lineTotal: string;
}

export interface SaleDto {
  id: string;
  storeId: string;
  cashierId: string;
  customerId: string | null;
  receiptNumber: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  total: string;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  createdAt: string;
  lineItems: SaleLineItemDto[];
}

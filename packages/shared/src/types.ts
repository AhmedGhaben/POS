import type { Plan, Role, SaleStatus, PaymentMethod, PurchaseStatus, ExpenseCategory } from "./enums";

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

export interface SupplierDto {
  id: string;
  businessId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface CreateSupplierDto {
  name: string;
  contactName?: string;
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
  user: { id: string; email: string; role: Role } | null;
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

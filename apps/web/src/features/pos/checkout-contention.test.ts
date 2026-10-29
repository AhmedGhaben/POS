import { beforeEach, expect, it, vi } from "vitest";
import type { CreateSaleDto, ProductDto, StoreDto, UserDto } from "@pos/shared";
import { PaymentMethod } from "@pos/shared";
import { apiClient, ApiError } from "@/lib/api-client";
import { addToOutbox } from "@/lib/offline-db";
import { useAuthStore } from "@/features/auth/store";
import { useOfflineStore } from "./offline-store";
import { useDeviceStore } from "@/features/desktop/bridge";
import { createSale } from "./api";
vi.mock("@/lib/api-client", async (original) => {
  const actual = await original<typeof import("@/lib/api-client")>();
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } };
});
vi.mock("@/lib/offline-db", async (original) => ({ ...await original<typeof import("@/lib/offline-db")>(), addToOutbox: vi.fn() }));
const dto: CreateSaleDto = { storeId: "s", clientId: "00000000-0000-4000-8000-000000000001", lineItems: [{ productId: "p", quantity: 1 }], payments: [{ method: PaymentMethod.CASH, amount: 5 }] };
const lines = [{ product: { id: "p", name: "Product", sellPrice: "5", costPrice: "2", taxRate: "0", unit: "un" } as ProductDto, quantity: 1 }];
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ user: { id: "u", role: "OWNER" } as UserDto, currentStoreId: "s", stores: [{ id: "s", country: "US", pricesIncludeTax: false } as StoreDto] });
  useDeviceStore.setState({ terminal: null, signing: null });
  useOfflineStore.setState({ internet: true, server: "up", connectionEpoch: 0 });
});
it.each([409, 500])("stock-busy %i remains a cashier error and never queues offline", async (status) => {
  const error = new ApiError(status, "Stock is busy. Please try again.", { code: "STOCK_BUSY" });
  vi.mocked(apiClient.post).mockRejectedValue(error);
  await expect(createSale(dto, lines)).rejects.toBe(error);
  expect(addToOutbox).not.toHaveBeenCalled(); expect(apiClient.post).toHaveBeenCalledTimes(1);
});
it("preserves the busy message for credit checkout too", async () => {
  const error = new ApiError(409, "Stock is busy. Please try again.", { code: "STOCK_BUSY" });
  vi.mocked(apiClient.post).mockRejectedValue(error);
  await expect(createSale({ ...dto, creditAmount: 1 }, lines)).rejects.toBe(error);
  expect(addToOutbox).not.toHaveBeenCalled();
});
it("the same provided idempotency key survives a refused request and a successful retry", async () => {
  vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError(409, "busy", { code: "STOCK_BUSY" })).mockResolvedValueOnce({ id: "sale" });
  await expect(createSale(dto, lines)).rejects.toBeInstanceOf(ApiError);
  expect(await createSale(dto, lines)).toEqual({ id: "sale" });
  expect(vi.mocked(apiClient.post).mock.calls.map((c) => (c[1] as CreateSaleDto).clientId)).toEqual([dto.clientId, dto.clientId]);
  expect(addToOutbox).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from "vitest";
import type { CreateSaleDto, ProductDto, StoreDto, UserDto } from "@pos/shared";
import { PaymentMethod } from "@pos/shared";
import { apiClient, ApiError } from "@/lib/api-client";
import { addToOutbox } from "@/lib/offline-db";
import { useAuthStore } from "@/features/auth/store";
import { useOfflineStore } from "./offline-store";
import { useDeviceStore } from "@/features/desktop/bridge";
import { createSale } from "./api";
import { requestApproval } from "@/features/overrides/approval";
import { Permission } from "@pos/shared";
vi.mock("@/features/overrides/approval", async (original) => ({ ...await original<typeof import("@/features/overrides/approval")>(), requestApproval: vi.fn() }));
vi.mock("@/lib/api-client", async (original) => {
  const actual = await original<typeof import("@/lib/api-client")>();
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } };
});
vi.mock("@/lib/offline-db", async (original) => ({ ...await original<typeof import("@/lib/offline-db")>(), addToOutbox: vi.fn() }));
const dto: CreateSaleDto = { storeId: "s", clientId: "00000000-0000-4000-8000-000000000001", lineItems: [{ productId: "p", quantity: 1 }], payments: [{ method: PaymentMethod.CASH, amount: 5 }] };
const lines = [{ product: { id: "p", name: "Product", sellPrice: "5", costPrice: "2", taxRate: "0", unit: "un" } as ProductDto, quantity: 1 }];
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useAuthStore.setState({ user: { id: "u", role: "OWNER" } as UserDto, currentStoreId: "s", stores: [{ id: "s", country: "US", pricesIncludeTax: false } as StoreDto] });
  useDeviceStore.setState({ terminal: null, signing: null });
  useOfflineStore.setState({ internet: true, server: "up", connectionEpoch: 0 });
});
it("zero-price sales request a justified online manager approval even for owners", async () => {
  vi.mocked(requestApproval).mockResolvedValue({ kind: "token", permission: Permission.CHANGE_PRICE, token: "grant", approverId: "manager", approverName: "Manager" });
  vi.mocked(apiClient.post).mockResolvedValue({ id: "free-sale" });
  const freeLines = [{ ...lines[0], unitPrice: 0 }];
  expect(await createSale({ ...dto, payments: [] }, freeLines)).toEqual({ id: "free-sale" });
  expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({ action: "sale.zero-price", requireJustification: true, details: expect.objectContaining({ clientId: dto.clientId }) }));
  expect(apiClient.post).toHaveBeenCalledWith("/sales", expect.objectContaining({ zeroPriceApproval: "grant", lineItems: [{ productId: "p", quantity: 1, unitPrice: 0 }] }), expect.anything());
  expect(addToOutbox).not.toHaveBeenCalled();
});
it.each(["os-offline", "server-down"])("blocks zero-price checkout while %s without asking for offline approval or queuing", async (loss) => {
  useOfflineStore.setState(loss === "os-offline" ? { internet: false } : { server: "down" });
  await expect(createSale({ ...dto, payments: [] }, [{ ...lines[0], unitPrice: 0 }])).rejects.toThrow(/online/i);
  expect(requestApproval).not.toHaveBeenCalled(); expect(apiClient.post).not.toHaveBeenCalled(); expect(addToOutbox).not.toHaveBeenCalled();
});
it("retains the exact uncertain online zero-price request for reconnect retry without duplicating approval or sale key", async () => {
  vi.mocked(requestApproval).mockResolvedValue({ kind: "token", permission: Permission.CHANGE_PRICE, token: "grant", approverId: "manager", approverName: "Manager" });
  vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("network lost")).mockResolvedValueOnce({ id: "saved-sale" });
  const freeLines = [{ ...lines[0], unitPrice: 0 }];
  await expect(createSale({ ...dto, payments: [] }, freeLines)).rejects.toThrow("network lost");
  expect(addToOutbox).not.toHaveBeenCalled();
  expect(await createSale({ ...dto, clientId: undefined, payments: [] }, freeLines)).toEqual({ id: "saved-sale" });
  expect(requestApproval).toHaveBeenCalledTimes(1);
  const calls = vi.mocked(apiClient.post).mock.calls; expect(calls[1][1]).toEqual(calls[0][1]);
});
it("does not post a changed cart while a zero-price request outcome is uncertain", async () => {
  vi.mocked(requestApproval).mockResolvedValue({ kind: "token", permission: Permission.CHANGE_PRICE, token: "grant", approverId: "manager", approverName: "Manager" });
  vi.mocked(apiClient.post).mockRejectedValue(new Error("network lost"));
  await expect(createSale({ ...dto, payments: [] }, [{ ...lines[0], unitPrice: 0 }])).rejects.toThrow();
  await expect(createSale(dto, lines)).rejects.toThrow(/previous zero-price checkout/i);
  expect(apiClient.post).toHaveBeenCalledTimes(1); expect(addToOutbox).not.toHaveBeenCalled();
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

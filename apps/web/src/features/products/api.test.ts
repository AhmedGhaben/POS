import { beforeEach, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { fetchProductStock } from "./api";
vi.mock("@/lib/api-client", () => ({ apiClient: { get: vi.fn() }, ApiError: class extends Error {} }));
beforeEach(() => vi.resetAllMocks());
it("accepts confirmed zero and per-store quantities with a bounded timeout", async () => {
  vi.mocked(apiClient.get).mockResolvedValue([]);
  expect(await fetchProductStock("p")).toEqual([]);
  expect(apiClient.get).toHaveBeenCalledWith("/products/p/stock", { timeoutMs: 10_000 });
  const stock = [{ storeId: "s", storeName: "Shop", quantity: "12.5" }];
  vi.mocked(apiClient.get).mockResolvedValue(stock);
  expect(await fetchProductStock("p")).toEqual(stock);
});
it.each([undefined, null, {}, [null], [{ storeId: "s", storeName: "Shop", quantity: "invalid" }]])("rejects missing or malformed stock: %j", async (value) => {
  vi.mocked(apiClient.get).mockResolvedValue(value);
  await expect(fetchProductStock("p")).rejects.toThrow("Invalid stock response");
});
it.each([new Error("500"), new DOMException("Timed out", "TimeoutError")])("preserves lookup failures", async (error) => {
  vi.mocked(apiClient.get).mockRejectedValue(error);
  await expect(fetchProductStock("p")).rejects.toBe(error);
});

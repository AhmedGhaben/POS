import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { loadCatalog, saveCatalog } from "@/lib/offline-db";
import { useOfflineStore } from "./offline-store";
import { fetchStockLevels } from "./stock-levels";

vi.mock("@/lib/offline-db", () => ({ loadCatalog: vi.fn(), saveCatalog: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: vi.fn() }, isUnreachableError: (error: unknown) => error instanceof TypeError }));

describe("stock snapshots", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useOfflineStore.setState({ internet: true, server: "up", connectionEpoch: 0 });
    vi.mocked(loadCatalog).mockResolvedValue({ data: [{ productId: "p", quantity: "0" }], savedAt: "2026-10-29T00:00:00Z" });
  });
  it("tags server stock with the connection on which the request began", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ productId: "p", quantity: "2" }]);
    const snapshot = await fetchStockLevels("s");
    expect(snapshot).toMatchObject({ current: true, connectionEpoch: 0 });
    expect(snapshot?.byProduct.get("p")).toBe(2);
    expect(saveCatalog).toHaveBeenCalled();
  });
  it("reads warning-only stock offline without contacting the server", async () => {
    useOfflineStore.getState().setInternet(false);
    expect((await fetchStockLevels("s"))?.current).toBe(false);
    expect(apiClient.get).not.toHaveBeenCalled();
  });
  it("a request that crosses an outage retains its old connection tag", async () => {
    vi.mocked(apiClient.get).mockImplementation(async () => {
      useOfflineStore.getState().setServer("down"); useOfflineStore.getState().setServer("up");
      return [{ productId: "p", quantity: "0" }];
    });
    expect((await fetchStockLevels("s"))?.connectionEpoch).toBe(0);
    expect(useOfflineStore.getState().connectionEpoch).toBe(1);
  });
  it("network failure returns warning-only saved stock; application errors still surface", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new TypeError("Server unreachable"));
    expect((await fetchStockLevels("s"))?.current).toBe(false);
    vi.mocked(apiClient.get).mockRejectedValue(new Error("Permission denied"));
    await expect(fetchStockLevels("s")).rejects.toThrow("Permission denied");
  });
});

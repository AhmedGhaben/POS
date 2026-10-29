import { beforeEach, describe, expect, it } from "vitest";
import { isWorkingOffline, useOfflineStore } from "./offline-store";
import { checkStock, stockForConnection, type StockLevels } from "./stock-check";

describe("stock authority across connectivity changes", () => {
  const product = { id: "zero", trackStock: true };
  const at = 1000;
  let cached: StockLevels;
  const effective = () => {
    const state = useOfflineStore.getState();
    return stockForConnection(cached, at, !isWorkingOffline(state), state.connectionEpoch, at + 1);
  };
  beforeEach(() => {
    useOfflineStore.setState({ internet: true, server: "up", connectionEpoch: 0 });
    cached = { byProduct: new Map([[product.id, 0]]), current: true, connectionEpoch: 0 };
  });
  it("fresh zero stock blocks online but only warns immediately after the OS goes offline", () => {
    expect(checkStock(product, 1, effective(), false).status).toBe("block");
    useOfflineStore.getState().setInternet(false);
    expect(checkStock(product, 1, effective(), false).status).toBe("warn");
    expect(checkStock(product, 3, effective(), false).status).toBe("warn");
  });
  it("server-unreachable means warning-only even with OS internet connectivity", () => {
    useOfflineStore.getState().setServer("down");
    expect(useOfflineStore.getState().internet).toBe(true);
    expect(checkStock(product, 3, effective(), false).status).toBe("warn");
    const epoch = useOfflineStore.getState().connectionEpoch;
    useOfflineStore.getState().setServer("down");
    expect(useOfflineStore.getState().connectionEpoch).toBe(epoch);
  });
  it.each(["internet", "server"])("reconnecting %s waits for a new server snapshot before blocking", (loss) => {
    const store = useOfflineStore.getState();
    if (loss === "internet") { store.setInternet(false); store.setInternet(true); }
    else { store.setServer("down"); store.setServer("up"); }
    expect(checkStock(product, 1, effective(), false).status).toBe("warn");
    cached = { ...cached, connectionEpoch: useOfflineStore.getState().connectionEpoch };
    expect(checkStock(product, 1, effective(), false).status).toBe("block");
    expect(checkStock(product, 1, effective(), true).status).toBe("warn");
  });
  it("a request started before an outage cannot regain authority by completing afterwards", () => {
    useOfflineStore.getState().setServer("down"); useOfflineStore.getState().setServer("up");
    expect(effective()?.current).toBe(false);
    cached = { ...cached, connectionEpoch: useOfflineStore.getState().connectionEpoch };
    expect(effective()?.current).toBe(true);
    expect(stockForConnection(cached, at, true, cached.connectionEpoch!, at + 5 * 60_000)?.current).toBe(false);
    expect(stockForConnection({ ...cached, current: false }, at, true, cached.connectionEpoch!, at + 1)?.current).toBe(false);
  });
});

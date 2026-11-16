import { beforeAll, describe, expect, it } from "vitest";
import type { StoreStatusDto } from "@pos/shared";
import i18n from "@/i18n";
import { diamondFor, offlineStores, storeLine } from "./status-view";

const NOW = new Date("2026-11-17T13:10:00Z"); // 14:10 in Luanda
const store = (s: Partial<StoreStatusDto>): StoreStatusDto => ({
  storeId: "s1",
  name: "Loja 2",
  timezone: "Africa/Luanda",
  country: "AO",
  status: "online",
  lastSeenAt: null,
  lastSyncSuccessAt: null,
  devices: [],
  ...s,
});
const t = () => i18n.getFixedT(null, "reports");
const plain = (s: string) => s.replace(/\s/g, " ");

describe("Lojas agora lines (pt-AO)", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("pt-AO");
  });

  it("online: last sync on the store's clock", () => {
    expect(plain(storeLine(t(), store({ status: "online", lastSyncSuccessAt: "2026-11-17T13:09:00Z" }), NOW))).toBe("Online · sincronizada às 14:09");
  });

  it("syncing", () => {
    expect(storeLine(t(), store({ status: "syncing", lastSyncSuccessAt: "2026-11-17T13:05:00Z" }), NOW)).toBe(
      "A sincronizar vendas guardadas · última às 14:05",
    );
  });

  it("offline: only when it was last heard from, no live counts", () => {
    const line = storeLine(t(), store({ status: "offline", lastSeenAt: "2026-11-17T12:52:00Z" }), NOW);
    expect(line).toBe("Sem ligação desde 13:52 · as vendas feitas entretanto chegam quando a ligação voltar");
    expect(line).not.toMatch(/\d+ vendas/);
  });

  it("inactive, never, browser, no till", () => {
    expect(storeLine(t(), store({ status: "inactive", lastSeenAt: "2026-11-16T20:04:00Z" }), NOW)).toBe("Desligada · último contacto ontem às 21:04");
    expect(storeLine(t(), store({ status: "inactive", lastSeenAt: "2026-11-16T08:30:00Z" }), new Date("2026-11-18T10:00:00Z"))).toBe(
      "Desligada · último contacto 16/11 às 09:30",
    );
    expect(storeLine(t(), store({ status: "never" }), NOW)).toBe("Ainda sem contacto");
    expect(storeLine(t(), store({ status: "browser" }), NOW)).toBe("A vender no navegador · estado da ligação só na caixa Windows");
    expect(storeLine(t(), store({ status: "noTill" }), NOW)).toBe("Sem caixa Windows configurada");
  });

  it("only offline is amber; browser and no-till are muted and never offline", () => {
    expect(diamondFor("offline")).toBe("offline");
    expect(diamondFor("syncing")).toBe("syncing");
    expect(diamondFor("online")).toBe("online");
    for (const s of ["inactive", "never", "browser", "noTill"] as const) expect(diamondFor(s)).toBe("inactive");
    const list = [store({ status: "offline" }), store({ status: "browser" }), store({ status: "noTill" }), store({ status: "inactive" })];
    expect(offlineStores(list)).toHaveLength(1);
  });
});

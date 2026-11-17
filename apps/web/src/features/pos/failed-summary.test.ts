import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import type { OutboxKind } from "@/lib/offline-db";
import { failedLabel, failedSummary } from "./failed-summary";

describe("failedSummary", () => {
  it("names the operation when every refused entry is the same kind", () => {
    expect(failedSummary(["shift-close"])).toEqual({ key: "shiftClose", count: 1 });
    expect(failedSummary(["sale", "sale"])).toEqual({ key: "sale", count: 2 });
    expect(failedSummary(["cash-movement"])).toEqual({ key: "cashMovement", count: 1 });
  });
  it("different kinds: operations", () => {
    expect(failedSummary(["sale", "shift-close"])).toEqual({ key: "mixed", count: 2 });
  });
  it("nothing refused: nothing to say", () => {
    expect(failedSummary([])).toBeNull();
  });
});

const label = (kinds: OutboxKind[] | undefined, count = kinds?.length ?? 0) => failedLabel(i18n.getFixedT(null, "pos"), kinds, count);

describe("the red sync-error indicator names what failed", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("pt-AO");
  });

  it("a refused shift close is not called a sale", () => {
    expect(label(["shift-close"])).toBe("1 fecho de turno não sincronizou");
    expect(label(["shift-close"])).not.toMatch(/venda/i);
  });

  it("sales are still sales; mixed kinds are operations", () => {
    expect(label(["sale", "sale"])).toBe("2 vendas não sincronizaram");
    expect(label(["sale", "shift-close"])).toBe("2 operações não sincronizaram");
    expect(label(["cash-movement"])).toBe("1 movimento de caixa não sincronizou");
  });

  it("before the kinds are read: neutral wording, never 'sale'", () => {
    expect(label(undefined, 1)).toBe("1 operação não sincronizou");
  });

  it("English", async () => {
    await i18n.changeLanguage("en");
    expect(label(["shift-close"])).toBe("1 shift close failed to sync");
    expect(label(["drawer-event", "drawer-event"])).toBe("2 cash drawer openings failed to sync");
    await i18n.changeLanguage("pt-AO");
  });
});

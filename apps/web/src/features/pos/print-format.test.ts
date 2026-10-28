import { beforeEach, describe, expect, it } from "vitest";
import { salePrintFormat, usePrintFormatStore } from "./print-format";

/** Tester #35: once on A4, the till could not go back to the receipt. */
describe("sale print format", () => {
  beforeEach(() => usePrintFormatStore.setState({ byStore: {} }));

  it("follows the store's setting until this till chooses", () => {
    expect(salePrintFormat(undefined, "A4")).toBe("a4");
    expect(salePrintFormat(undefined, "RECEIPT")).toBe("receipt");
    expect(salePrintFormat(undefined, undefined)).toBe("receipt");
  });

  it("this till's choice wins, both ways, and is kept per store", () => {
    const { setFormat } = usePrintFormatStore.getState();
    setFormat("s1", "a4");
    expect(salePrintFormat(usePrintFormatStore.getState().byStore.s1, "RECEIPT")).toBe("a4");
    setFormat("s1", "receipt");
    expect(salePrintFormat(usePrintFormatStore.getState().byStore.s1, "A4")).toBe("receipt");
    expect(usePrintFormatStore.getState().byStore.s2).toBeUndefined();
  });

  it("is saved on this device", () => {
    usePrintFormatStore.getState().setFormat("s1", "a4");
    expect(JSON.parse(localStorage.getItem("pos-print-format")!).state.byStore).toEqual({ s1: "a4" });
  });
});

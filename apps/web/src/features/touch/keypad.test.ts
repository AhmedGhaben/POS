import { describe, expect, it } from "vitest";
import { pressKey, type KeypadKey } from "./keypad";

const type = (keys: KeypadKey[], opts?: Parameters<typeof pressKey>[2], start = "") => keys.reduce((v, k) => pressKey(v, k, opts), start);

describe("the on-screen keypad (tester #24)", () => {
  it("types an amount with a decimal comma, two decimals at most", () => {
    expect(type(["1", "2", ",", "5", "0", "9"])).toBe("12,50");
    expect(type([",", "5"])).toBe("0,5");
    expect(type(["9", ",", ",", "1"])).toBe("9,1");
  });

  it("00 makes hundreds and thousands quickly; no leading zeros", () => {
    expect(type(["5", "00", "00"])).toBe("50000");
    expect(type(["00"])).toBe("0");
    expect(type(["0", "7"])).toBe("7");
    expect(type(["1", ",", "00", "00"])).toBe("1,00");
  });

  it("whole numbers only (decimals 0) ignore the comma; weights take 3 decimals", () => {
    expect(type(["3", ",", "2"], { decimals: 0 })).toBe("32");
    expect(type(["0", ",", "7", "6", "5", "4"], { decimals: 3 })).toBe("0,765");
  });

  it("backspace and clear; a PIN stops at its length", () => {
    expect(type(["1", "2", "back"])).toBe("1");
    expect(type(["back"])).toBe("");
    expect(type(["clear"], {}, "123,45")).toBe("");
    expect(type(["1", "2", "3", "4", "5", "6", "7"], { decimals: 0, maxLength: 6 })).toBe("123456");
  });

  it("carries on from what was typed on a keyboard, point or comma", () => {
    expect(pressKey("12.3", "4")).toBe("12.34");
    expect(pressKey("12.34", "5")).toBe("12.34");
  });
});

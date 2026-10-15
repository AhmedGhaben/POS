import { describe, expect, it } from "vitest";
import { formatCalendarDate, formatCurrency, formatMoney } from "./format";

/** Intl uses no-break spaces for grouping and before the label; compare with plain ones. */
const NO_BREAK_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, "g");
const plain = (s: string) => s.replace(NO_BREAK_SPACES, " ");

describe("money formats", () => {
  it("kwanzas are AOA in data but print as Kz in the Portuguese format, whatever the screen language", () => {
    expect(plain(formatMoney(245000, "AOA", "en"))).toBe("245 000,00 Kz");
    expect(plain(formatMoney("1250.5", "AOA", "pt-PT"))).toBe("1 250,50 Kz");
  });

  it("other currencies keep the screen language's format", () => {
    expect(formatMoney(12.5, "USD", "en")).toBe("$12.50");
  });

  it("big amounts in kwanzas compact with the label too", () => {
    expect(plain(formatCurrency(1_250_000, "AOA", "en"))).toMatch(/Kz$/);
  });
});

describe("calendar dates", () => {
  it("print as the day given, month end and year end included", () => {
    expect(formatCalendarDate("2026-10-31", { dateStyle: "long" }, "en")).toBe("October 31, 2026");
    expect(formatCalendarDate("2026-12-31", { dateStyle: "short" }, "pt-PT")).toBe("31/12/26");
    expect(formatCalendarDate("2026-10-01", { month: "long", year: "numeric" }, "pt-PT")).toBe("outubro de 2026");
  });
});

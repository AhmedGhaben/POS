import { describe, expect, it } from "vitest";
import { cellText, csvCell, isNumeric, type CellFormatters } from "./report-cells";

const f: CellFormatters = {
  money: (v) => `${Number(v).toFixed(2).replace(".", ",")} Kz`,
  quantity: (v) => String(v).replace(".", ","),
  number: (v) => String(v).replace(".", ","),
  date: (v) => v.split("-").reverse().join("/"),
  month: (v) => `month ${v}`,
  code: (kind, v) => `${kind}:${v}`,
  none: "—",
};

describe("report cells", () => {
  it("formats by kind, with the locale's decimal comma for percentages", () => {
    expect(cellText("money", "1234.50", f)).toBe("1234,50 Kz");
    expect(cellText("quantity", "2.5", f)).toBe("2,5");
    expect(cellText("percent", 33.3, f)).toBe("33,3 %");
    expect(cellText("date", "2026-10-31", f)).toBe("31/10/2026");
    expect(cellText("month", "2026-10", f)).toBe("month 2026-10");
    expect(cellText("method", "CASH", f)).toBe("method:CASH");
    expect(cellText("count", 4, f)).toBe("4");
  });

  it("empty cells: a dash for text, nothing for amounts", () => {
    expect(cellText("text", null, f)).toBe("—");
    expect(cellText("money", null, f)).toBe("");
    expect(cellText("percent", null, f)).toBe("");
  });

  it("CSV keeps plain numbers, writes dates as people do (DD/MM/YYYY in Angola), translates codes", () => {
    expect(csvCell("money", "1234.50", f)).toBe("1234.50");
    expect(csvCell("date", "2026-10-31", f)).toBe("31/10/2026");
    expect(csvCell("docType", "NC", f)).toBe("docType:NC");
    expect(csvCell("text", null, f)).toBe("");
    expect(isNumeric("money") && !isNumeric("text")).toBe(true);
  });
});

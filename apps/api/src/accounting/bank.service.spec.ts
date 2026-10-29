import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { buildXlsx } from "../common/xlsx";
import { BankService } from "./bank.service";
import { EntriesService } from "./entries.service";

describe("bank upload decoding", () => {
  const service = new BankService({} as PrismaService, {} as EntriesService);
  const unreadable = "The file can't be read: save the statement as CSV or Excel (.xlsx)";
  afterEach(() => jest.restoreAllMocks());

  it.each(["%E0%A4%A", "%", "%2", "%GG", "%C3%28"])("rejects malformed encoding %s as a controlled validation error", (encoded) => {
    expect(() => service.parse({ fileName: "statement.csv", dataUrl: `data:text/csv,${encoded}` })).toThrow(new BadRequestException(unreadable));
  });

  it.each(["base64", "percent"])("preserves valid %s CSV text, including Unicode and literal percent signs", (encoding) => {
    const csv = "Date;Description;Amount\n2026-10-17;Dep\u00f3sito 100%;10,50";
    const dataUrl = encoding === "base64" ? `data:text/csv;base64,${Buffer.from(csv).toString("base64")}` : `data:text/csv,${encodeURIComponent(csv)}`;
    expect(service.parse({ fileName: "statement.csv", dataUrl }).rows).toEqual([["Date", "Description", "Amount"], ["2026-10-17", "Dep\u00f3sito 100%", "10,50"]]);
  });

  it("preserves valid XLSX decoding", () => {
    const bytes = buildXlsx([{ name: "Bank", header: ["Date", "Description", "Amount"], rows: [["2026-10-17", "Fee", -25]] }]);
    expect(service.parse({ fileName: "statement.xlsx", dataUrl: `data:application/octet-stream;base64,${bytes.toString("base64")}` }).rows).toEqual([["Date", "Description", "Amount"], ["2026-10-17", "Fee", "-25"]]);
  });

  it("preserves existing envelope, file-size and workbook validation", () => {
    expect(() => service.parse({ fileName: "x.csv", dataUrl: "not a data URL" })).toThrow(new BadRequestException("Send the statement as a CSV or Excel file"));
    expect(() => service.parse({ fileName: "x.csv", dataUrl: `data:text/csv;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}` })).toThrow(new BadRequestException("Files are 5 MB at most"));
    expect(() => service.parse({ fileName: "x.xlsx", dataUrl: "data:application/octet-stream;base64,UEs=" })).toThrow(new BadRequestException(unreadable));
  });

  it("does not turn unrelated decoder failures into validation errors", () => {
    const unexpected = new Error("synthetic internal decoder failure");
    jest.spyOn(globalThis, "decodeURIComponent").mockImplementation(() => { throw unexpected; });
    expect(() => service.parse({ fileName: "x.csv", dataUrl: "data:text/csv,valid" })).toThrow(unexpected);
  });
});

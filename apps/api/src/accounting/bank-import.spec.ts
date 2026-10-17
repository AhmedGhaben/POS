import { Prisma } from "@prisma/client";
import { buildXlsx } from "../common/xlsx";
import { bestMatch, mapStatement, parseAmount, parseStatementDate, readCsv, readXlsx } from "./bank-import";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

describe("bank statements", () => {
  it("reads CSV with ';' or ',' and quotes, skipping blank lines", () => {
    expect(readCsv('Data;Descrição;Valor\r\n17/10/2026;"TPA, vendas";1.234,56\r\n\r\n')).toEqual([
      ["Data", "Descrição", "Valor"],
      ["17/10/2026", "TPA, vendas", "1.234,56"],
    ]);
    expect(readCsv("date,desc,amount\n2026-10-17,fee,-25.00")).toEqual([
      ["date", "desc", "amount"],
      ["2026-10-17", "fee", "-25.00"],
    ]);
  });

  it("reads the first sheet of an Excel file (shared strings, numbers, dates as day numbers)", () => {
    const file = buildXlsx([{ name: "Extracto", header: ["Data", "Descrição", "Valor"], rows: [[{ date: "2026-10-17" }, "Depósito", 1500.5]] }]);
    expect(readXlsx(file)).toEqual([
      ["Data", "Descrição", "Valor"],
      ["46312", "Depósito", "1500.5"],
    ]);
  });

  it("amounts as banks write them; dates in the usual forms", () => {
    expect(parseAmount("1.234,56")).toEqual(D("1234.56"));
    expect(parseAmount("1 234.56")).toEqual(D("1234.56"));
    expect(parseAmount("-150,00")).toEqual(D("-150"));
    expect(parseAmount("(150,00)")).toEqual(D("-150"));
    expect(parseAmount("150,00-")).toEqual(D("-150"));
    expect(parseAmount("1.500.000")).toEqual(D("1500000"));
    expect(parseAmount("abc")).toBeNull();
    expect(parseStatementDate("17/10/2026")).toBe("2026-10-17");
    expect(parseStatementDate("17-10-26")).toBe("2026-10-17");
    expect(parseStatementDate("2026-10-17")).toBe("2026-10-17");
    expect(parseStatementDate("46312")).toBe("2026-10-17");
    expect(parseStatementDate("31/02/2026")).toBeNull();
  });

  it("maps columns: one amount column, or debit and credit; headings and balance rows are skipped", () => {
    const table = [
      ["Data", "Descrição", "Débito", "Crédito", "Ref"],
      ["Saldo inicial", "", "", "1000,00", ""],
      ["16/10/2026", "Comissão de manutenção", "2.500,00", "", "C1"],
      ["17/10/2026", "TPA Multicaixa", "", "114,00", "T9"],
    ];
    const { rows, skipped } = mapStatement(table, { date: 0, description: 1, debit: 2, credit: 3, reference: 4, skipRows: 1 });
    expect(rows).toEqual([
      { row: 3, date: "2026-10-16", description: "Comissão de manutenção", reference: "C1", amount: D("-2500") },
      { row: 4, date: "2026-10-17", description: "TPA Multicaixa", reference: "T9", amount: D("114") },
    ]);
    expect(skipped).toEqual([2]);
  });

  it("matches the same amount within three days, closest date first", () => {
    const candidates = [
      { id: "a", date: "2026-10-10", amount: D(114) },
      { id: "b", date: "2026-10-16", amount: D(114) },
      { id: "c", date: "2026-10-17", amount: D(115) },
    ];
    expect(bestMatch({ date: "2026-10-17", amount: D(114) }, candidates)?.id).toBe("b");
    expect(bestMatch({ date: "2026-10-30", amount: D(114) }, candidates)).toBeNull();
  });
});

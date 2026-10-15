import { buildXlsx, columnName, excelDate, unzip } from "./xlsx";

describe("xlsx writer", () => {
  it("names columns like Excel", () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });

  it("turns calendar dates into Excel day numbers, leap days and year ends included", () => {
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-10-31")).toBe(46326);
    expect(excelDate("2026-12-31")).toBe(46387);
    expect(excelDate("2027-01-01")).toBe(46388);
    expect(excelDate("2028-02-29")).toBe(46812);
  });

  it("writes a workbook with one part per sheet, header in bold, text escaped", () => {
    const files = unzip(
      buildXlsx([
        { name: "Vendas", header: ["Data", "Documento", "Total"], rows: [[{ date: "2026-10-31" }, "FR <A&B>", 12.5]] },
        { name: "Compras: Q4/2026", header: ["Data"], rows: [] },
      ]),
    );
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    const workbook = files.get("xl/workbook.xml")!.toString();
    expect(workbook).toContain('<sheet name="Vendas" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain('<sheet name="Compras  Q4 2026"'); // characters Excel forbids in sheet names
    const sheet = files.get("xl/worksheets/sheet1.xml")!.toString();
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Data</t></is></c>');
    expect(sheet).toContain('<c r="A2" s="3"><v>46326</v></c>');
    expect(sheet).toContain("FR &lt;A&amp;B&gt;");
    expect(sheet).toContain('<c r="C2" s="2"><v>12.5</v></c>');
  });
});

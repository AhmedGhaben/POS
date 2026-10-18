import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { completeArchive, pagesFor } from "./archive";

describe("the document archive", () => {
  it("keeps the server's files (SAF-T, attachments, index) and adds each document's PDF where the index says", () => {
    const server = zipSync({
      "indice.csv": strToU8("Ficheiro;Tipo\r\ndocumentos/FR/FR_POS-001_2026_1.pdf;FR\r\n"),
      "saft/SAFT-AO_2026-10.xml": strToU8("<AuditFile/>"),
      "anexos/compras/FT_1/abc123_factura.png": new Uint8Array([137, 80, 78, 71]),
    });
    const pdf = strToU8("%PDF-1.7 ...");
    const files = unzipSync(completeArchive(server, [{ path: "documentos/FR/FR_POS-001_2026_1.pdf", data: pdf }]));
    expect(Object.keys(files).sort()).toEqual([
      "anexos/compras/FT_1/abc123_factura.png",
      "documentos/FR/FR_POS-001_2026_1.pdf",
      "indice.csv",
      "saft/SAFT-AO_2026-10.xml",
    ]);
    expect(strFromU8(files["documentos/FR/FR_POS-001_2026_1.pdf"])).toBe("%PDF-1.7 ...");
    expect(strFromU8(files["saft/SAFT-AO_2026-10.xml"])).toBe("<AuditFile/>");
    expect([...files["anexos/compras/FT_1/abc123_factura.png"]]).toEqual([137, 80, 78, 71]);
  });

  it("a page as tall as A4 is one page, even a pixel over; a long invoice runs onto more", () => {
    expect(pagesFor(3508, 3508)).toBe(1);
    expect(pagesFor(3510, 3508)).toBe(1);
    expect(pagesFor(3508 + 400, 3508)).toBe(2);
    expect(pagesFor(3 * 3508, 3508)).toBe(3);
    expect(pagesFor(10, 3508)).toBe(1);
  });
});

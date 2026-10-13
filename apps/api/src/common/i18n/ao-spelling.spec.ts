import fs from "fs";
import path from "path";
import { aoSpelling } from "./ao-spelling";
import { translateMessage } from "./messages";
import { MAIL_TEXTS } from "../mail/mail-texts";

describe("Angolan spelling (pt-AO)", () => {
  it("is the same file as the web app's (the screens and the server spell alike)", () => {
    const read = (p: string) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    expect(read(path.join(__dirname, "ao-spelling.ts"))).toBe(read(path.resolve(__dirname, "../../../../web/src/i18n/ao-spelling.ts")));
  });

  it("turns pt-PT messages into pt-AO", () => {
    expect(aoSpelling("Foi emitida uma fatura")).toBe("Foi emitida uma factura");
    expect(translateMessage("An invoice was issued for this sale, so it can't be cancelled", "pt-AO")).toBe(
      "Foi emitida uma factura para esta venda, por isso não pode ser anulada",
    );
    expect(translateMessage("Wrong PIN", "pt-AO")).toBe(translateMessage("Wrong PIN", "pt-PT"));
  });

  it("has emails in pt-AO, functions included", () => {
    expect(MAIL_TEXTS["pt-AO"].verify.hi("Ana")).toBe(MAIL_TEXTS["pt-PT"].verify.hi("Ana"));
    expect(typeof MAIL_TEXTS["pt-AO"].reset.subject).toBe("string");
  });
});

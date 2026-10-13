import fs from "fs";
import path from "path";
import { activeExemptions, AO, countryConfig, findExemption, ratesForStore } from "./index";

const API_DIR = __dirname;
const SHARED_DIR = path.resolve(__dirname, "../../../../packages/shared/src/countries");

describe("country config", () => {
  it("is the same in the API as in packages/shared (the API can't import it at runtime)", () => {
    const files = fs.readdirSync(SHARED_DIR).filter((f) => f.endsWith(".ts"));
    expect(files.sort()).toEqual(fs.readdirSync(API_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts")).sort());
    for (const file of files) {
      const normalize = (p: string) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
      expect({ file, text: normalize(path.join(API_DIR, file)) }).toEqual({ file, text: normalize(path.join(SHARED_DIR, file)) });
    }
  });

  it("is found by the store's country code", () => {
    expect(countryConfig("AO")).toBe(AO);
    expect(countryConfig("ao")).toBe(AO);
    expect(countryConfig("XX")).toBeNull();
    expect(countryConfig(null)).toBeNull();
  });

  describe("Angola", () => {
    it("has unique exemption codes with legal text of 6 to 60 characters (SAF-T TaxExemptionReason)", () => {
      const codes = AO.exemptions.map((e) => e.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const e of AO.exemptions) {
        expect(e.legalText.length).toBeGreaterThanOrEqual(6);
        expect(e.legalText.length).toBeLessThanOrEqual(60);
        expect(e.label.length).toBeGreaterThan(0);
      }
    });

    it("has every IVA code from the AGT table, M94 included, retail ones first", () => {
      const iva = AO.exemptions.filter((e) => e.taxType === "IVA").map((e) => e.code);
      expect(iva).toHaveLength(39);
      for (const code of ["M00", "M02", "M04", "M10", "M24", "M30", "M38", "M80", "M86", "M90", "M94"]) expect(iva).toContain(code);
      expect(iva.slice(0, 15)).toEqual(["M10", "M11", "M12", "M13", "M14", "M15", "M16", "M17", "M18", "M19", "M20", "M21", "M22", "M23", "M24"]);
      expect(findExemption(AO, "M10")?.legalText).toBe("Isento nos termos da alínea a) do nº1 do artigo 12.º do CIVA");
      expect(findExemption(AO, "M04")?.legalText).toBe("IVA – Regime de Exclusão");
    });

    it("only offers confirmed codes within their dates", () => {
      const offered = activeExemptions(AO, "IVA").map((e) => e.code);
      expect(offered).toHaveLength(39);
      expect(activeExemptions(AO, "IS")).toHaveLength(0); // placeholders until the official texts are in
      const retired = { ...AO, exemptions: AO.exemptions.map((e) => (e.code === "M17" ? { ...e, validTo: "2020-01-01" } : e)) };
      expect(activeExemptions(retired, "IVA").map((e) => e.code)).not.toContain("M17");
    });

    it("has the regimes with their rules", () => {
      expect(AO.ivaRegimes.map((r) => [r.code, r.exemptionCode, r.turnoverRate])).toEqual([
        ["GERAL", null, null],
        ["SIMPLIFICADO", "M00", 7],
        ["EXCLUSAO", "M04", null],
      ]);
      expect(AO.taxRates.find((r) => r.isDefault)).toMatchObject({ percentage: 14, taxCode: "NOR" });
      expect(AO.taxRates.find((r) => r.key === "IVA-INT-7")?.verifyValidity).toBe(true);
    });

    it("offers the Cabinda rate only to stores in Cabinda", () => {
      expect(ratesForStore(AO, AO.taxRates, "LA").map((r) => r.percentage)).toEqual([14, 5, 7]);
      expect(ratesForStore(AO, AO.taxRates, "CA").map((r) => r.percentage)).toEqual([14, 5, 7, 1]);
    });

    it("accepts alphanumeric NIFs", () => {
      expect(AO.taxIdPattern.test("000415195LA035")).toBe(true);
      expect(AO.taxIdPattern.test("5417000000")).toBe(true);
      expect(AO.taxIdPattern.test("12-34")).toBe(false);
    });

    it("maps every payment method to a SAF-T payment mechanism", () => {
      expect(AO.paymentMechanisms).toMatchObject({ CASH: "NU", CARD: "CD", CREDIT_CARD: "CC", MULTICAIXA_REFERENCE: "MB", BANK_TRANSFER: "TB", CHEQUE: "CH", MOBILE_MONEY: "OU" });
    });

    it("builds the AGT QR link with spaces in the number as %20", () => {
      expect(AO.documentQrUrl("000415195LA035", "FR QN2024/11")).toBe(
        "https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=000415195LA035&document=FR%20QN2024/11",
      );
    });
  });
});

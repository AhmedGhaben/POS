import { accountName, categoryFor, classOf, compareCodes, isValidCode, nextChildCode, parentCode } from "./chart";
import { DEFAULT_BANK, LINKED_PARENTS, MAIN_CASH, PGC_TEMPLATE } from "./pgc-template";

describe("chart of accounts", () => {
  it("parents, classes and categories come from the dotted code", () => {
    expect(parentCode("31")).toBeNull();
    expect(parentCode("31.1.2.1")).toBe("31.1.2");
    expect(classOf("45.1.1")).toBe(4);
    expect(categoryFor("31", true)).toBe("GR");
    expect(categoryFor("31", false)).toBe("GR");
    expect(categoryFor("31.1", true)).toBe("GA");
    expect(categoryFor("31.1.2.1.0001", false)).toBe("GM");
  });

  it("codes: a class digit and a second digit, then dotted parts; up to 30 characters (SAF-T AccountID)", () => {
    expect(isValidCode("31")).toBe(true);
    expect(isValidCode("31.1.2.1.0001")).toBe(true);
    expect(isValidCode("3")).toBe(false); // a class isn't an account
    expect(isValidCode("91")).toBe(false);
    expect(isValidCode("31..1")).toBe(false);
    expect(isValidCode("31 1")).toBe(false);
    expect(isValidCode(`31.${"1".repeat(10)}.${"2".repeat(10)}.1234567`)).toBe(false);
  });

  it("sorts codes as an accountant reads them", () => {
    expect(["11.10", "12", "11.2", "11", "11.1"].sort(compareCodes)).toEqual(["11", "11.1", "11.2", "11.10", "12"]);
  });

  it("the next sub-account: one more than the highest in use, padded", () => {
    expect(nextChildCode("31.1.2.1", [], { width: 4 })).toBe("31.1.2.1.0001");
    expect(nextChildCode("31.1.2.1", ["31.1.2.1.0001", "31.1.2.1.0007", "31.1.2.2.0009"], { width: 4 })).toBe("31.1.2.1.0008");
    expect(nextChildCode("45.1", ["45.1.1"], { first: 2 })).toBe("45.1.2");
    expect(nextChildCode("45.1", [], { first: 2 })).toBe("45.1.2");
  });

  it("names fit the SAF-T AccountDescription (100 characters)", () => {
    expect(accountName("  Kianda   Comércio  ")).toBe("Kianda Comércio");
    expect(Array.from(accountName("á".repeat(150)))).toHaveLength(100);
  });

  describe("the PGC template", () => {
    const codes = PGC_TEMPLATE.map(([c]) => c);

    it("has no duplicate code, every code is valid and every parent comes before its children", () => {
      expect(new Set(codes).size).toBe(codes.length);
      const seen = new Set<string>();
      for (const code of codes) {
        expect(isValidCode(code)).toBe(true);
        const parent = parentCode(code);
        if (parent) expect(seen.has(parent)).toBe(true);
        seen.add(code);
      }
    });

    it("covers classes 1 to 8 with first-degree accounts only (classes aren't exported)", () => {
      const firstDegree = codes.filter((c) => !c.includes("."));
      expect(new Set(firstDegree.map(classOf))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
      expect(firstDegree.every((c) => c.length === 2)).toBe(true);
    });

    it("has the accounts the integration and the app's own sub-accounts need", () => {
      for (const code of [...Object.values(LINKED_PARENTS), MAIN_CASH, DEFAULT_BANK, "26.1", "71.2", "61.8.1", "61.7.1", "34.5.3.1", "34.5.2.1", "34.5.6.2", "75.3.1", "68.8.1", "78.8.1", "81.1", "88.1"]) {
        expect(codes).toContain(code);
      }
    });

    it("every first-degree account the year-end uses has a movement account under it (82-88)", () => {
      for (const c of ["82", "83", "84", "85", "86", "87", "88"]) expect(codes).toContain(`${c}.1`);
    });

    it("names fit the SAF-T AccountDescription", () => {
      for (const [, name] of PGC_TEMPLATE) expect(Array.from(name).length).toBeLessThanOrEqual(100);
    });
  });
});

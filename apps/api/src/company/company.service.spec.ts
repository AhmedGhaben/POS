import { normalizeIban } from "./company.service";

describe("IBAN check", () => {
  it("accepts a valid Angolan IBAN, with or without spaces, and stores it compact", () => {
    expect(normalizeIban("AO03 0006 0000 0012 3456 7890 1")).toBe("AO03000600000012345678901");
    expect(normalizeIban("ao03000600000012345678901")).toBe("AO03000600000012345678901");
  });

  it("refuses wrong check digits and things that aren't IBANs", () => {
    expect(normalizeIban("AO04000600000012345678901")).toBeNull();
    expect(normalizeIban("12345")).toBeNull();
    expect(normalizeIban("")).toBeNull();
  });
});

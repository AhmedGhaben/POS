import { hashPin, PIN_PATTERN, verifyPin } from "./pin";

describe("PIN hashing", () => {
  it("checks the right PIN and refuses a wrong one", async () => {
    const stored = await hashPin("4821");
    expect(stored).toMatch(/^pbkdf2-sha256\$210000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(await verifyPin("4821", stored)).toBe(true);
    expect(await verifyPin("4822", stored)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPin("1234")).not.toBe(await hashPin("1234"));
  });

  it("refuses malformed stored values", async () => {
    expect(await verifyPin("1234", "")).toBe(false);
    expect(await verifyPin("1234", "md5$1$aa$bb")).toBe(false);
  });

  it("PINs are 4 to 6 digits", () => {
    expect(["1234", "123456"].every((p) => PIN_PATTERN.test(p))).toBe(true);
    expect(["123", "1234567", "12a4", " 1234"].some((p) => PIN_PATTERN.test(p))).toBe(false);
  });
});

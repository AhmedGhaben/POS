import { readFileSync } from "fs";
import { hashExcerpt, hashMessage, RsaSha1Signer, signerFromEnv, TEST_KEY_FILE } from "./signature";

/**
 * Test vectors for the SAF-T (AO) hash chain, made with the test key
 * (src/fiscal/testing/test-key.pem, never used outside tests). RSA-SHA1
 * PKCS#1 v1.5 is deterministic, so the same message always signs the same.
 */
const FIRST =
  "VHTUZovonL2sQBAa9Qw5y/jTQd/uNxq0pfmf2lw4yn2CUUP9lYvBXIwAWYIzOsGkKBtxLl/v0CitmuJXp6Ji3JfqhaCbe2llJP2OitkI9WmLlZ46vT+O1Rec4IwS/Fb2QER2y20QaWFELX/zZQ/EDcgLq52f4EdKnWv16qxz/kk=";
const SECOND =
  "q94i3dKgGGs1UPL7qLURxht0kuh0DVTlaXOYlsqWQh1dbblBKr+u9526orVWrlKydtkanDYFow3tPmHot0F/T18u2nk41rZQDEJpU4nrukDAr2x7r/8JjEsnKJC36G9NNIZbFN9nMOFGjSh/ye9Ez14VEVjX8WH6kifqFXpaFvM=";

describe("SAF-T hash chain signature", () => {
  const signer = new RsaSha1Signer(readFileSync(TEST_KEY_FILE, "utf8"));

  it("builds the message InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;previous hash", () => {
    expect(
      hashMessage({ invoiceDate: "2026-10-15", systemEntryDate: "2026-10-15T10:20:30", documentNo: "FR POS001-2026/1", grossTotal: "1250.00", previousHash: "" }),
    ).toBe("2026-10-15;2026-10-15T10:20:30;FR POS001-2026/1;1250.00;");
  });

  it("signs the first document of a series (no previous hash) as the test vector says", () => {
    const message = hashMessage({ invoiceDate: "2026-10-15", systemEntryDate: "2026-10-15T10:20:30", documentNo: "FR POS001-2026/1", grossTotal: "1250.00", previousHash: "" });
    expect(signer.sign(message)).toBe(FIRST);
    // 1024-bit key: 128 bytes, 172 Base64 characters.
    expect(FIRST).toHaveLength(172);
    expect(signer.verify(message, FIRST)).toBe(true);
  });

  it("chains the next document on the previous one's hash", () => {
    const message = hashMessage({ invoiceDate: "2026-10-15", systemEntryDate: "2026-10-15T10:25:00", documentNo: "FR POS001-2026/2", grossTotal: "10.00", previousHash: FIRST });
    expect(signer.sign(message)).toBe(SECOND);
    // Change anything and it no longer verifies.
    expect(signer.verify(message.replace("10.00", "10.01"), SECOND)).toBe(false);
  });

  it("prints characters 1, 11, 21 and 31 of the hash", () => {
    expect(hashExcerpt(FIRST)).toBe("V2yq");
  });

  it("tests sign with the test key; certified software can't run without the real one", () => {
    expect(signerFromEnv({ NODE_ENV: "test" }).sign("x")).toBe(signer.sign("x"));
    expect(() => signerFromEnv({ NODE_ENV: "production", AGT_SOFTWARE_CERTIFICATE: "77/AGT/2019" })).toThrow(/SAFT_PRIVATE_KEY/);
    const pem = readFileSync(TEST_KEY_FILE, "utf8");
    expect(() => signerFromEnv({ NODE_ENV: "production", SAFT_PRIVATE_KEY: pem })).toThrow(/test key/);
    expect(signerFromEnv({ NODE_ENV: "development", SAFT_PRIVATE_KEY: pem.replace(/\n/g, "\\n"), SAFT_KEY_VERSION: "2" }).keyVersion).toBe("2");
  });
});

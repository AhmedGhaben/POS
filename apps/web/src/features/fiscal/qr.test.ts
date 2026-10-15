import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { AO } from "@pos/shared";
import { QR_PIXELS, qrMatrix, qrPixels } from "./qr";

describe("AGT QR code", () => {
  // The example from the AGT spec's length: about 123 characters.
  const url = AO.documentQrUrl("000415195LA035", "FR POS1-2026/0000057");

  it("encodes the AGT link with spaces as %20", () => {
    expect(url).toBe("https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=000415195LA035&document=FR%20POS1-2026/0000057");
    expect(url.length).toBeGreaterThan(120);
  });

  it("uses the smallest version that holds it at level M: version 8 (version 4 holds only 62 bytes)", () => {
    expect(qrMatrix(url).version).toBe(8);
    expect(qrMatrix("x".repeat(62)).version).toBe(4);
  });

  it("draws 350 x 350 px with a quiet zone, and a reader decodes the link back", () => {
    const { width, data } = qrPixels(url);
    expect(width).toBe(QR_PIXELS);
    // The corners are the quiet zone: white.
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
    const decoded = jsQR(data, width, width);
    expect(decoded?.data).toBe(url);
  });

  it("decodes accented text as UTF-8", () => {
    const { width, data } = qrPixels("Facturação nº 1");
    expect(jsQR(data, width, width)?.data).toBe("Facturação nº 1");
  });
});

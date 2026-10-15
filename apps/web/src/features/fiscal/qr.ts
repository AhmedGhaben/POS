import QRCode from "qrcode";

/**
 * The AGT QR code (docs/plans/ANGOLA.md, phase 8): QR Model 2, error
 * correction M, byte mode, UTF-8, the smallest version that holds the link
 * (about 123 characters, so version 8: version 4 holds only 62 bytes at M),
 * a 4-module quiet zone so it scans from thermal 58/80 mm prints, drawn as
 * a 350 x 350 px PNG.
 */
export const QR_PIXELS = 350;
export const QUIET_ZONE = 4;

/**
 * The AGT logo in the centre is optional; at level M a 20% logo can break
 * scanning, so it stays off until tested on real prints (to confirm with AGT
 * during certification).
 */
export const QR_CENTER_LOGO = false;

export interface QrMatrix {
  version: number;
  /** Modules per side, without the quiet zone. */
  size: number;
  dark: (x: number, y: number) => boolean;
}

export function qrMatrix(value: string): QrMatrix {
  const qr = QRCode.create([{ data: new TextEncoder().encode(value), mode: "byte" }], { errorCorrectionLevel: "M" });
  return { version: qr.version, size: qr.modules.size, dark: (x, y) => !!qr.modules.get(x, y) };
}

/**
 * Black-and-white pixels of the code with its quiet zone, `pixels` wide:
 * whole pixels per module (so edges stay sharp on thermal heads), centred.
 */
export function qrPixels(value: string, pixels = QR_PIXELS): { width: number; data: Uint8ClampedArray } {
  const m = qrMatrix(value);
  const modules = m.size + QUIET_ZONE * 2;
  const scale = Math.max(1, Math.floor(pixels / modules));
  const offset = Math.floor((pixels - modules * scale) / 2);
  const data = new Uint8ClampedArray(pixels * pixels * 4).fill(255);
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.dark(x, y)) continue;
      const px = offset + (x + QUIET_ZONE) * scale;
      const py = offset + (y + QUIET_ZONE) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((py + dy) * pixels + px + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { width: pixels, data };
}

/** The code as a PNG data URL, drawn at once (a receipt printed straight away still has it). */
export function qrPngDataUrl(value: string): string | null {
  if (typeof document === "undefined") return null;
  const { width, data } = qrPixels(value);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(width, width);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

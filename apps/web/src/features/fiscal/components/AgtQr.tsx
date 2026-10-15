import * as React from "react";
import QRCode from "qrcode";

/**
 * The AGT QR code on a document, error correction M. Drawn as inline SVG
 * straight away (no image to wait for), so a receipt printed the moment the
 * sale ends still has it. The link is too long for QR version 4, so the
 * smallest version that holds it is used. `size` is the printed width in px
 * (350 on A4).
 */
export function AgtQr({ value, size, className }: { value: string; size: number; className?: string }) {
  const path = React.useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) d += `M${x + 1} ${y + 1}h1v1h-1z`;
      }
    }
    return { d, n: n + 2 };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label="QR AGT"
      data-qr={value}
      width={size}
      height={size}
      viewBox={`0 0 ${path.n} ${path.n}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}

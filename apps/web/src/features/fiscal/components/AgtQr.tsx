import * as React from "react";
import { QUIET_ZONE, qrMatrix, qrPngDataUrl } from "../qr";

/**
 * The AGT QR code on a document (features/fiscal/qr.ts): a 350 x 350 px PNG
 * with its quiet zone, made at once so a receipt printed the moment the sale
 * ends still has it, shown `size` px wide. Without a canvas (tests) it's
 * drawn as SVG from the same modules.
 */
export function AgtQr({ value, size, className }: { value: string; size: number; className?: string }) {
  const png = React.useMemo(() => qrPngDataUrl(value), [value]);
  const svg = React.useMemo(() => {
    if (png) return null;
    const m = qrMatrix(value);
    let d = "";
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.dark(x, y)) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    return { d, n: m.size + QUIET_ZONE * 2 };
  }, [png, value]);

  if (png) {
    return <img src={png} alt="QR AGT" data-qr={value} width={size} height={size} className={className} style={{ imageRendering: "pixelated" }} />;
  }
  return (
    <svg role="img" aria-label="QR AGT" data-qr={value} width={size} height={size} viewBox={`0 0 ${svg!.n} ${svg!.n}`} shapeRendering="crispEdges" className={className}>
      <rect width={svg!.n} height={svg!.n} fill="#fff" />
      <path d={svg!.d} fill="#000" />
    </svg>
  );
}

import * as React from "react";

/** Scale of the on-screen A4 preview (210 mm ≈ 794 px). */
const SCALE = 0.55;

/** Shrinks an A4 document to fit a dialog; the printed copy is full size. */
export function A4Preview({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-[50vh] overflow-auto rounded-md border bg-muted/40 p-3">
      <div style={{ height: `${297 * SCALE}mm`, width: `${210 * SCALE}mm` }} className="mx-auto">
        <div className="origin-top-left shadow" style={{ transform: `scale(${SCALE})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

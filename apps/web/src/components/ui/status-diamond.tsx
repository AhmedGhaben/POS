import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * StatusDiamond: the logo's rounded diamond as the one sign for connection
 * and sync status, in the back office and on the till.
 *
 *   online   filled green       connected and up to date
 *   offline  filled amber       no connection; sales are kept locally
 *   syncing  green outline      uploading saved sales (gentle pulse)
 *   waiting  muted outline      sales saved, upload when someone signs in
 *   inactive muted, 50%         device off or no open shift (no alarm)
 *   error    filled red         a real sync failure that needs action
 *
 * Never colour alone: a text label is shown next to it, or, with
 * `hideLabel`, given as its accessible name and tooltip.
 */
export type DiamondState = "online" | "offline" | "syncing" | "waiting" | "inactive" | "error";
export type DiamondSize = 8 | 10 | 12 | 16;

const FILL: Record<DiamondState, string> = {
  online: "var(--sb-status-online)",
  offline: "var(--sb-status-offline)",
  syncing: "transparent",
  waiting: "transparent",
  inactive: "var(--sb-text-muted)",
  error: "var(--sb-status-error)",
};

interface StatusDiamondProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  state: DiamondState;
  /** Side of the square before rotation, in px. */
  size?: DiamondSize;
  /** Replaces the default label (e.g. with the number of sales waiting). */
  label?: React.ReactNode;
  /** Diamond only; the label becomes its aria-label and tooltip. */
  hideLabel?: boolean;
}

export function StatusDiamond({ state, size = 10, label, hideLabel = false, className, ...props }: StatusDiamondProps) {
  const { t } = useTranslation();
  const text = label ?? t(`connection.${state}`);
  // The rotated square needs side × √2 of room.
  const box = Math.ceil(size * Math.SQRT2);
  const c = box / 2;
  // The outline (syncing) is drawn inside the shape, so both look the same size.
  const outlined = state === "syncing" || state === "waiting";
  const stroke = outlined ? 2 : 0;
  const side = size - stroke;
  const accessibleName = typeof text === "string" ? text : undefined;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      data-state={state}
      title={hideLabel ? accessibleName : undefined}
      {...props}
    >
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        className={cn("shrink-0", state === "syncing" && "sb-diamond-pulse")}
        role={hideLabel ? "img" : undefined}
        aria-label={hideLabel ? accessibleName : undefined}
        aria-hidden={hideLabel ? undefined : true}
      >
        <rect
          x={c - side / 2}
          y={c - side / 2}
          width={side}
          height={side}
          rx={size * 0.22}
          transform={`rotate(45 ${c} ${c})`}
          fill={FILL[state]}
          fillOpacity={state === "inactive" ? 0.5 : 1}
          stroke={state === "syncing" ? "var(--sb-status-online)" : state === "waiting" ? "var(--sb-text-muted)" : undefined}
          strokeWidth={stroke || undefined}
        />
      </svg>
      {!hideLabel && <span>{text}</span>}
    </span>
  );
}

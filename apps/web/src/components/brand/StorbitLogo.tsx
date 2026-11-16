import { cn } from "@/lib/utils";
import { DIAMOND_PATH, LOGO_VIEWBOX, WORD_PATH } from "./logo-paths";

/*
 * The STORBIT logo, inline so the diamond (the dot of the "i") can take a
 * status colour. Paths copied unchanged from docs/brand/logo/
 * storbit-logo-on-light.svg (logo-paths.ts): never redraw or respace them.
 *
 * Word: graphite on light, paper on dark (the provided light/dark files).
 * Diamond: --sb-logo-diamond (green), or amber when this device is offline.
 */

export type LogoStatus = "online" | "offline";

interface StorbitLogoProps {
  className?: string;
  /** Only pass this where the app already knows the connection state. */
  status?: LogoStatus;
  /** One colour (receipts, stamps): the word and the diamond in currentColor. */
  mono?: boolean;
  /** Accessible name; the logo reads "storbit" by default. */
  title?: string;
}

export function StorbitLogo({ className, status = "online", mono = false, title = "storbit" }: StorbitLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={LOGO_VIEWBOX}
      role="img"
      aria-label={title}
      // Minimum 72 px on screen.
      className={cn("h-7 w-auto min-w-[72px] shrink-0", className)}
    >
      <path
        className={mono ? undefined : "fill-[var(--sb-graphite)] dark:fill-[var(--sb-paper)]"}
        fill={mono ? "currentColor" : undefined}
        fillRule="evenodd"
        d={WORD_PATH}
      />
      <path
        className="storbit-status"
        fill={mono ? "currentColor" : status === "offline" ? "var(--sb-status-offline)" : "var(--sb-logo-diamond)"}
        d={DIAMOND_PATH}
      />
    </svg>
  );
}

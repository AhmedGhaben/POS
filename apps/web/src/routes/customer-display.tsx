import * as React from "react";
import { useAuthStore } from "@/features/auth/store";
import { logoSrc } from "@/features/business/api";
import {
  CUSTOMER_DISPLAY_CHANNEL,
  type CustomerDisplayMessage,
  type CustomerDisplayState,
} from "@/features/desktop/customer-display";

/**
 * Full-screen page for a monitor facing the customer. Opened by the Windows
 * app on the second screen (or by hand in another browser window). It has
 * no data of its own: the POS on this computer broadcasts what to show.
 */
export function CustomerDisplayPage() {
  const business = useAuthStore((s) => s.business);
  const [state, setState] = React.useState<CustomerDisplayState>({
    mode: "idle",
    message: business ? `Welcome to ${business.name}` : "Welcome",
  });
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    document.title = "Customer display";
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channel.onmessage = (e: MessageEvent<CustomerDisplayMessage>) => {
      if (e.data?.type === "state") setState(e.data.state);
    };
    channel.postMessage({ type: "hello" } satisfies CustomerDisplayMessage);
    return () => channel.close();
  }, []);

  // Keep the newest lines in view on a long sale.
  React.useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [state]);

  const logo = logoSrc(business);

  return (
    <div
      className="fixed inset-0 flex select-none flex-col overflow-hidden bg-neutral-950 p-[3vmin] text-white"
      data-testid="customer-display"
    >
      {state.mode === "idle" && (
        <div className="m-auto flex flex-col items-center gap-[4vmin] text-center">
          {logo && <img src={logo} alt="" className="max-h-[25vh] max-w-[60vw] object-contain" />}
          <p className="text-[clamp(1.5rem,6vmin,4rem)] font-semibold">{state.message}</p>
        </div>
      )}

      {state.mode === "cart" && (
        <div className="flex min-h-0 flex-1 gap-[3vmin]">
          <ul ref={listRef} className="min-h-0 min-w-0 flex-1 space-y-[1vmin] overflow-y-auto text-[clamp(1rem,3.6vmin,2.25rem)]">
            {state.lines.map((line) => (
              <li
                key={line.name}
                className={`flex justify-between gap-6 rounded-lg px-4 py-2 ${
                  state.lastItem?.name === line.name ? "bg-white/10" : ""
                }`}
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {line.quantity > 1 && <span className="text-white/60">{line.quantity} × </span>}
                  {line.name}
                </span>
                <span className="shrink-0 tabular-nums">{line.total}</span>
              </li>
            ))}
          </ul>
          <div className="flex w-[38%] min-w-0 flex-col justify-end rounded-2xl bg-white/5 p-[3vmin]">
            <p className="text-[clamp(0.9rem,3vmin,1.75rem)] text-white/60">
              {state.itemCount} item{state.itemCount === 1 ? "" : "s"}
            </p>
            <p className="text-[clamp(1rem,3.6vmin,2.25rem)] text-white/80">Total</p>
            <p
              className="text-[clamp(1.75rem,min(9vmin,5.5vw),6rem)] font-bold leading-tight tabular-nums [overflow-wrap:anywhere]"
              data-testid="customer-total"
            >
              {state.total}
            </p>
          </div>
        </div>
      )}

      {state.mode === "paid" && (
        <div className="m-auto space-y-[3vmin] text-center">
          <p className="text-[clamp(2rem,10vmin,5rem)] font-semibold">Thank you!</p>
          <p className="text-[clamp(1rem,4vmin,2.25rem)] text-white/70 tabular-nums">Total {state.total}</p>
          {state.change !== null && (
            <>
              <p className="text-[clamp(1rem,4vmin,2.25rem)] text-white/70 tabular-nums">Paid {state.paid}</p>
              <p
                className="text-[clamp(1.75rem,11vmin,6rem)] font-bold leading-tight tabular-nums"
                data-testid="customer-change"
              >
                Change {state.change}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

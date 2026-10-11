import * as React from "react";
import type { SaleDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import i18n, { DEFAULT_LANGUAGE, isLanguage } from "@/i18n";
import { useDocumentLanguage } from "@/i18n/use-document-language";
import type { CartLine } from "@/features/pos/hooks/useCart";
import { desktop, useDeviceStore } from "./bridge";

/**
 * What the customer sees. The POS only publishes this abstract state; the
 * customer screen (/customer-display, same origin, over a BroadcastChannel)
 * and the Windows app's pole display each render it their own way. Money
 * is formatted here so neither needs currency rules. Mirrors
 * apps/desktop/src/hardware/pole-display.ts.
 */
/** The pole display's fixed words, in the business language. */
export interface PoleLabels {
  total: string;
  paid: string;
  change: string;
  thanks: string;
}

export type CustomerDisplayState =
  | { mode: "idle"; message: string }
  | {
      mode: "cart";
      lastItem: { name: string; quantity: number; price: string } | null;
      lines: { name: string; quantity: number; total: string }[];
      itemCount: number;
      total: string;
      labels: PoleLabels;
    }
  | { mode: "paid"; total: string; paid: string; change: string | null; labels: PoleLabels };

export const CUSTOMER_DISPLAY_CHANNEL = "pos-customer-display";

export type CustomerDisplayMessage = { type: "state"; state: CustomerDisplayState } | { type: "hello" };

let channel: BroadcastChannel | null = null;
let lastState: CustomerDisplayState | null = null;

/** "Welcome to <business>" in the business language: the customer reads it. */
export function welcomeText(business: { name: string; language?: string } | null | undefined): string {
  const lng = isLanguage(business?.language) ? business.language : DEFAULT_LANGUAGE;
  return business
    ? i18n.t("documents:display.welcomeTo", { name: business.name, lng })
    : i18n.t("documents:display.welcome", { lng });
}

function idleMessage(): string {
  const idle = useDeviceStore.getState().display?.idleMessage?.trim();
  return idle || welcomeText(useAuthStore.getState().business);
}

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    // A customer screen that just opened asks what to show: the current
    // sale, or the welcome message when no sale is in progress.
    channel.onmessage = (e: MessageEvent<CustomerDisplayMessage>) => {
      if (e.data?.type !== "hello") return;
      const state = lastState ?? { mode: "idle", message: idleMessage() };
      channel!.postMessage({ type: "state", state } satisfies CustomerDisplayMessage);
    };
  }
  return channel;
}

/** Answer customer screens from any page, not only while the POS is open. */
export function startCustomerDisplayChannel() {
  getChannel();
}

export function publishDisplayState(state: CustomerDisplayState) {
  lastState = state;
  getChannel()?.postMessage({ type: "state", state } satisfies CustomerDisplayMessage);
  if (useDeviceStore.getState().display?.kind === "pole") desktop?.display.show(state);
}

/** The welcome text: this till's idle message, else the business name. */
export function useIdleMessage() {
  const idle = useDeviceStore((s) => s.display?.idleMessage);
  const business = useAuthStore((s) => s.business);
  return idle?.trim() || welcomeText(business);
}

/** Keep idle customer screens in step when the welcome message changes. */
export function useIdleMessageBroadcast() {
  const message = useIdleMessage();
  React.useEffect(() => {
    if (!lastState || lastState.mode === "idle") publishDisplayState({ mode: "idle", message });
  }, [message]);
}

/**
 * Keeps the customer display in step with the POS: the cart while
 * ringing up (last item + total), paid/change after checkout, the welcome
 * message otherwise. Coalesces bursts (scanning) into one update.
 */
export function useCustomerDisplay(lines: CartLine[], total: number, completedSale: SaleDto | null) {
  const { money, t } = useDocumentLanguage(); // the customer's screen: business language
  const labels: PoleLabels = {
    total: t("pole.total"),
    paid: t("pole.paid"),
    change: t("pole.change"),
    thanks: t("pole.thanks"),
  };
  const idleMessage = useIdleMessage();
  const previous = React.useRef<Map<string, number>>(new Map());
  const lastItem = React.useRef<{ name: string; quantity: number; price: string } | null>(null);

  // The item that just changed: new, or its quantity went up.
  const quantities = new Map(lines.map((l) => [l.product.id, l.quantity]));
  for (const line of lines) {
    const before = previous.current.get(line.product.id) ?? 0;
    if (line.quantity > before) {
      lastItem.current = {
        name: line.product.name,
        quantity: line.quantity,
        price: money(Number(line.product.sellPrice) * line.quantity),
      };
    }
  }
  if (lastItem.current && !lines.some((l) => l.product.name === lastItem.current!.name)) lastItem.current = null;
  previous.current = quantities;

  let state: CustomerDisplayState;
  if (completedSale) {
    const tendered = completedSale.amountTendered !== null ? Number(completedSale.amountTendered) : null;
    state = {
      mode: "paid",
      total: money(completedSale.total),
      paid: money(tendered ?? completedSale.total),
      change: completedSale.changeDue !== null ? money(completedSale.changeDue) : null,
      labels,
    };
  } else if (lines.length > 0) {
    state = {
      mode: "cart",
      lastItem: lastItem.current,
      lines: lines.map((l) => ({
        name: l.product.name,
        quantity: l.quantity,
        total: money(Number(l.product.sellPrice) * l.quantity),
      })),
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
      total: money(total),
      labels,
    };
  } else {
    state = { mode: "idle", message: idleMessage };
  }

  const key = JSON.stringify(state);
  React.useEffect(() => {
    const timer = setTimeout(() => publishDisplayState(JSON.parse(key) as CustomerDisplayState), 80);
    return () => clearTimeout(timer);
  }, [key]);

  // Leaving the POS: back to the welcome screen.
  React.useEffect(() => () => publishDisplayState({ mode: "idle", message: idleMessage }), [idleMessage]);
}

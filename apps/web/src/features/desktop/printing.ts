import { toast } from "sonner";
import i18n from "@/i18n";
import { desktop, type DesktopPrintJob } from "./bridge";

/**
 * Prints whatever <PrintArea> currently holds.
 *
 * In the Windows app with a printer set up for that kind of document, it
 * prints silently to that printer from a hidden window. Otherwise (browser,
 * or no printer chosen yet) it opens the normal print dialog. A failed
 * silent print shows a toast with Retry; it never affects the sale.
 */
export async function printDocument(options: { copies?: number } = {}): Promise<void> {
  const root = document.getElementById("print-root");
  const kind = root?.dataset.format === "a4" ? "a4" : "receipt";
  if (!desktop || !root?.innerHTML.trim()) {
    window.print();
    return;
  }

  const settings = await desktop.printing.get();
  const deviceName = kind === "a4" ? settings.a4.deviceName : settings.receipt.deviceName;
  if (!deviceName) {
    window.print();
    return;
  }

  const job: DesktopPrintJob = {
    kind,
    html: root.innerHTML,
    stylesheets: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((l) => l.href),
    copies: options.copies,
  };
  await sendJob(job);
}

async function sendJob(job: DesktopPrintJob): Promise<void> {
  const result = await desktop!.printers.print(job);
  if (!result.ok) {
    toast.error(i18n.t("device:printers.printFailed", { error: result.error }), {
      duration: 15_000,
      action: { label: i18n.t("common:actions.retry"), onClick: () => void sendJob(job) },
    });
  }
}

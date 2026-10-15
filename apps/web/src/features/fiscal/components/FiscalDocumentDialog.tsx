import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintArea } from "@/components/print/PrintArea";
import { PrintButton, type PrintChoice } from "@/components/print/PrintButton";
import { useAuthStore } from "@/features/auth/store";
import { printDocument } from "@/features/desktop/printing";
import { A4Preview } from "@/features/invoices/components/A4Preview";
import { fetchFiscalDocument, recordPrint } from "../api";
import { copyLabels, documentTitle } from "../fiscal-text";
import { FiscalA4 } from "./FiscalA4";

/**
 * Opens a fiscal document as stored and prints it on A4. The first print is
 * the original (in the store's number of copies: Original, Duplicado...);
 * every later print says "2ª Via". Each print is logged on the server.
 */
export function FiscalDocumentDialog({ documentId, onClose, autoPrint = false }: { documentId: string | null; onClose: () => void; autoPrint?: boolean }) {
  const { t } = useTranslation(["invoices", "common"]);
  const queryClient = useQueryClient();
  const stores = useAuthStore((s) => s.stores);
  const query = useQuery({
    queryKey: ["fiscal-documents", "detail", documentId],
    queryFn: () => fetchFiscalDocument(documentId!),
    enabled: !!documentId,
    staleTime: 0,
  });
  const doc = query.data;
  const storeCopies = stores.find((s) => s.id === doc?.storeId)?.documentCopies ?? 1;
  const printed = (doc?.printCount ?? 0) > 0;
  // What's in the print area: the labelled copies of the print under way, or the preview's.
  const [job, setJob] = React.useState<{ labels: string[]; deviceName?: string } | null>(null);

  const print = React.useCallback(
    async (choice: PrintChoice) => {
      if (!doc) return;
      let reprint = printed;
      try {
        reprint = (await recordPrint(doc.id, "A4", choice.copies)).reprint;
      } catch {
        // Offline: go by what we know; the print isn't held up.
      }
      setJob({ labels: copyLabels(choice.copies, reprint), deviceName: choice.deviceName });
    },
    [doc, printed],
  );

  // Once the labelled copies are in the print area, send them (one job, every copy in it).
  React.useEffect(() => {
    if (!job) return;
    const frame = requestAnimationFrame(() => {
      void printDocument({ copies: 1, deviceName: job.deviceName }).finally(() => {
        setJob(null);
        void queryClient.invalidateQueries({ queryKey: ["fiscal-documents", "detail", documentId] });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [job, documentId, queryClient]);

  // Opened right after a sale with auto-print on: print the original once.
  const autoPrinted = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!autoPrint || !doc || autoPrinted.current === doc.id) return;
    autoPrinted.current = doc.id;
    void print({ copies: storeCopies });
  }, [autoPrint, doc, print, storeCopies]);

  const previewLabel = copyLabels(1, printed)[0];
  return (
    <Dialog open={!!documentId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{doc ? `${documentTitle(doc.documentType, doc.seller.country)} ${doc.documentNo}` : t("fiscal.document")}</DialogTitle>
          <DialogDescription>{printed ? t("fiscal.reprintNote") : t("fiscal.firstPrintNote")}</DialogDescription>
        </DialogHeader>
        {!doc ? (
          <p className="text-sm text-muted-foreground">{query.isError ? t("page.loadFailed") : t("common:actions.loading")}</p>
        ) : (
          <>
            <A4Preview>
              <FiscalA4 doc={doc} copyLabel={previewLabel} />
            </A4Preview>
            <PrintButton defaultCopies={printed ? 1 : storeCopies} onPrint={print} label={t("issue.print")} />
            <PrintArea format="a4">
              {(job?.labels ?? [previewLabel]).map((label, i) => (
                <FiscalA4 key={i} doc={doc} copyLabel={label} />
              ))}
            </PrintArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

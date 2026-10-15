import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintArea } from "@/components/print/PrintArea";
import { printDocument } from "@/features/desktop/printing";
import { A4Preview } from "@/features/invoices/components/A4Preview";
import { fetchFiscalDocument } from "../api";
import { documentTitle } from "../fiscal-text";
import { FiscalA4 } from "./FiscalA4";

/** Opens a fiscal document as stored and prints it on A4 (a reprint is identical). */
export function FiscalDocumentDialog({ documentId, onClose }: { documentId: string | null; onClose: () => void }) {
  const { t } = useTranslation(["invoices", "common"]);
  const query = useQuery({
    queryKey: ["fiscal-documents", "detail", documentId],
    queryFn: () => fetchFiscalDocument(documentId!),
    enabled: !!documentId,
  });
  const doc = query.data;

  return (
    <Dialog open={!!documentId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{doc ? `${documentTitle(doc.documentType, doc.seller.country)} ${doc.documentNo}` : t("fiscal.document")}</DialogTitle>
          <DialogDescription>{t("fiscal.reprintNote")}</DialogDescription>
        </DialogHeader>
        {!doc ? (
          <p className="text-sm text-muted-foreground">{query.isError ? t("page.loadFailed") : t("common:actions.loading")}</p>
        ) : (
          <>
            <A4Preview>
              <FiscalA4 doc={doc} />
            </A4Preview>
            <Button onClick={() => void printDocument()}>
              <Printer className="mr-2 h-4 w-4" /> {t("issue.print")}
            </Button>
            <PrintArea format="a4">
              <FiscalA4 doc={doc} />
            </PrintArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

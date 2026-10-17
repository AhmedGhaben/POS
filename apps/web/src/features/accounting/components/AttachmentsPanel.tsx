import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError, apiClient, saveFile } from "@/lib/api-client";
import { fetchAttachments, removeAttachment, uploadAttachment, type AttachmentOwner } from "../api";

const MAX_BYTES = 5 * 1024 * 1024;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Scanned papers kept with a purchase, an expense or an entry (PDF or image, 5 MB each). */
export function AttachmentsPanel({ ownerType, ownerId, canWrite = true }: { ownerType: AttachmentOwner; ownerId: string; canWrite?: boolean }) {
  const { t } = useTranslation("accounting");
  const queryClient = useQueryClient();
  const key = ["attachments", ownerType, ownerId];
  const list = useQuery({ queryKey: key, queryFn: () => fetchAttachments(ownerType, ownerId) });
  const input = React.useRef<HTMLInputElement>(null);
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error(t("attachments.tooBig"));
      return uploadAttachment({ ownerType, ownerId, fileName: file.name, dataUrl: await readAsDataUrl(file) });
    },
    onSuccess: () => (refresh(), toast.success(t("attachments.added"))),
    onError: (error) => (error instanceof ApiError ? fail(error) : toast.error(error instanceof Error ? error.message : t("failed"))),
  });
  const remove = useMutation({ mutationFn: removeAttachment, onSuccess: refresh, onError: fail });

  return (
    <div className="space-y-2">
      <ul className="space-y-1 text-sm">
        {list.data?.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="flex-1 truncate">{a.fileName}</span>
            <span className="text-xs text-muted-foreground">{Math.ceil(a.size / 1024)} KB</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("attachments.download", { name: a.fileName })}
              onClick={async () => {
                try {
                  saveFile(await apiClient.download(`/attachments/${a.id}/file`));
                } catch (error) {
                  fail(error);
                }
              }}
            >
              <Download className="h-4 w-4" aria-hidden />
            </Button>
            {canWrite && (
              <Button size="icon" variant="ghost" aria-label={t("attachments.remove", { name: a.fileName })} onClick={() => remove.mutate(a.id)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </li>
        ))}
        {list.data?.length === 0 && <li className="text-muted-foreground">{t("attachments.none")}</li>}
      </ul>
      {canWrite && (
        <>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label={t("attachments.add")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
            <Upload className="mr-2 h-4 w-4" aria-hidden />
            {t("attachments.add")}
          </Button>
        </>
      )}
    </div>
  );
}

/** A paperclip that opens the attachments of one record. */
export function AttachmentsButton({ ownerType, ownerId, title }: { ownerType: AttachmentOwner; ownerId: string; title: string }) {
  const { t } = useTranslation("accounting");
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="icon" variant="ghost" aria-label={t("attachments.title")} onClick={() => setOpen(true)}>
        <Paperclip className="h-4 w-4" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attachments.title")}</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          {open && <AttachmentsPanel ownerType={ownerType} ownerId={ownerId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

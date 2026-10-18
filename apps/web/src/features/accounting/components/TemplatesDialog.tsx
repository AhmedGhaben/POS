import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-client";
import { fetchTemplates, removeTemplate, TEMPLATES_KEY, type EntryTemplateDto } from "../api";

/** Lançamentos pré-definidos: pick one to start a new entry from it. */
export function TemplatesDialog({ open, onClose, onUse, canWrite }: { open: boolean; onClose: () => void; onUse: (t: EntryTemplateDto) => void; canWrite: boolean }) {
  const { t } = useTranslation("accounting");
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: TEMPLATES_KEY, queryFn: fetchTemplates, enabled: open });
  const remove = useMutation({
    mutationFn: removeTemplate,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("templates.title")}</DialogTitle>
          <DialogDescription>{t("templates.hint")}</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {templates.data?.map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-2 p-2">
              <div className="flex-1">
                <p className="font-medium">{tpl.name}</p>
                <p className="text-xs text-muted-foreground">{tpl.description}</p>
              </div>
              {canWrite && (
                <>
                  <Button size="sm" onClick={() => onUse(tpl)}>
                    {t("templates.use")}
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={t("templates.remove")} onClick={() => remove.mutate(tpl.id)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </>
              )}
            </li>
          ))}
          {templates.data?.length === 0 && <li className="p-4 text-sm text-muted-foreground">{t("templates.empty")}</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

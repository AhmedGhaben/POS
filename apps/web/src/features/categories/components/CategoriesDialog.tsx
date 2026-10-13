import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CategoryDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategory, deleteCategory, fetchCategories, renameCategory } from "@/features/categories/api";

/**
 * Add, rename and delete categories. Deleting one moves its products to
 * another category (or leaves them without one), so no product is lost.
 */
export function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(["products", "common"]);
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, enabled: open });
  const [newName, setNewName] = React.useState("");
  const [renaming, setRenaming] = React.useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = React.useState<CategoryDto | null>(null);
  const [reassignTo, setReassignTo] = React.useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  };
  const onError = (error: unknown) => toast.error((error as Error).message);

  const createMutation = useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => {
      setNewName("");
      refresh();
      toast.success(t("categories.created"));
    },
    onError,
  });
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameCategory(id, name),
    onSuccess: () => {
      setRenaming(null);
      refresh();
      toast.success(t("categories.renamed"));
    },
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string | null }) => deleteCategory(id, to),
    onSuccess: (result) => {
      setDeleting(null);
      setReassignTo(null);
      refresh();
      toast.success(t("categories.deleted", { count: result.moved }));
    },
    onError,
  });

  const categories = categoriesQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("categories.title")}</DialogTitle>
          <DialogDescription>{t("categories.hint")}</DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) createMutation.mutate(newName.trim());
          }}
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("categories.newPlaceholder")} aria-label={t("categories.newName")} />
          <Button type="submit" disabled={!newName.trim() || createMutation.isPending}>
            <Plus className="mr-1 h-4 w-4" /> {t("categories.add")}
          </Button>
        </form>

        <ul className="divide-y rounded-md border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              {renaming?.id === c.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (renaming.name.trim()) renameMutation.mutate({ id: c.id, name: renaming.name.trim() });
                  }}
                >
                  <Input
                    autoFocus
                    value={renaming.name}
                    aria-label={t("categories.renameTo", { name: c.name })}
                    onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                  />
                  <Button type="submit" size="sm" disabled={renameMutation.isPending}>
                    {t("common:actions.save")}
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1">
                    {c.name}
                    <span className="ml-2 text-xs text-muted-foreground">{t("categories.productCount", { count: c._count?.products ?? 0 })}</span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("categories.rename", { name: c.name })}
                    onClick={() => setRenaming({ id: c.id, name: c.name })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("categories.delete", { name: c.name })}
                    onClick={() => {
                      setDeleting(c);
                      setReassignTo(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("categories.empty")}</li>}
        </ul>

        {deleting && (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3" role="group" aria-label={t("categories.deleteTitle", { name: deleting.name })}>
            <p className="text-sm font-medium">{t("categories.deleteTitle", { name: deleting.name })}</p>
            {(deleting._count?.products ?? 0) > 0 && (
              <div className="space-y-1">
                <Label>{t("categories.moveTo", { count: deleting._count?.products ?? 0 })}</Label>
                <Combobox
                  value={reassignTo}
                  onChange={setReassignTo}
                  aria-label={t("categories.moveToLabel")}
                  placeholder={t("categories.leaveUncategorized")}
                  clearLabel={t("categories.leaveUncategorized")}
                  options={categories.filter((c) => c.id !== deleting.id).map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                {t("common:actions.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ id: deleting.id, to: reassignTo })}
              >
                {t("categories.confirmDelete")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

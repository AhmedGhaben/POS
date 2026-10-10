import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { EmployeeDto, StaffRole, UpdateStaffAccessDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/features/auth/store";
import { updateStaffAccess } from "@/features/users/api";
import { PermissionsPanel } from "./PermissionsPanel";
import { StoreCheckboxes } from "./StoreCheckboxes";

interface ManageLoginDialogProps {
  employee: EmployeeDto | null;
  onClose: () => void;
}

/** Owner-only: role, store access, deactivate/reactivate, and permission overrides. */
export function ManageLoginDialog({ employee, onClose }: ManageLoginDialogProps) {
  const { t } = useTranslation(["employees", "common"]);
  const queryClient = useQueryClient();
  const stores = useAuthStore((s) => s.stores);
  const user = employee?.user ?? null;
  const [role, setRole] = React.useState<StaffRole>("CASHIER");
  const [storeIds, setStoreIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setRole(user.role === "MANAGER" ? "MANAGER" : "CASHIER");
    setStoreIds(user.storeIds);
    setError(null);
  }, [user]);

  const mutation = useMutation({
    mutationFn: (dto: UpdateStaffAccessDto) => updateStaffAccess(user!.id, dto),
    onSuccess: (_updated, dto) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (dto.isActive === false) toast.success(t("manage.deactivated", { email: user!.email }));
      else if (dto.isActive === true) toast.success(t("manage.reactivated", { email: user!.email }));
      else toast.success(t("manage.updated"));
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  function saveAccess(e: React.FormEvent) {
    e.preventDefault();
    if (storeIds.length === 0) {
      setError(t("login.pickStore"));
      return;
    }
    setError(null);
    mutation.mutate({ role, storeIds });
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {employee?.firstName} {employee?.lastName}
          </DialogTitle>
          <DialogDescription>{t("manage.signsInAs", { email: user?.email })}</DialogDescription>
        </DialogHeader>
        {user && (
          <Tabs defaultValue="access">
            <TabsList className="mb-4">
              <TabsTrigger value="access">{t("manage.access")}</TabsTrigger>
              <TabsTrigger value="permissions">{t("manage.permissions")}</TabsTrigger>
            </TabsList>
            <TabsContent value="access">
              {user.isActive ? (
                <form className="space-y-4" onSubmit={saveAccess}>
                  <div className="space-y-2">
                    <Label>{t("login.role")}</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASHIER">{t("manage.cashierRole")}</SelectItem>
                        <SelectItem value="MANAGER">{t("manage.managerRole")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("login.stores")}</Label>
                    <StoreCheckboxes stores={stores} value={storeIds} onChange={setStoreIds} />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={mutation.isPending}>
                    {t("common:actions.saveChanges")}
                  </Button>
                  <div className="border-t pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-destructive hover:text-destructive"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ isActive: false })}
                    >
                      {t("manage.deactivate")}
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("manage.deactivateHint")}
                    </p>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {t("manage.isDeactivated")}
                  </p>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    className="w-full"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ isActive: true })}
                  >
                    {t("manage.reactivate")}
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="permissions">
              <PermissionsPanel userId={user.id} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

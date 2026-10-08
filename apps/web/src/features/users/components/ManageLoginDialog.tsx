import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      if (dto.isActive === false) toast.success(`${user!.email} can no longer sign in`);
      else if (dto.isActive === true) toast.success(`${user!.email} can sign in again`);
      else toast.success("Access updated");
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  function saveAccess(e: React.FormEvent) {
    e.preventDefault();
    if (storeIds.length === 0) {
      setError("Pick at least one store they can use");
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
          <DialogDescription>Signs in as {user?.email}</DialogDescription>
        </DialogHeader>
        {user && (
          <Tabs defaultValue="access">
            <TabsList className="mb-4">
              <TabsTrigger value="access">Access</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
            </TabsList>
            <TabsContent value="access">
              {user.isActive ? (
                <form className="space-y-4" onSubmit={saveAccess}>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASHIER">Cashier — POS only</SelectItem>
                        <SelectItem value="MANAGER">Manager — POS and back office</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Stores they can use</Label>
                    <StoreCheckboxes stores={stores} value={storeIds} onChange={setStoreIds} />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={mutation.isPending}>
                    Save changes
                  </Button>
                  <div className="border-t pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-destructive hover:text-destructive"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ isActive: false })}
                    >
                      Deactivate login
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Signs them out everywhere straight away. Their sales history is kept.
                    </p>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    This login is deactivated, so they can't sign in.
                  </p>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    className="w-full"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ isActive: true })}
                  >
                    Reactivate login
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

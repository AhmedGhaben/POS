import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { EmployeeDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/features/auth/store";
import { createEmployeeLogin } from "@/features/employees/api";
import {
  emptyLoginFields,
  toStaffLoginDto,
  validateLoginFields,
  type LoginFieldsValue,
} from "@/features/users/login-fields";
import { LoginFields } from "./LoginFields";

interface CreateLoginDialogProps {
  employee: EmployeeDto | null;
  onClose: () => void;
}

/** Owner-only: give an existing employee a login. */
export function CreateLoginDialog({ employee, onClose }: CreateLoginDialogProps) {
  const queryClient = useQueryClient();
  const stores = useAuthStore((s) => s.stores);
  const [value, setValue] = React.useState<LoginFieldsValue>(emptyLoginFields());
  const [error, setError] = React.useState<string | null>(null);

  // Pre-fill from the employee each time the dialog opens for someone.
  React.useEffect(() => {
    if (!employee) return;
    const storeIds = employee.storeId ? [employee.storeId] : stores.length === 1 ? [stores[0].id] : [];
    setValue(emptyLoginFields({ email: employee.email, storeIds }));
    setError(null);
  }, [employee, stores]);

  const mutation = useMutation({
    mutationFn: () => createEmployeeLogin(employee!.id, toStaffLoginDto(value)),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success(
        value.method === "invite"
          ? `Invite sent to ${updated.user?.email}`
          : `Login created — ${updated.firstName} can sign in as ${updated.user?.email}`,
      );
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateLoginFields(value);
    setError(problem);
    if (!problem) mutation.mutate();
  }

  return (
    <Dialog open={!!employee} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Create login — {employee?.firstName} {employee?.lastName}
          </DialogTitle>
          <DialogDescription>They'll use this to sign in to the POS.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <LoginFields idPrefix="create-login" value={value} onChange={setValue} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating..." : value.method === "invite" ? "Create and send invite" : "Create login"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

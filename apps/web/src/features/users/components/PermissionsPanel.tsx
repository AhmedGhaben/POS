import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Permission } from "@pos/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { fetchEffectivePermissions, updateUserPermission } from "@/features/users/api";

const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.VIEW_COST_PRICE]: "View cost price & margin",
  [Permission.PROCESS_RETURN]: "Process returns / refunds",
  [Permission.OPEN_DRAWER]: "Open the cash drawer without a sale",
};

/** Owner-only. Each row reflects the resolved (role-default-or-overridden)
 * value — "Reset" clears any override and reverts to the role's default. */
export function PermissionsPanel({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const permissionsQuery = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: () => fetchEffectivePermissions(userId),
  });

  const mutation = useMutation({
    mutationFn: ({ permission, granted }: { permission: Permission; granted: boolean | null }) =>
      updateUserPermission(userId, permission, granted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
    },
  });

  return (
    <div className="space-y-3">
      {Object.values(Permission).map((permission) => {
        const effective = permissionsQuery.data?.[permission];
        return (
          <div key={permission} className="flex items-center justify-between gap-3">
            <span className="text-sm">{PERMISSION_LABELS[permission]}</span>
            <div className="flex items-center gap-2">
              <Select
                value={effective === undefined ? undefined : String(effective)}
                onValueChange={(v) => mutation.mutate({ permission, granted: v === "true" })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Allowed</SelectItem>
                  <SelectItem value="false">Not allowed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => mutation.mutate({ permission, granted: null })}>
                Reset
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

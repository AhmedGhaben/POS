import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Permission } from "@pos/shared";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { fetchEffectivePermissions, updateUserPermission } from "@/features/users/api";

/** Owner-only. Each row reflects the resolved (role-default-or-overridden)
 * value — "Reset" clears any override and reverts to the role's default. */
export function PermissionsPanel({ userId }: { userId: string }) {
  const { t } = useTranslation("employees");
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
            <span className="text-sm">{t(`permissions.labels.${permission}`)}</span>
            <div className="flex items-center gap-2">
              <Select
                value={effective === undefined ? undefined : String(effective)}
                onValueChange={(v) => mutation.mutate({ permission, granted: v === "true" })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{t("permissions.allowed")}</SelectItem>
                  <SelectItem value="false">{t("permissions.notAllowed")}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => mutation.mutate({ permission, granted: null })}>
                {t("permissions.reset")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

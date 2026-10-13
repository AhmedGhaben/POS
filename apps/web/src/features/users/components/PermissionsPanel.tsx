import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Permission } from "@pos/shared";
import { useTranslation } from "react-i18next";
import { Combobox } from "@/components/ui/combobox";
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
              <Combobox
                value={effective === undefined ? undefined : String(effective)}
                onChange={(v) => v !== null && mutation.mutate({ permission, granted: v === "true" })}
                className="w-36"
                aria-label={t(`permissions.labels.${permission}`)}
                options={[
                  { value: "true", label: t("permissions.allowed") },
                  { value: "false", label: t("permissions.notAllowed") },
                ]}
              />
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

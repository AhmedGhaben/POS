import type { EffectivePermissionsDto, Permission, UpdateUserPermissionDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchEffectivePermissions(userId: string) {
  return apiClient.get<EffectivePermissionsDto>(`/users/${userId}/permissions`);
}

export function updateUserPermission(userId: string, permission: Permission, granted: boolean | null) {
  return apiClient.patch<EffectivePermissionsDto>(`/users/${userId}/permissions`, {
    permission,
    granted,
  } satisfies UpdateUserPermissionDto);
}

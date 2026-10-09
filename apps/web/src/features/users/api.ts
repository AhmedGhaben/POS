import type {
  EffectivePermissionsDto,
  Permission,
  StaffAccessDto,
  UpdateStaffAccessDto,
  UpdateUserPermissionDto,
} from "@pos/shared";
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

export function updateStaffAccess(userId: string, dto: UpdateStaffAccessDto) {
  return apiClient.patch<StaffAccessDto>(`/users/${userId}/access`, dto);
}

export const MY_PERMISSIONS_QUERY_KEY = ["my-permissions"] as const;

/** The signed-in user's own effective permissions (any role). */
export function fetchMyPermissions() {
  return apiClient.get<EffectivePermissionsDto>("/users/me/permissions");
}

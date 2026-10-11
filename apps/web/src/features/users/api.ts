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

/** Someone's till PIN (owner only). */
export function setUserPin(userId: string, pin: string) {
  return apiClient.put<{ hasPin: boolean }>(`/users/${userId}/pin`, { pin });
}

export function clearUserPin(userId: string) {
  return apiClient.delete<{ hasPin: boolean }>(`/users/${userId}/pin`);
}

/** Your own till PIN; needs your password. */
export function setMyPin(pin: string, password: string) {
  return apiClient.put<{ hasPin: boolean }>("/users/me/pin", { pin, password });
}

export const MY_PERMISSIONS_QUERY_KEY = ["my-permissions"] as const;

/** The signed-in user's own effective permissions (any role). */
export function fetchMyPermissions() {
  return apiClient.get<EffectivePermissionsDto>("/users/me/permissions");
}

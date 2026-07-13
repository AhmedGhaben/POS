import type { LoginResponseDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function login(email: string, password: string) {
  return apiClient.post<LoginResponseDto>(
    "/auth/login",
    { email, password },
    { skipAuth: true },
  );
}

export function logout() {
  return apiClient.post<{ success: boolean }>("/auth/logout", undefined, { skipAuth: true });
}

import type { LoginResponseDto, RegisterRequestDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function login(email: string, password: string) {
  return apiClient.post<LoginResponseDto>(
    "/auth/login",
    { email, password },
    { skipAuth: true },
  );
}

export function register(body: RegisterRequestDto) {
  return apiClient.post<LoginResponseDto>("/auth/register", body, { skipAuth: true });
}

export function logout() {
  return apiClient.post<{ success: boolean }>("/auth/logout", undefined, { skipAuth: true });
}

export function forgotPassword(email: string) {
  return apiClient.post<{ success: boolean }>("/auth/forgot-password", { email }, { skipAuth: true });
}

export function resetPassword(token: string, newPassword: string) {
  return apiClient.post<{ success: boolean }>(
    "/auth/reset-password",
    { token, newPassword },
    { skipAuth: true },
  );
}

export function verifyEmail(token: string) {
  return apiClient.post<{ success: boolean }>("/auth/verify-email", { token }, { skipAuth: true });
}

export function resendVerification() {
  return apiClient.post<{ success: boolean }>("/auth/resend-verification");
}

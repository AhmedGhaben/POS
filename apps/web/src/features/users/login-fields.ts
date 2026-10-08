import type { StaffLoginDto, StaffRole } from "@pos/shared";

/** Form state for a new staff login. Shared by "New employee" and "Create login". */
export interface LoginFieldsValue {
  email: string;
  role: StaffRole;
  storeIds: string[];
  method: "password" | "invite";
  password: string;
}

export function emptyLoginFields(defaults: { email?: string | null; storeIds?: string[] } = {}): LoginFieldsValue {
  return {
    email: defaults.email ?? "",
    role: "CASHIER",
    storeIds: defaults.storeIds ?? [],
    method: "password",
    password: "",
  };
}

/** Returns a message for the first problem, or null when the login can be submitted. */
export function validateLoginFields(value: LoginFieldsValue): string | null {
  if (!/^\S+@\S+\.\S+$/.test(value.email.trim())) return "Enter a valid login email";
  if (value.storeIds.length === 0) return "Pick at least one store they can use";
  if (value.method === "password" && value.password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
}

export function toStaffLoginDto(value: LoginFieldsValue): StaffLoginDto {
  return {
    email: value.email.trim(),
    role: value.role,
    storeIds: value.storeIds,
    ...(value.method === "invite" ? { sendInvite: true } : { password: value.password }),
  };
}

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

import type { StaffLoginDto, StaffRole } from "@pos/shared";
import i18n from "@/i18n";

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
  if (!/^\S+@\S+\.\S+$/.test(value.email.trim())) return i18n.t("employees:login.invalidEmail");
  if (value.storeIds.length === 0) return i18n.t("employees:login.pickStore");
  if (value.method === "password" && value.password.length < 8) {
    return i18n.t("employees:login.shortPassword");
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

/** "Owner", "Manager", "Cashier" in the language on screen. */
export function roleLabel(role: string): string {
  return i18n.exists(`common:roles.${role}`) ? i18n.t(`common:roles.${role}` as never) : role;
}

import type { BusinessDto, PermissionMap, StoreDto, UserDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { desktop, useDeviceStore, type PinSignInResult } from "@/features/desktop/bridge";
import { setOfflineSessionResume } from "@/lib/api-client";
import { desktopLog } from "@/features/desktop/bridge";

/** What /auth/login, /auth/pin and /auth/pin/resume answer. */
interface SessionBody {
  accessToken: string;
  user: UserDto;
  stores: StoreDto[];
  business: BusinessDto;
}

function applySession(session: unknown) {
  const s = session as SessionBody;
  useAuthStore.getState().setSession(s.accessToken, s.user, s.stores, s.business);
}

export type PinSignInError = Extract<PinSignInResult, { ok: false }>["code"] | "no-business";

/**
 * Signs someone in on this till with their PIN. Online it's a normal
 * session; offline the till checks the PIN itself and the person works
 * with their saved permissions until the server is back.
 */
export async function signInWithPin(userId: string, pin: string): Promise<{ ok: true; user: UserDto } | { ok: false; code: PinSignInError }> {
  if (!desktop?.pin) return { ok: false, code: "not-registered" };
  const result = await desktop.pin.signIn(userId, pin);
  if (!result.ok) return { ok: false, code: result.code };
  if (result.mode === "online") {
    applySession(result.session);
    return { ok: true, user: useAuthStore.getState().user! };
  }

  // Offline: the business and stores saved from the last session on this till.
  const cache = useAuthStore.getState().tillCache;
  if (!cache) return { ok: false, code: "no-business" };
  const terminalStoreId = useDeviceStore.getState().terminal?.storeId ?? null;
  const m = result.user;
  const stores = m.role === "OWNER" ? cache.stores : cache.stores.filter((s) => s.id === terminalStoreId);
  const user: UserDto = {
    id: m.id,
    businessId: cache.business.id,
    email: "",
    firstName: m.firstName,
    lastName: m.lastName,
    role: m.role as UserDto["role"],
    isActive: true,
    language: m.language ?? null,
    accessibleStoreIds: stores.map((s) => s.id),
  };
  useAuthStore.getState().setOfflineSession(user, stores, cache.business, m.permissions as PermissionMap, terminalStoreId);
  return { ok: true, user };
}

let resuming: Promise<"resumed" | "unreachable" | "rejected"> | null = null;

/**
 * For someone signed in offline: a server session, once it can be reached.
 * If the server says no (too long offline, deactivated), back to sign-in.
 */
export function resumeOfflineSession(): Promise<"resumed" | "unreachable" | "rejected"> {
  if (!resuming) {
    resuming = (async () => {
      const { user, offline } = useAuthStore.getState();
      if (!offline || !user) return "resumed" as const;
      if (!desktop?.pin) return "unreachable" as const;
      const result = await desktop.pin.resume(user.id);
      if (result.ok) {
        applySession(result.session);
        return "resumed" as const;
      }
      if (result.code === "unreachable") return "unreachable" as const;
      desktopLog("warn", `[till] couldn't resume the session: ${result.error ?? result.code}`);
      useAuthStore.getState().clearSession();
      return "rejected" as const;
    })().finally(() => {
      resuming = null;
    });
  }
  return resuming;
}

setOfflineSessionResume(resumeOfflineSession);

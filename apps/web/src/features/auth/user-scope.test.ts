import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// The auth store persists to localStorage, which Node doesn't have.
vi.hoisted(() => {
  const items = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
    clear: () => items.clear(),
    key: () => null,
    length: 0,
  };
  (globalThis as { window?: unknown }).window ??= globalThis;
});
import { Role, type BusinessDto, type UserDto } from "@pos/shared";
import { myPermissionsQueryKey } from "@/features/users/api";
import { useAuthStore } from "./store";
import { startUserScopedCache } from "./user-scope";

function user(id: string, role: Role): UserDto {
  return {
    id,
    businessId: "b",
    email: `${id}@test`,
    firstName: id,
    lastName: "Test",
    role,
    isActive: true,
    language: null,
    accessibleStoreIds: ["s"],
  };
}

const business = { id: "b", name: "Shop" } as BusinessDto;
const stores = [{ id: "s", name: "Main" }] as never[];

describe("switching the signed-in person", () => {
  let client: QueryClient;
  let stop: () => void;

  beforeEach(() => {
    useAuthStore.getState().clearSession();
    client = new QueryClient();
    stop = startUserScopedCache(client);
  });
  afterEach(() => stop());

  it("forgets the previous person's cached permissions", () => {
    useAuthStore.getState().setSession("token-a", user("manager", Role.MANAGER), stores, business);
    client.setQueryData(myPermissionsQueryKey("manager"), { VOID_SALE: true });
    client.setQueryData(["business", "me"], business);
    useAuthStore.getState().setPermissions({ VOID_SALE: true } as never);

    useAuthStore.getState().setSession("token-b", user("cashier", Role.CASHIER), stores, business);

    expect(client.getQueryData(myPermissionsQueryKey("manager"))).toBeUndefined();
    expect(client.getQueryData(["business", "me"])).toBeUndefined();
    expect(useAuthStore.getState().permissions).toBeNull();
  });

  it("keeps everything when the same person signs in again", () => {
    useAuthStore.getState().setSession("token-a", user("cashier", Role.CASHIER), stores, business);
    client.setQueryData(myPermissionsQueryKey("cashier"), { VOID_SALE: false });
    useAuthStore.getState().setPermissions({ VOID_SALE: false } as never);

    useAuthStore.getState().setSession("token-a2", user("cashier", Role.CASHIER), stores, business);

    expect(client.getQueryData(myPermissionsQueryKey("cashier"))).toEqual({ VOID_SALE: false });
    expect(useAuthStore.getState().permissions).toEqual({ VOID_SALE: false });
  });

  it("clears the cache on sign-out", () => {
    useAuthStore.getState().setSession("token-a", user("owner", Role.OWNER), stores, business);
    client.setQueryData(["business", "me"], business);
    useAuthStore.getState().clearSession();
    expect(client.getQueryData(["business", "me"])).toBeUndefined();
  });

  it("keys permissions by person", () => {
    expect(myPermissionsQueryKey("a")).not.toEqual(myPermissionsQueryKey("b"));
  });
});

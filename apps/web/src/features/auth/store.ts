import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BusinessDto, PermissionMap, StoreDto, UserDto } from "@pos/shared";

interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  stores: StoreDto[];
  currentStoreId: string | null;
  /** Persisted so the offline POS knows the currency and receipt details.
   * Null for sessions persisted before settings existed, until refreshed. */
  business: BusinessDto | null;
  /** The user's own permissions, cached so the till can decide offline
   * whether to offer actions like Open drawer. Null until first fetched. */
  permissions: PermissionMap | null;
  setSession: (accessToken: string, user: UserDto, stores: StoreDto[], business: BusinessDto) => void;
  setAccessToken: (accessToken: string) => void;
  setCurrentStoreId: (storeId: string) => void;
  setBusiness: (business: BusinessDto) => void;
  setPermissions: (permissions: PermissionMap) => void;
  updateStore: (store: StoreDto) => void;
  markEmailVerified: () => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      stores: [],
      currentStoreId: null,
      business: null,
      permissions: null,
      setSession: (accessToken, user, stores, business) => {
        const preferredStoreId = get().currentStoreId;
        const currentStoreId =
          preferredStoreId && stores.some((s) => s.id === preferredStoreId)
            ? preferredStoreId
            : (stores[0]?.id ?? null);
        // A different user may be signing in on this till: forget the last one's rights.
        const permissions = get().user?.id === user.id ? get().permissions : null;
        set({ accessToken, user, stores, currentStoreId, business, permissions });
      },
      setAccessToken: (accessToken) => set({ accessToken }),
      setCurrentStoreId: (storeId) => set({ currentStoreId: storeId }),
      setBusiness: (business) => set({ business }),
      setPermissions: (permissions) => set({ permissions }),
      updateStore: (store) => set({ stores: get().stores.map((s) => (s.id === store.id ? store : s)) }),
      markEmailVerified: () => {
        const user = get().user;
        if (user) set({ user: { ...user, emailVerified: true } });
      },
      clearSession: () =>
        set({ accessToken: null, user: null, stores: [], currentStoreId: null, business: null, permissions: null }),
    }),
    {
      name: "pos-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        stores: state.stores,
        currentStoreId: state.currentStoreId,
        business: state.business,
        permissions: state.permissions,
      }),
    },
  ),
);

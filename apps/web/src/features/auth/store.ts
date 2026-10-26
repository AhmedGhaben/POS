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
  /**
   * Signed in on a till with a PIN while the server was unreachable: no
   * token yet. The till gets a session for the same person once the server
   * is back (features/till/session.ts).
   */
  offline: boolean;
  /**
   * The business and stores, kept on a till after signing out, so someone
   * can sign in with a PIN while offline and still have prices and receipts.
   */
  tillCache: { business: BusinessDto; stores: StoreDto[] } | null;
  setSession: (accessToken: string, user: UserDto, stores: StoreDto[], business: BusinessDto) => void;
  setOfflineSession: (user: UserDto, stores: StoreDto[], business: BusinessDto, permissions: PermissionMap, storeId: string | null) => void;
  setAccessToken: (accessToken: string) => void;
  setCurrentStoreId: (storeId: string) => void;
  setBusiness: (business: BusinessDto) => void;
  setPermissions: (permissions: PermissionMap) => void;
  updateStore: (store: StoreDto) => void;
  /** A store just created: it can be picked, staffed and given tills right away. */
  addStore: (store: StoreDto) => void;
  markEmailVerified: () => void;
  setUserLanguage: (language: string) => void;
  setUserDisplaySize: (displaySize: number | null) => void;
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
      offline: false,
      tillCache: null,
      setSession: (accessToken, user, stores, business) => {
        const preferredStoreId = get().currentStoreId;
        const currentStoreId =
          preferredStoreId && stores.some((s) => s.id === preferredStoreId)
            ? preferredStoreId
            : (stores[0]?.id ?? null);
        // A different user may be signing in on this till: forget the last one's rights.
        const permissions = get().user?.id === user.id ? get().permissions : null;
        set({ accessToken, user, stores, currentStoreId, business, permissions, offline: false, tillCache: { business, stores } });
      },
      setOfflineSession: (user, stores, business, permissions, storeId) => {
        const currentStoreId = storeId && stores.some((s) => s.id === storeId) ? storeId : (stores[0]?.id ?? null);
        set({ accessToken: null, user, stores, currentStoreId, business, permissions, offline: true });
      },
      setAccessToken: (accessToken) => set({ accessToken }),
      setCurrentStoreId: (storeId) => set({ currentStoreId: storeId }),
      setBusiness: (business) => set({ business, tillCache: { business, stores: get().stores } }),
      setPermissions: (permissions) => set({ permissions }),
      updateStore: (store) => set({ stores: get().stores.map((s) => (s.id === store.id ? store : s)) }),
      addStore: (store) => set({ stores: [...get().stores.filter((s) => s.id !== store.id), store] }),
      markEmailVerified: () => {
        const user = get().user;
        if (user) set({ user: { ...user, emailVerified: true } });
      },
      setUserLanguage: (language) => {
        const user = get().user;
        if (user) set({ user: { ...user, language } });
      },
      setUserDisplaySize: (displaySize) => {
        const user = get().user;
        if (user) set({ user: { ...user, displaySize } });
      },
      // tillCache stays: the next person on this till may sign in offline.
      clearSession: () =>
        set({ accessToken: null, user: null, stores: [], currentStoreId: null, business: null, permissions: null, offline: false }),
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
        offline: state.offline,
        tillCache: state.tillCache,
      }),
    },
  ),
);

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BusinessDto, StoreDto, UserDto } from "@pos/shared";

interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  stores: StoreDto[];
  currentStoreId: string | null;
  /** Persisted so the offline POS knows the currency and receipt details.
   * Null for sessions persisted before settings existed, until refreshed. */
  business: BusinessDto | null;
  setSession: (accessToken: string, user: UserDto, stores: StoreDto[], business: BusinessDto) => void;
  setAccessToken: (accessToken: string) => void;
  setCurrentStoreId: (storeId: string) => void;
  setBusiness: (business: BusinessDto) => void;
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
      setSession: (accessToken, user, stores, business) => {
        const preferredStoreId = get().currentStoreId;
        const currentStoreId =
          preferredStoreId && stores.some((s) => s.id === preferredStoreId)
            ? preferredStoreId
            : (stores[0]?.id ?? null);
        set({ accessToken, user, stores, currentStoreId, business });
      },
      setAccessToken: (accessToken) => set({ accessToken }),
      setCurrentStoreId: (storeId) => set({ currentStoreId: storeId }),
      setBusiness: (business) => set({ business }),
      updateStore: (store) => set({ stores: get().stores.map((s) => (s.id === store.id ? store : s)) }),
      markEmailVerified: () => {
        const user = get().user;
        if (user) set({ user: { ...user, emailVerified: true } });
      },
      clearSession: () =>
        set({ accessToken: null, user: null, stores: [], currentStoreId: null, business: null }),
    }),
    {
      name: "pos-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        stores: state.stores,
        currentStoreId: state.currentStoreId,
        business: state.business,
      }),
    },
  ),
);

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoreDto, UserDto } from "@pos/shared";

interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  stores: StoreDto[];
  currentStoreId: string | null;
  setSession: (accessToken: string, user: UserDto, stores: StoreDto[]) => void;
  setAccessToken: (accessToken: string) => void;
  setCurrentStoreId: (storeId: string) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      stores: [],
      currentStoreId: null,
      setSession: (accessToken, user, stores) => {
        const preferredStoreId = get().currentStoreId;
        const currentStoreId =
          preferredStoreId && stores.some((s) => s.id === preferredStoreId)
            ? preferredStoreId
            : (stores[0]?.id ?? null);
        set({ accessToken, user, stores, currentStoreId });
      },
      setAccessToken: (accessToken) => set({ accessToken }),
      setCurrentStoreId: (storeId) => set({ currentStoreId: storeId }),
      clearSession: () => set({ accessToken: null, user: null, stores: [], currentStoreId: null }),
    }),
    {
      name: "pos-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        stores: state.stores,
        currentStoreId: state.currentStoreId,
      }),
    },
  ),
);

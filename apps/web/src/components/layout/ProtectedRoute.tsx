import * as React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store";
import { BUSINESS_QUERY_KEY, fetchBusiness } from "@/features/business/api";
import { useDeviceStore } from "@/features/desktop/bridge";
import { fetchMyPermissions, myPermissionsQueryKey } from "@/features/users/api";
import { startSyncEngine } from "@/features/pos/sync";
import { startCustomerDisplayChannel, useIdleMessageBroadcast } from "@/features/desktop/customer-display";
import { CommandPalette } from "./CommandPalette";
import { LockOverlay } from "@/features/till/components/LockOverlay";
import { ManagerApprovalDialog } from "@/features/overrides/components/ManagerApprovalDialog";
import { useTillUpkeep } from "@/features/till/use-till";

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  // Signed in with a PIN while offline: no token until the server is back.
  const offline = useAuthStore((s) => s.offline);
  const setBusiness = useAuthStore((s) => s.setBusiness);
  // Refresh the cached settings on load, so a change made on another device
  // (or a session persisted before settings existed) catches up. Offline,
  // this fails quietly and the persisted copy is used.
  const businessQuery = useQuery({
    queryKey: BUSINESS_QUERY_KEY,
    queryFn: fetchBusiness,
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });
  React.useEffect(() => {
    if (businessQuery.data) setBusiness(businessQuery.data);
  }, [businessQuery.data, setBusiness]);

  // Same for the user's own permissions (kept for offline use). Keyed by
  // person, and only copied into the store if it's still that person.
  const userId = useAuthStore((s) => s.user?.id);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const permissionsQuery = useQuery({
    queryKey: myPermissionsQueryKey(userId),
    queryFn: fetchMyPermissions,
    enabled: !!accessToken && !!userId,
    staleTime: 5 * 60_000,
  });
  React.useEffect(() => {
    if (permissionsQuery.data && useAuthStore.getState().user?.id === userId) setPermissions(permissionsQuery.data);
  }, [permissionsQuery.data, userId, setPermissions]);

  // Customer screens can ask what to show from any page.
  React.useEffect(() => startCustomerDisplayChannel(), []);
  useIdleMessageBroadcast();

  useTillUpkeep();

  // Background sync of offline sales and the saved catalog, on every page.
  const signedIn = !!accessToken || offline;
  React.useEffect(() => {
    if (!signedIn) return;
    void useDeviceStore.getState().load();
    return startSyncEngine();
  }, [signedIn]);

  if (!signedIn) {
    return <Navigate to="/login" replace />;
  }
  return (
    <>
      <CommandPalette />
      <Outlet />
      <ManagerApprovalDialog />
      <LockOverlay />
    </>
  );
}

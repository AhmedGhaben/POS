import * as React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store";
import { BUSINESS_QUERY_KEY, fetchBusiness } from "@/features/business/api";
import { useDeviceStore } from "@/features/desktop/bridge";
import { fetchMyPermissions, MY_PERMISSIONS_QUERY_KEY } from "@/features/users/api";
import { startSyncEngine } from "@/features/pos/sync";
import { CommandPalette } from "./CommandPalette";

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
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

  // Same for the user's own permissions (kept for offline use).
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const permissionsQuery = useQuery({
    queryKey: MY_PERMISSIONS_QUERY_KEY,
    queryFn: fetchMyPermissions,
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });
  React.useEffect(() => {
    if (permissionsQuery.data) setPermissions(permissionsQuery.data);
  }, [permissionsQuery.data, setPermissions]);

  // Background sync of offline sales and the saved catalog, on every page.
  const signedIn = !!accessToken;
  React.useEffect(() => {
    if (!signedIn) return;
    void useDeviceStore.getState().load();
    return startSyncEngine();
  }, [signedIn]);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return (
    <>
      <CommandPalette />
      <Outlet />
    </>
  );
}

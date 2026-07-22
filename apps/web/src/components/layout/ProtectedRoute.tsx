import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/features/auth/store";
import { CommandPalette } from "./CommandPalette";

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
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

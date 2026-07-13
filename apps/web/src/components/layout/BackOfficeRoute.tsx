import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/features/auth/store";

/** Cashiers have no back-office access — always sent to the POS terminal. */
export function BackOfficeRoute() {
  const role = useAuthStore((s) => s.user?.role);
  if (role === "CASHIER") {
    return <Navigate to="/pos" replace />;
  }
  return <Outlet />;
}

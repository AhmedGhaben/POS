import { Navigate, Route, Routes } from "react-router-dom";
import { BackOfficeShell } from "@/components/layout/BackOfficeShell";
import { BackOfficeRoute } from "@/components/layout/BackOfficeRoute";
import { PosShell } from "@/components/layout/PosShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { useAuthStore } from "@/features/auth/store";
import { LoginPage } from "@/routes/login";
import { PosPage } from "@/routes/pos";
import { ProductsPage } from "@/routes/products";
import { InventoryPage } from "@/routes/inventory";
import { DashboardPage } from "@/routes/dashboard";
import { SuppliersPage } from "@/routes/suppliers";
import { EmployeesPage } from "@/routes/employees";
import { PurchasesPage } from "@/routes/purchases";
import { ExpensesPage } from "@/routes/expenses";
import { ReturnsPage } from "@/routes/returns";

/** Owner/Manager default to the back office; Cashier defaults straight to POS. */
function DefaultLanding() {
  const role = useAuthStore((s) => s.user?.role);
  return <Navigate to={role === "CASHIER" ? "/pos" : "/dashboard"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<PosShell />}>
          <Route path="/pos" element={<PosPage />} />
        </Route>
        <Route element={<BackOfficeRoute />}>
          <Route element={<BackOfficeShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/purchases" element={<PurchasesPage />} />
            <Route path="/returns" element={<ReturnsPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
          </Route>
        </Route>
        <Route path="/" element={<DefaultLanding />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

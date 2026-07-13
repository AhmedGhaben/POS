import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LoginPage } from "@/routes/login";
import { PosPage } from "@/routes/pos";
import { ProductsPage } from "@/routes/products";
import { InventoryPage } from "@/routes/inventory";
import { DashboardPage } from "@/routes/dashboard";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/pos" element={<PosPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/" element={<Navigate to="/pos" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/pos" replace />} />
    </Routes>
  );
}

import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { PwaUpdatePrompt } from "@/components/layout/PwaUpdatePrompt";
import { BackOfficeShell } from "@/components/layout/BackOfficeShell";
import { BackOfficeRoute } from "@/components/layout/BackOfficeRoute";
import { PosShell } from "@/components/layout/PosShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { useAuthStore } from "@/features/auth/store";
import { LoginPage } from "@/routes/login";
import { SignupPage } from "@/routes/signup";
import { ForgotPasswordPage } from "@/routes/forgot-password";
import { ResetPasswordPage } from "@/routes/reset-password";
import { VerifyEmailPage } from "@/routes/verify-email";
import { WelcomePage } from "@/routes/welcome";
import { PosPage } from "@/routes/pos";
import { ProductsPage } from "@/routes/products";
import { InventoryPage } from "@/routes/inventory";
import { DashboardPage } from "@/routes/dashboard";
import { SuppliersPage } from "@/routes/suppliers";
import { EmployeesPage } from "@/routes/employees";
import { PurchasesPage } from "@/routes/purchases";
import { ExpensesPage } from "@/routes/expenses";
import { ReturnsPage } from "@/routes/returns";
import { TransfersPage } from "@/routes/transfers";
import { SettingsPage } from "@/routes/settings";
import { InvoicesPage } from "@/routes/invoices";
import { DevicePage } from "@/routes/device";
import { DrawerEventsPage } from "@/routes/drawer-events";
import { CustomerDisplayPage } from "@/routes/customer-display";

/** Owner/Manager default to the back office; Cashier defaults straight to POS. */
function DefaultLanding() {
  const role = useAuthStore((s) => s.user?.role);
  return <Navigate to={role === "CASHIER" ? "/pos" : "/dashboard"} replace />;
}

export function App() {
  return (
    <>
      <Toaster position="top-right" />
      <PwaUpdatePrompt />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        {/* The customer-facing screen: no sign-in of its own, it only shows
            what the POS on this computer broadcasts. */}
        <Route path="/customer-display" element={<CustomerDisplayPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route element={<PosShell />}>
            <Route path="/pos" element={<PosPage />} />
            <Route path="/device" element={<DevicePage />} />
          </Route>
          <Route element={<BackOfficeRoute />}>
            <Route element={<BackOfficeShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/transfers" element={<TransfersPage />} />
              <Route path="/purchases" element={<PurchasesPage />} />
              <Route path="/returns" element={<ReturnsPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/drawer-events" element={<DrawerEventsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="/" element={<DefaultLanding />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

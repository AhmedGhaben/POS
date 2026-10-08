import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BackOfficeTopBar } from "./BackOfficeTopBar";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

/** Owner/Manager landing experience: sidebar nav + Dashboard as home. */
export function BackOfficeShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <BackOfficeTopBar />
        <VerifyEmailBanner />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

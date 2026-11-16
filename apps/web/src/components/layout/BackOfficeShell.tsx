import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BackOfficeTopBar } from "./BackOfficeTopBar";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

/** Owner/Manager landing experience: sidebar nav + Dashboard as home. */
export function BackOfficeShell() {
  return (
    <div className="storbit-ui storbit-shell flex min-h-screen bg-background text-foreground">
      <Sidebar />
      {/* min-w-0: a wide table scrolls inside the page instead of pushing it past the screen (tester #33). */}
      <div className="flex min-w-0 flex-1 flex-col">
        <BackOfficeTopBar />
        <VerifyEmailBanner />
        <main className="min-w-0 flex-1 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

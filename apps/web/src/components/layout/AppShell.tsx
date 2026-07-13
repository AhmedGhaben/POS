import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

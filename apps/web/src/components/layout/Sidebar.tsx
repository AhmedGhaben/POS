import { NavLink } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store";
import { navItemsFor } from "./nav-items";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const role = useAuthStore((s) => s.user?.role);
  return (
    <>
      <div className="mb-4 px-2 text-lg font-semibold">POS</div>
      <nav className="flex-1 space-y-1">
        {navItemsFor(role).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <NavLink
        to="/pos"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <ShoppingCart className="h-4 w-4" />
        Point of Sale
      </NavLink>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r p-3 lg:flex">
      <SidebarNav />
    </aside>
  );
}

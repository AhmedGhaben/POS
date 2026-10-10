import { NavLink } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store";
import { navItemsFor } from "./nav-items";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  return (
    <>
      <div className="mb-4 px-2 text-lg font-semibold">POS</div>
      <nav className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2">
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
            {t(`nav.${item.label}`)}
          </NavLink>
        ))}
      </nav>
      <NavLink
        to="/pos"
        onClick={onNavigate}
        className="mt-2 flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <ShoppingCart className="h-4 w-4" />
        {t("nav.pointOfSale")}
      </NavLink>
    </>
  );
}

/** Stays put while the page scrolls, so Point of Sale is always in the bottom-left corner. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r p-3 lg:flex">
      <SidebarNav />
    </aside>
  );
}

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Truck,
  Users,
  ShoppingBag,
  Receipt,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/purchases", label: "Purchases", icon: ShoppingBag },
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/employees", label: "Employees", icon: Users },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r p-3">
      <div className="mb-4 px-2 text-lg font-semibold">POS</div>
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
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
        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <ShoppingCart className="h-4 w-4" />
        Point of Sale
      </NavLink>
    </aside>
  );
}

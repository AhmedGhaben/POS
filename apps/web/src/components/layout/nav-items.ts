import {
  LayoutDashboard,
  Package,
  Boxes,
  Truck,
  Users,
  ShoppingBag,
  Receipt,
  Undo2,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/purchases", label: "Purchases", icon: ShoppingBag },
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/employees", label: "Employees", icon: Users },
];

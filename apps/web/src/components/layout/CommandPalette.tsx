import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuthStore } from "@/features/auth/store";
import { navItemsFor } from "./nav-items";

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function go(to: string) {
    navigate(to);
    setOpen(false);
  }

  const navItems = navItemsFor(role);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {navItems.map((item) => (
            <CommandItem key={item.to} value={item.label} onSelect={() => go(item.to)}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
          <CommandItem value="Point of Sale" onSelect={() => go("/pos")}>
            <ShoppingCart className="h-4 w-4" />
            Point of Sale
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

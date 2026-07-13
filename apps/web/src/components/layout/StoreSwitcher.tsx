import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/store";

export function StoreSwitcher() {
  const stores = useAuthStore((s) => s.stores);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const setCurrentStoreId = useAuthStore((s) => s.setCurrentStoreId);

  // Fewer clicks for single-store staff: hide the switcher entirely.
  if (stores.length <= 1) {
    return null;
  }

  return (
    <Select value={currentStoreId ?? undefined} onValueChange={setCurrentStoreId}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select store" />
      </SelectTrigger>
      <SelectContent>
        {stores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

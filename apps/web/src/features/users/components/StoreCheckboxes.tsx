import type { StoreDto } from "@pos/shared";

interface StoreCheckboxesProps {
  stores: StoreDto[];
  value: string[];
  onChange: (storeIds: string[]) => void;
  disabled?: boolean;
}

/** Which stores a staff login can use. Order of `value` follows `stores`. */
export function StoreCheckboxes({ stores, value, onChange, disabled }: StoreCheckboxesProps) {
  function toggle(storeId: string, checked: boolean) {
    const next = new Set(value);
    if (checked) next.add(storeId);
    else next.delete(storeId);
    onChange(stores.filter((s) => next.has(s.id)).map((s) => s.id));
  }

  return (
    <div className="space-y-1.5 rounded-md border p-3">
      {stores.map((store) => (
        <label key={store.id} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={value.includes(store.id)}
            onChange={(e) => toggle(store.id, e.target.checked)}
            disabled={disabled}
          />
          {store.name}
        </label>
      ))}
    </div>
  );
}

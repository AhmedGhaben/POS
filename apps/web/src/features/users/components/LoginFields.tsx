import type { StaffRole } from "@pos/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/store";
import type { LoginFieldsValue } from "@/features/users/login-fields";
import { StoreCheckboxes } from "./StoreCheckboxes";

interface LoginFieldsProps {
  value: LoginFieldsValue;
  onChange: (value: LoginFieldsValue) => void;
  idPrefix: string;
}

/** Email, role, stores and password-or-invite for a new staff login. */
export function LoginFields({ value, onChange, idPrefix }: LoginFieldsProps) {
  const stores = useAuthStore((s) => s.stores);
  const set = <K extends keyof LoginFieldsValue>(key: K, v: LoginFieldsValue[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-email`}>Login email</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            autoComplete="off"
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={value.role} onValueChange={(v) => set("role", v as StaffRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASHIER">Cashier</SelectItem>
              <SelectItem value="MANAGER">Manager</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Stores they can use</Label>
        <StoreCheckboxes stores={stores} value={value.storeIds} onChange={(ids) => set("storeIds", ids)} />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Password</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name={`${idPrefix}-method`}
            className="h-4 w-4 accent-primary"
            checked={value.method === "password"}
            onChange={() => set("method", "password")}
          />
          Set a password now and tell them
        </label>
        {value.method === "password" && (
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            aria-label="Initial password"
            value={value.password}
            onChange={(e) => set("password", e.target.value)}
            className="ml-6 w-[calc(100%-1.5rem)]"
          />
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name={`${idPrefix}-method`}
            className="h-4 w-4 accent-primary"
            checked={value.method === "invite"}
            onChange={() => set("method", "invite")}
          />
          Email them a link to set their own password
        </label>
      </fieldset>
    </div>
  );
}

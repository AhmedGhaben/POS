import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { StoreDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/features/auth/store";
import { updateStore } from "@/features/business/api";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function EditStoreDialog({ store, onClose }: { store: StoreDto | null; onClose: () => void }) {
  const updateCached = useAuthStore((s) => s.updateStore);
  const [form, setForm] = React.useState({ name: "", address: "", phone: "", timezone: "" });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!store) return;
    setForm({ name: store.name, address: store.address ?? "", phone: store.phone ?? "", timezone: store.timezone });
    setError(null);
  }, [store]);

  const mutation = useMutation({
    mutationFn: () => updateStore(store!.id, form),
    onSuccess: (updated) => {
      updateCached(updated);
      toast.success("Store updated");
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Store name is required");
    if (!isValidTimezone(form.timezone)) return setError("Unknown timezone — use a name like Europe/Paris");
    setError(null);
    mutation.mutate();
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={!!store} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit store</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="store-name">Name</Label>
            <Input id="store-name" value={form.name} onChange={set("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-address">Address</Label>
            <Textarea id="store-address" rows={2} value={form.address} onChange={set("address")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="store-phone">Phone</Label>
              <Input id="store-phone" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-tz">Timezone</Label>
              <Input id="store-tz" list="timezones" value={form.timezone} onChange={set("timezone")} />
              <datalist id="timezones">
                {Intl.supportedValuesOf("timeZone").map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Address and phone are printed on this store's receipts.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save store"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Uses the stores cached in the session; a store created elsewhere shows after signing in again. */
export function StoresSettings() {
  const stores = useAuthStore((s) => s.stores);
  const [editing, setEditing] = React.useState<StoreDto | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((store) => (
              <TableRow key={store.id}>
                <TableCell className="font-medium">{store.name}</TableCell>
                <TableCell className="max-w-[16rem] truncate text-muted-foreground">{store.address ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{store.timezone}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => setEditing(store)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <EditStoreDialog store={editing} onClose={() => setEditing(null)} />
    </>
  );
}

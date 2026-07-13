import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createSupplier, fetchSuppliers } from "@/features/suppliers/api";

export function SuppliersPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });

  const [form, setForm] = React.useState({
    name: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createSupplier({
        name: form.name,
        contactName: form.contactName || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      setForm({ name: "", contactName: "", phone: "", email: "", address: "" });
    },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Vendors you purchase inventory from.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New supplier</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactName">Contact name</Label>
                <Input id="contactName" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              {createMutation.isError && (
                <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save supplier"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Contact</th>
                <th className="p-3 font-medium">Phone</th>
                <th className="p-3 font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {suppliersQuery.data?.map((supplier) => (
                <tr key={supplier.id} className="border-b last:border-0">
                  <td className="p-3">{supplier.name}</td>
                  <td className="p-3 text-muted-foreground">{supplier.contactName ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{supplier.phone ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{supplier.email ?? "—"}</td>
                </tr>
              ))}
              {suppliersQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No suppliers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

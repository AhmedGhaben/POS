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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createEmployee, fetchEmployees } from "@/features/employees/api";
import { useAuthStore } from "@/features/auth/store";

export function EmployeesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const stores = useAuthStore((s) => s.stores);
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });

  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    position: "",
    phone: "",
    email: "",
    wage: "",
    storeId: "",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createEmployee({
        firstName: form.firstName,
        lastName: form.lastName,
        position: form.position || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        wage: form.wage ? Number(form.wage) : undefined,
        storeId: form.storeId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setDialogOpen(false);
      setForm({ firstName: "", lastName: "", position: "", phone: "", email: "", wage: "", storeId: "" });
    },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">HR profiles — separate from login accounts.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New employee</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="position">Position</Label>
                <Input id="position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wage">Hourly wage</Label>
                  <Input id="wage" type="number" step="0.01" value={form.wage} onChange={(e) => setForm({ ...form, wage: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned store</Label>
                <Select value={form.storeId} onValueChange={(v) => setForm({ ...form, storeId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="All stores" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {createMutation.isError && (
                <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save employee"}
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
                <th className="p-3 font-medium">Position</th>
                <th className="p-3 font-medium">Store</th>
                <th className="p-3 font-medium">Login account</th>
              </tr>
            </thead>
            <tbody>
              {employeesQuery.data?.map((employee) => (
                <tr key={employee.id} className="border-b last:border-0">
                  <td className="p-3">
                    {employee.firstName} {employee.lastName}
                  </td>
                  <td className="p-3 text-muted-foreground">{employee.position ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{employee.store?.name ?? "All stores"}</td>
                  <td className="p-3 text-muted-foreground">{employee.user?.email ?? "None"}</td>
                </tr>
              ))}
              {employeesQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No employees yet.
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

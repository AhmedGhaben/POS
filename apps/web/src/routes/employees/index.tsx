import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createEmployee, fetchEmployees } from "@/features/employees/api";
import { PermissionsDialog } from "@/features/users/components/PermissionsDialog";
import { useAuthStore } from "@/features/auth/store";

const employeeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  position: z.string().optional(),
  phone: z.string().optional(),
  wage: z.string().optional(),
  email: z.string().optional(),
  storeId: z.string().optional(),
});

const defaultValues = {
  firstName: "",
  lastName: "",
  position: "",
  phone: "",
  email: "",
  wage: "",
  storeId: "",
};

export function EmployeesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [permissionsUser, setPermissionsUser] = React.useState<{ id: string; email: string } | null>(
    null,
  );
  const queryClient = useQueryClient();
  const stores = useAuthStore((s) => s.stores);
  const isOwner = useAuthStore((s) => s.user?.role) === "OWNER";
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });

  const form = useForm<z.input<typeof employeeSchema>, unknown, z.output<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: z.output<typeof employeeSchema>) =>
      createEmployee({
        firstName: values.firstName,
        lastName: values.lastName,
        position: values.position || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        wage: values.wage ? Number(values.wage) : undefined,
        storeId: values.storeId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setDialogOpen(false);
      form.reset(defaultValues);
      toast.success("Employee created");
    },
    onError: (error) => {
      toast.error((error as Error).message);
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
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
              >
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Position</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="wage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hourly wage</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="storeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assigned store</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="All stores" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {stores.map((store) => (
                            <SelectItem key={store.id} value={store.id}>
                              {store.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Saving..." : "Save employee"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Login account</TableHead>
                {isOwner && <TableHead>Permissions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeesQuery.data?.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    {employee.firstName} {employee.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{employee.position ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{employee.store?.name ?? "All stores"}</TableCell>
                  <TableCell className="text-muted-foreground">{employee.user?.email ?? "None"}</TableCell>
                  {isOwner && (
                    <TableCell>
                      {employee.user && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPermissionsUser({ id: employee.user!.id, email: employee.user!.email })
                          }
                        >
                          Manage
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {employeesQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isOwner ? 5 : 4} className="p-6 text-center text-muted-foreground">
                    No employees yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isOwner && (
        <PermissionsDialog
          userId={permissionsUser?.id ?? null}
          userEmail={permissionsUser?.email ?? ""}
          onClose={() => setPermissionsUser(null)}
        />
      )}
    </div>
  );
}

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CustomerDto } from "@pos/shared";
import { IdCard, User, UserPlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomer, searchCustomers } from "@/features/pos/api";
import { CustomerCardDialog } from "./CustomerCardDialog";

interface CustomerSearchComboboxProps {
  selected: CustomerDto | null;
  onSelect: (customer: CustomerDto | null) => void;
}

/** Defaults to "Walk-in customer" — attaching a customer is opt-in, never required. */
export function CustomerSearchCombobox({ selected, onSelect }: CustomerSearchComboboxProps) {
  const { t } = useTranslation("pos");
  const [query, setQuery] = React.useState("");
  const [newName, setNewName] = React.useState<string | null>(null);
  const [newPhone, setNewPhone] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [cardFor, setCardFor] = React.useState<CustomerDto | null>(null);

  const searchResults = useQuery({
    queryKey: ["pos-customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 0,
  });
  const results = query.trim() ? (searchResults.data ?? []) : [];

  const createMutation = useMutation({
    mutationFn: () =>
      createCustomer({
        name: (newName ?? "").trim(),
        phone: newPhone.trim() || undefined,
        email: newEmail.trim() || undefined,
      }),
    onSuccess: (customer) => {
      onSelect(customer);
      closeCreate();
    },
  });

  function closeCreate() {
    setNewName(null);
    setNewPhone("");
    setNewEmail("");
  }

  return (
    <div className="flex items-center gap-1">
      <Combobox
        className="flex-1"
        icon={<User className="h-4 w-4 text-muted-foreground" />}
        value={selected?.id ?? null}
        valueLabel={selected?.name}
        placeholder={t("customer.walkIn")}
        searchPlaceholder={t("customer.search")}
        emptyText={query.trim() ? t("customer.noMatch") : t("customer.typeToSearch")}
        onSearchChange={setQuery}
        loading={searchResults.isFetching}
        options={results.map((c) => ({ value: c.id, label: c.name, description: c.phone ?? c.taxId ?? undefined }))}
        onChange={(id) => onSelect(results.find((c) => c.id === id) ?? null)}
        footer={(typed, close) =>
          typed && !searchResults.isFetching ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-primary hover:bg-accent"
              onClick={() => {
                setNewName(typed);
                close();
              }}
            >
              <UserPlus className="h-4 w-4" />
              {t("customer.addNew", { name: typed })}
            </button>
          ) : null
        }
      />
      {selected && (
        <>
          <Button variant="ghost" size="icon" aria-label={t("card.open")} title={t("card.open")} onClick={() => setCardFor(selected)}>
            <IdCard className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("customer.clear")} onClick={() => onSelect(null)}>
            <X className="h-4 w-4" />
          </Button>
        </>
      )}
      <CustomerCardDialog customer={cardFor} onClose={() => setCardFor(null)} />

      <Dialog open={newName !== null} onOpenChange={(open) => !open && closeCreate()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("customer.newTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if ((newName ?? "").trim()) createMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-customer-name">{t("customer.name")}</Label>
              <Input id="new-customer-name" value={newName ?? ""} onChange={(e) => setNewName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-customer-phone">{t("customer.phone")}</Label>
              <Input id="new-customer-phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-customer-email">{t("customer.email")}</Label>
              <Input id="new-customer-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div className="pt-1">
              <Button type="submit" className="w-full" disabled={createMutation.isPending || !(newName ?? "").trim()}>
                {createMutation.isPending ? t("customer.creating") : t("customer.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

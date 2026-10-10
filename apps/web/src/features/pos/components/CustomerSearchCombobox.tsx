import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CustomerDto } from "@pos/shared";
import { User, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { createCustomer, searchCustomers } from "@/features/pos/api";

interface CustomerSearchComboboxProps {
  selected: CustomerDto | null;
  onSelect: (customer: CustomerDto | null) => void;
}

/** Defaults to "Walk-in customer" — attaching a customer is opt-in, never required. */
export function CustomerSearchCombobox({ selected, onSelect }: CustomerSearchComboboxProps) {
  const { t } = useTranslation("pos");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [newPhone, setNewPhone] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");

  const searchResults = useQuery({
    queryKey: ["pos-customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 0,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCustomer({
        name: query.trim(),
        phone: newPhone.trim() || undefined,
        email: newEmail.trim() || undefined,
      }),
    onSuccess: (customer) => {
      onSelect(customer);
      resetAndClose();
    },
  });

  function resetAndClose() {
    setOpen(false);
    setQuery("");
    setCreating(false);
    setNewPhone("");
    setNewEmail("");
  }

  function handleSelect(customer: CustomerDto) {
    onSelect(customer);
    resetAndClose();
  }

  const results = searchResults.data ?? [];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreating(false);
      }}
    >
      <div className="flex items-center gap-1">
        <PopoverTrigger asChild>
          <Button variant="outline" className="flex-1 justify-start gap-2 font-normal">
            <User className="h-4 w-4 text-muted-foreground" />
            {selected ? selected.name : t("customer.walkIn")}
          </Button>
        </PopoverTrigger>
        {selected && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("customer.clear")}
            onClick={() => onSelect(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("customer.search")} value={query} onValueChange={setQuery} />
          <CommandList>
            {!creating && query.trim().length > 0 && (
              <>
                {results.length === 0 && !searchResults.isFetching && (
                  <CommandEmpty className="px-3 py-4 text-left">
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => setCreating(true)}
                    >
                      {t("customer.addNew", { name: query.trim() })}
                    </button>
                  </CommandEmpty>
                )}
                <CommandGroup>
                  {results.map((customer) => (
                    <CommandItem
                      key={customer.id}
                      value={customer.id}
                      onSelect={() => handleSelect(customer)}
                    >
                      <div className="flex flex-col">
                        <span>{customer.name}</span>
                        {customer.phone && (
                          <span className="text-xs text-muted-foreground">{customer.phone}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {creating && (
              <div className="space-y-2 p-3">
                <div className="space-y-1">
                  <Label htmlFor="new-customer-name">{t("customer.name")}</Label>
                  <Input id="new-customer-name" value={query.trim()} disabled />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-customer-phone">{t("customer.phone")}</Label>
                  <Input
                    id="new-customer-phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-customer-email">{t("customer.email")}</Label>
                  <Input
                    id="new-customer-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? t("customer.creating") : t("customer.create")}
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

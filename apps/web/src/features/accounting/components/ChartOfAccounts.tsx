import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api-client";
import { ACCOUNTING_KEY, ACCOUNTS_KEY, createAccount, fetchAccounts, PGC_CLASSES, removeAccount, syncAccounts, updateAccount, type LedgerAccountDto } from "../api";

const depth = (code: string) => code.split(".").length - 1;

/** The chart of accounts: PGC template, the accountant's accounts, the app's own sub-accounts. */
export function ChartOfAccounts({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation("accounting");
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: fetchAccounts });
  const [search, setSearch] = React.useState("");
  const [showLinked, setShowLinked] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<LedgerAccountDto | null>(null);
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEY });
  const sync = useMutation({ mutationFn: syncAccounts, onSuccess: (r) => (refresh(), toast.success(t("chart.synced", { count: r.created }))), onError: fail });

  const query = search.trim().toLowerCase();
  const rows = (accounts.data ?? []).filter((a) => {
    if (query) return a.code.startsWith(query) || a.name.toLowerCase().includes(query);
    return showLinked || !(a.linkType === "CUSTOMER" || a.linkType === "SUPPLIER");
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("chart.templateNote")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input className="pl-8" placeholder={t("chart.search")} aria-label={t("chart.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={showLinked} onChange={(e) => setShowLinked(e.target.checked)} />
          {t("chart.showLinked")}
        </label>
        {canWrite && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              {t("chart.sync")}
            </Button>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              {t("chart.add")}
            </Button>
          </div>
        )}
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">{t("chart.code")}</TableHead>
                <TableHead>{t("chart.name")}</TableHead>
                <TableHead>{t("chart.category")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a, i) => (
                <React.Fragment key={a.id}>
                  {!query && (i === 0 || rows[i - 1].classNo !== a.classNo) && (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={4} className="font-semibold">
                        {t("chart.class", { number: a.classNo, name: PGC_CLASSES[a.classNo] ?? "" })}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className={a.isActive ? "" : "text-muted-foreground"}>
                    <TableCell className="font-mono text-sm" style={{ paddingLeft: `${0.75 + depth(a.code) * 0.9}rem` }}>
                      {a.code}
                    </TableCell>
                    <TableCell className={a.category === "GM" ? "" : "font-medium"}>
                      {a.name}
                      {a.linkType && <span className="ml-2 text-xs text-muted-foreground">({t(`chart.linked.${a.linkType}`)})</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.category === "GM" ? "outline" : "secondary"}>{t(`chart.categories.${a.category}`)}</Badge>
                      {!a.isActive && <Badge variant="outline" className="ml-1">{t("chart.inactive")}</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                          {t("chart.edit")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
              {accounts.data && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="p-6 text-center text-muted-foreground">
                    {t("chart.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AddAccountDialog open={adding} onClose={() => setAdding(false)} onDone={refresh} />
      <EditAccountDialog account={editing} onClose={() => setEditing(null)} onDone={refresh} />
    </div>
  );
}

function AddAccountDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation("accounting");
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setCode("");
      setName("");
    }
  }, [open]);
  const create = useMutation({
    mutationFn: () => createAccount({ code: code.trim(), name: name.trim() }),
    onSuccess: () => (onDone(), onClose(), toast.success(t("saved"))),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("chart.addTitle")}</DialogTitle>
          <DialogDescription>{t("chart.addHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="new-account-code">{t("chart.code")}</Label>
            <Input id="new-account-code" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-account-name">{t("chart.name")}</Label>
            <Input id="new-account-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={!code.trim() || !name.trim() || create.isPending}>
            {t("chart.add")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditAccountDialog({ account, onClose, onDone }: { account: LedgerAccountDto | null; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation("accounting");
  const [name, setName] = React.useState("");
  const [active, setActive] = React.useState(true);
  React.useEffect(() => {
    if (account) {
      setName(account.name);
      setActive(account.isActive);
    }
  }, [account]);
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const save = useMutation({ mutationFn: () => updateAccount(account!.id, { name: name.trim(), isActive: active }), onSuccess: () => (onDone(), onClose(), toast.success(t("saved"))), onError: fail });
  const remove = useMutation({ mutationFn: () => removeAccount(account!.id), onSuccess: () => (onDone(), onClose(), toast.success(t("chart.removed"))), onError: fail });
  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("chart.editTitle", { code: account?.code ?? "" })}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="edit-account-name">{t("chart.name")}</Label>
            <Input id="edit-account-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t("chart.active")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              {t("save")}
            </Button>
            {account && !account.hasMovements && !account.linkType && (
              <Button type="button" variant="outline" className="text-destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
                {t("chart.remove")}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

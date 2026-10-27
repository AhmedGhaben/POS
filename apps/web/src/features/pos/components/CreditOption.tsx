import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Permission, type CustomerCardDto, type CustomerDto } from "@pos/shared";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { useHasPermission } from "@/features/auth/use-permission";
import { useMoney } from "@/features/business/use-money";
import { requestApproval, type Approval } from "@/features/overrides/approval";
import { apiClient } from "@/lib/api-client";
import { creditSplit, type CreditChoice } from "../credit";
import { NumericField } from "@/components/ui/numeric-field";

/**
 * "Put on the customer's account" at the till (docs/plans/ANGOLA.md, phase
 * 4): for a chosen customer (not Consumidor Final), online, where sales are
 * fiscal documents. Shows the credit left; the part paid now (if any) is
 * taken with the payment methods below. Without SELL_ON_CREDIT a manager
 * approves it.
 */
export function CreditOption({
  customer,
  total,
  value,
  onChange,
  onApproval,
  onValidity,
}: {
  customer: CustomerDto | null;
  total: number;
  value: CreditChoice;
  onChange: (v: CreditChoice) => void;
  onApproval: (approval: Approval) => void;
  /** Whether what's on the account fits the customer's credit. */
  onValidity: (valid: boolean) => void;
}) {
  const { t } = useTranslation("pos");
  const money = useMoney();
  const canSellOnCredit = useHasPermission(Permission.SELL_ON_CREDIT);
  const card = useQuery({
    queryKey: ["customer-card", customer?.id],
    queryFn: () => apiClient.get<CustomerCardDto>(`/customers/${customer!.id}/card`),
    enabled: !!customer && value.on,
    // The balance can change at any till: always the latest.
    staleTime: 0,
  });
  const { onAccount } = creditSplit(total, value);
  const available = card.data?.account?.available ?? null;
  const noLimit = card.data && card.data.account?.creditLimit == null;
  const over = available !== null && onAccount > Number(available) + 0.0001;
  const valid = !value.on || (!!card.data && !noLimit && !over && onAccount > 0);
  React.useEffect(() => onValidity(valid), [valid, onValidity]);

  async function toggle(on: boolean) {
    if (on && !canSellOnCredit) {
      const approval = await requestApproval({
        permission: Permission.SELL_ON_CREDIT,
        action: "sale.credit",
        description: t("credit.approval", { name: customer?.name ?? "", amount: money(total) }),
        details: { customerId: customer?.id, total },
      });
      if (!approval) return;
      onApproval(approval);
    }
    onChange({ on, paidNow: "" });
  }

  if (!customer || customer.isFinalConsumer) return null;
  return (
    <div className="space-y-2 rounded-md border p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={value.on} onChange={(e) => void toggle(e.target.checked)} />
        {t("credit.toggle", { name: customer.name })}
      </label>
      {value.on && (
        <>
          {card.isLoading && <p className="text-sm text-muted-foreground">{t("credit.checking")}</p>}
          {noLimit && <p className="text-sm text-destructive">{t("credit.noLimit")}</p>}
          {card.data && !noLimit && (
            <p className={`text-sm ${over ? "text-destructive" : "text-muted-foreground"}`}>
              {t("credit.available", { amount: money(available ?? 0), balance: money(card.data.account?.balance ?? 0) })}
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="credit-paid-now">{t("credit.paidNow")}</Label>
            <NumericField
              id="credit-paid-now"
              keypad="popover"
              placeholder="0"
              value={value.paidNow}
              onValueChange={(paidNow) => onChange({ ...value, paidNow })}
            />
          </div>
          <p className="text-sm font-semibold">{t("credit.onAccount", { amount: money(onAccount) })}</p>
        </>
      )}
    </div>
  );
}

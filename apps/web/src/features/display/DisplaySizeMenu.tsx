import { ALargeSmall, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DISPLAY_SIZES, useDisplaySize } from "./display-size";

/** Top-bar button: this person's display size (back office and till). */
export function DisplaySizeMenu() {
  const { t } = useTranslation();
  const [size, setSize] = useDisplaySize();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("displaySize.label")} title={t("displaySize.label")}>
          <ALargeSmall className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("displaySize.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DISPLAY_SIZES.map((s) => (
          <DropdownMenuItem key={s.value} onClick={() => setSize(s.value)}>
            <Check className={s.value === size ? "h-4 w-4" : "h-4 w-4 opacity-0"} />
            <span style={{ fontSize: `${(s.value / 100) * 0.875}rem` }}>{t(`displaySize.${s.label}`)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="max-w-56 px-2 py-1 text-xs text-muted-foreground">{t("displaySize.hint")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

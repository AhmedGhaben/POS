import * as React from "react";
import { Delete } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX = 6;

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

/** Big touch keys for a 4-6 digit PIN; the keyboard works too. */
export function PinPad({ value, onChange, onSubmit, disabled }: PinPadProps) {
  const { t } = useTranslation("auth");

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (disabled) return;
      if (/^\d$/.test(e.key) && value.length < MAX) onChange(value + e.key);
      else if (e.key === "Backspace") onChange(value.slice(0, -1));
      else if (e.key === "Enter" && value.length >= 4) onSubmit();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onSubmit, disabled]);

  const press = (digit: string) => value.length < MAX && onChange(value + digit);

  return (
    <div className="mx-auto w-full max-w-xs space-y-4">
      <div className="flex justify-center gap-3" aria-label={t("pin.entered", { count: value.length })} role="status">
        {Array.from({ length: Math.max(4, value.length) }, (_, i) => (
          <span key={i} className={cn("h-3.5 w-3.5 rounded-full border-2 border-foreground", i < value.length && "bg-foreground")} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button key={d} type="button" variant="outline" className="h-14 text-xl" disabled={disabled} onClick={() => press(d)}>
            {d}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="h-14"
          disabled={disabled || value.length === 0}
          aria-label={t("pin.erase")}
          onClick={() => onChange(value.slice(0, -1))}
        >
          <Delete className="h-5 w-5" />
        </Button>
        <Button type="button" variant="outline" className="h-14 text-xl" disabled={disabled} onClick={() => press("0")}>
          0
        </Button>
        <Button type="button" className="h-14" disabled={disabled || value.length < 4} onClick={onSubmit}>
          {t("pin.ok")}
        </Button>
      </div>
    </div>
  );
}

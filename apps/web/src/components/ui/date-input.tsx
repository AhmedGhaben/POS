import * as React from "react";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { dateOrder, formatCalendarDate, parseDateInput } from "@/lib/dates";
import { Input } from "./input";

export interface DateInputProps {
  id?: string;
  name?: string;
  /** An ISO calendar date ("2026-10-17"), or "" for none. */
  value: string;
  /** Called with an ISO date once what's typed is a real date, or "" when the field is emptied. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
}

/** "17102026" → "17/10/2026", in the locale's order. */
function withSeparators(digits: string, separator: string, order: string[]): string {
  const sizes = order.map((p) => (p === "year" ? 4 : 2));
  const pieces: string[] = [];
  let at = 0;
  for (const size of sizes) {
    pieces.push(digits.slice(at, at + size));
    at += size;
  }
  return pieces.join(separator);
}

/**
 * A date field in the store's format (DD/MM/YYYY in Angola), typed or
 * picked from the calendar. The browser's own date field shows the
 * computer's format (MM/DD/YYYY on an English Windows), so it's only used
 * for its calendar. The value in and out stays ISO.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { id, name, value, onChange, onBlur, className, disabled, required, "aria-label": ariaLabel },
  ref,
) {
  const { t } = useTranslation("common");
  const { order, separator } = dateOrder();
  const shown = value ? formatCalendarDate(value) : "";
  const [text, setText] = React.useState(shown);
  const picker = React.useRef<HTMLInputElement>(null);
  // A new value from outside (a reset, a preset period): show it.
  React.useEffect(() => {
    setText((current) => (parseDateInput(current) === (value || null) ? current : shown));
  }, [value, shown]);

  const placeholder = order.map((p) => t(`dateInput.${p}`)).join(separator);
  const invalid = text.trim() !== "" && !parseDateInput(text);

  function change(next: string) {
    const digits = next.replace(/\D/g, "");
    const typed = /^\d{8}$/.test(next.trim()) ? withSeparators(digits, separator, order) : next;
    setText(typed);
    if (typed.trim() === "") onChange("");
    else {
      const iso = parseDateInput(typed);
      if (iso) onChange(iso);
    }
  }

  return (
    <div className={cn("relative flex w-full items-center", className)}>
      <Input
        ref={ref}
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn("pr-9", invalid && "border-destructive")}
        onChange={(e) => change(e.target.value)}
        onBlur={() => {
          // Left half-typed: back to the last good date.
          if (invalid) setText(shown);
          else if (text.trim() !== "") setText(formatCalendarDate(parseDateInput(text)!));
          onBlur?.();
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        className="absolute right-1 flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-50"
        aria-label={t("dateInput.pick")}
        title={t("dateInput.pick")}
        onClick={() => {
          try {
            picker.current?.showPicker();
          } catch {
            picker.current?.focus();
          }
        }}
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      {/* Only its calendar is used; what it shows is hidden. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        value={value}
        onChange={(e) => {
          setText(e.target.value ? formatCalendarDate(e.target.value) : "");
          onChange(e.target.value);
        }}
      />
    </div>
  );
});

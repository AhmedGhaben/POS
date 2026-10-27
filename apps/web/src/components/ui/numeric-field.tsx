import * as React from "react";
import { useTranslation } from "react-i18next";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, type InputProps } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { KEYPAD_DIGITS, pressKey, type KeypadKey } from "@/features/touch/keypad";
import { useTouchMode } from "@/features/touch/touch-mode";
import { cn } from "@/lib/utils";

/**
 * The on-screen number pad: 0-9, 00, the decimal comma, backspace, clear
 * and OK. Pressing a key never takes the focus from the field, so the till's
 * scan field (data-keep-focus) and the field's own Enter/blur keep working.
 */
export function NumericKeypad({ onKey, onOk, decimals = 2 }: { onKey: (key: KeypadKey) => void; onOk: () => void; decimals?: number }) {
  const { t } = useTranslation("common");
  const key = (k: KeypadKey, label: React.ReactNode, extra?: { className?: string; ariaLabel?: string }) => (
    <Button
      key={k}
      type="button"
      variant="outline"
      className={cn("h-14 text-xl", extra?.className)}
      aria-label={extra?.ariaLabel}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onKey(k)}
    >
      {label}
    </Button>
  );
  return (
    <div className="grid w-64 grid-cols-4 gap-1.5" data-keep-focus data-testid="numeric-keypad">
      {KEYPAD_DIGITS.slice(0, 3).map((d) => key(d, d))}
      {key("back", <Delete className="h-5 w-5" aria-hidden />, { ariaLabel: t("keypad.backspace") })}
      {KEYPAD_DIGITS.slice(3, 6).map((d) => key(d, d))}
      {key("clear", "C", { ariaLabel: t("keypad.clear") })}
      {KEYPAD_DIGITS.slice(6, 9).map((d) => key(d, d))}
      <Button
        type="button"
        className="row-span-2 h-auto text-lg"
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOk}
      >
        {t("keypad.ok")}
      </Button>
      {key("00", "00")}
      {key("0", "0")}
      {decimals > 0 ? key(",", ",", { ariaLabel: t("keypad.comma") }) : <span />}
    </div>
  );
}

export interface NumericFieldProps extends Omit<InputProps, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Digits after the comma; 0 for whole numbers (no comma key). */
  decimals?: number;
  /**
   * In touch mode: "inline" shows the keypad under the field (a dialog with
   * one amount), "popover" opens it while the field has focus (a list of
   * fields, the cart's quantities).
   */
  keypad?: "inline" | "popover";
  /** OK on the keypad. Default: inline submits the field's form; popover closes and leaves the field (its blur applies it). */
  onOk?: () => void;
}

/**
 * A number field that works with a physical keyboard as always and, with
 * touch mode on (This device), with the on-screen keypad.
 */
export const NumericField = React.forwardRef<HTMLInputElement, NumericFieldProps>(
  ({ value, onValueChange, decimals = 2, keypad = "inline", onOk, onFocus, onBlur, onKeyDown, maxLength, ...props }, ref) => {
    const touch = useTouchMode();
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [open, setOpen] = React.useState(false);
    // Like typing over a selected field: the first key after focusing starts a new number.
    const fresh = React.useRef(false);
    const setRefs = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };
    const press = (key: KeypadKey) => {
      const start = fresh.current && key !== "back" ? "" : value;
      fresh.current = false;
      onValueChange(pressKey(start, key, { decimals, maxLength }));
    };

    const input = (
      <Input
        ref={setRefs}
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        maxLength={maxLength}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={(e) => {
          onFocus?.(e);
          fresh.current = true;
          if (touch && keypad === "popover") setOpen(true);
        }}
        onKeyDown={(e) => {
          fresh.current = false;
          onKeyDown?.(e);
        }}
        onBlur={(e) => {
          onBlur?.(e);
          setOpen(false);
        }}
        {...props}
      />
    );
    if (!touch) return input;

    if (keypad === "inline") {
      return (
        <div className="space-y-2">
          {input}
          <NumericKeypad
            decimals={decimals}
            onKey={press}
            onOk={() => (onOk ? onOk() : inputRef.current?.form?.requestSubmit())}
          />
        </div>
      );
    }
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>{input}</PopoverAnchor>
        <PopoverContent
          className="w-auto p-2"
          data-keep-focus
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Tapping the field itself isn't "outside".
          onInteractOutside={(e) => {
            if (e.target instanceof Node && inputRef.current?.contains(e.target)) e.preventDefault();
          }}
        >
          <NumericKeypad
            decimals={decimals}
            onKey={press}
            onOk={() => {
              setOpen(false);
              if (onOk) onOk();
              else inputRef.current?.blur();
            }}
          />
        </PopoverContent>
      </Popover>
    );
  },
);
NumericField.displayName = "NumericField";

import * as React from "react";
import { Check, ChevronsUpDown, PenLine, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterOptions, type ComboboxOption } from "./combobox-filter";

export type { ComboboxOption } from "./combobox-filter";

/** Long lists (products) only render this many matches; typing narrows them down. */
const MAX_RENDERED = 100;

const OTHER_VALUE = "\u0000other";
const CLEAR_VALUE = "\u0000clear";

export interface ComboboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange" | "children"> {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /**
   * Offers "Other: <what you typed>" so a value that isn't in the list can be
   * entered; onChange then gets the typed text, and a value that matches no
   * option is shown as typed.
   */
  allowOther?: boolean;
  /** Adds a first entry that clears the choice (onChange(null)), e.g. "No category". */
  clearLabel?: string;
  /** Shown on the button when the value isn't among the current options (e.g. async results). */
  valueLabel?: string;
  /** Icon at the start of the button. */
  icon?: React.ReactNode;
  /**
   * Server-side search: the options are already filtered for the typed text,
   * which is reported here instead of being filtered locally.
   */
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  /** Extra content under the list (e.g. "Add a new customer"); `close` closes the list. */
  footer?: (query: string, close: () => void) => React.ReactNode;
  contentClassName?: string;
}

/**
 * The one dropdown for choosing from a list, everywhere in the app. Type to
 * filter (accents and case ignored), pick with the mouse or with the arrow
 * keys and Enter, Esc closes. Typing on the closed button opens it with what
 * was typed.
 */
export const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  {
    value,
    onChange,
    options,
    placeholder,
    searchPlaceholder,
    emptyText,
    allowOther,
    clearLabel,
    valueLabel,
    icon,
    onSearchChange,
    loading,
    footer,
    className,
    contentClassName,
    disabled,
    onKeyDown,
    ...buttonProps
  },
  ref,
) {
  const { t } = useTranslation("common");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = options.find((o) => o.value === value);
  const shown = selected?.label ?? valueLabel ?? (allowOther && value ? value : null);
  // A combobox isn't named by its text. Without an aria-label, or an id a
  // <label> (FormLabel) points at, it's named after what it shows.
  const unlabelled = !buttonProps["aria-label"] && !buttonProps["aria-labelledby"] && !buttonProps.id;
  const fallbackLabel = unlabelled ? (shown ?? placeholder ?? undefined) : undefined;

  const matches = onSearchChange ? options : filterOptions(options, query);
  const rendered = matches.slice(0, MAX_RENDERED);
  const typed = query.trim();
  const offerOther = allowOther && typed.length > 0 && !matches.some((o) => o.label.toLowerCase() === typed.toLowerCase());

  // Refs as well as state: keys typed quickly reach the button before the
  // list has rendered and taken focus, and each must add to the text.
  const openRef = React.useRef(false);
  const queryRef = React.useRef("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  function changeQuery(next: string) {
    queryRef.current = next;
    setQuery(next);
    onSearchChange?.(next);
  }

  function setOpenAndReset(next: boolean) {
    openRef.current = next;
    setOpen(next);
    if (!next) changeQuery("");
  }

  function choose(next: string | null) {
    onChange(next);
    setOpenAndReset(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpenAndReset} modal>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={fallbackLabel}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (e.defaultPrevented) return;
            // Start typing on the closed button: open with that text.
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              changeQuery((openRef.current ? queryRef.current : "") + e.key);
              setOpenAndReset(true);
            } else if (e.key === "ArrowDown" && !openRef.current) {
              e.preventDefault();
              setOpenAndReset(true);
            }
          }}
          {...buttonProps}
        >
          <span className="flex min-w-0 items-center gap-2">
            {icon}
            <span className={cn("truncate", !shown && "text-muted-foreground")}>{shown ?? placeholder ?? t("combobox.select")}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[--radix-popover-trigger-width] min-w-[16rem] p-0", contentClassName)}
        align="start"
        onOpenAutoFocus={(e) => {
          // Radix would select the search text, so the next key typed would
          // replace what opened the list; put the caret after it instead.
          e.preventDefault();
          const input = inputRef.current;
          input?.focus();
          input?.setSelectionRange(input.value.length, input.value.length);
        }}
      >
        <Command shouldFilter={false} loop>
          <CommandInput
            ref={inputRef}
            placeholder={searchPlaceholder ?? t("combobox.search")}
            value={query}
            onValueChange={changeQuery}
          />
          <CommandList>
            {!loading && rendered.length === 0 && !offerOther && <CommandEmpty>{emptyText ?? t("combobox.empty")}</CommandEmpty>}
            {loading && rendered.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">{t("actions.loading")}</div>}
            <CommandGroup>
              {clearLabel && !typed && (
                <CommandItem value={CLEAR_VALUE} onSelect={() => choose(null)}>
                  <X className="mr-2 h-4 w-4 opacity-50" />
                  <span className="text-muted-foreground">{clearLabel}</span>
                </CommandItem>
              )}
              {rendered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  onSelect={() => choose(option.value)}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <span className="truncate">{option.label}</span>
                    {option.description && <span className="shrink-0 text-xs text-muted-foreground">{option.description}</span>}
                  </span>
                </CommandItem>
              ))}
              {offerOther && (
                <CommandItem value={OTHER_VALUE} onSelect={() => choose(typed)}>
                  <PenLine className="mr-2 h-4 w-4 opacity-50" />
                  {t("combobox.other", { text: typed })}
                </CommandItem>
              )}
            </CommandGroup>
            {matches.length > MAX_RENDERED && (
              <p className="px-3 pb-2 text-xs text-muted-foreground">{t("combobox.more", { count: matches.length - MAX_RENDERED })}</p>
            )}
          </CommandList>
          {footer?.(typed, () => setOpenAndReset(false))}
        </Command>
      </PopoverContent>
    </Popover>
  );
});

export const KEYPAD_DIGITS = ["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const;

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "," | "back" | "clear";

/**
 * A field's text after a key on the on-screen keypad. The decimal separator
 * is a comma (typed on a keyboard, a point works too); `decimals` caps the
 * digits after it (0: whole numbers only), `maxLength` the whole text (a PIN).
 */
export function pressKey(value: string, key: KeypadKey, { decimals = 2, maxLength }: { decimals?: number; maxLength?: number } = {}): string {
  if (key === "clear") return "";
  if (key === "back") return value.slice(0, -1);
  const separator = value.search(/[.,]/);
  let next: string;
  if (key === ",") {
    if (decimals === 0 || separator >= 0) return value;
    next = `${value === "" ? "0" : value},`;
  } else {
    next = value + key;
    if (separator >= 0) next = next.slice(0, separator + 1 + decimals);
    // No leading zeros: "0" then "5" is "5"; "00" on an empty field is "0".
    else next = next.replace(/^0+(?=\d)/, "");
  }
  return maxLength !== undefined && next.length > maxLength ? value : next;
}

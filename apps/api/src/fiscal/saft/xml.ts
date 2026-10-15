/**
 * A tiny XML writer for the SAF-T files: elements in order, text escaped,
 * characters XML can't carry dropped, and text cut to the schema's length.
 */

// Control characters XML 1.0 doesn't allow (tab, newline and CR are fine).
// eslint-disable-next-line no-control-regex
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
  return value
    .replace(NOT_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** SAF-T's word for a value nobody recorded (addresses, accounts, consumidor final). */
export const UNKNOWN = "Desconhecido";

/**
 * Text for a mandatory field of at most `max` characters: whitespace
 * squeezed, cut to fit, and `fallback` when there's nothing left.
 */
export function text(value: string | null | undefined, max: number, fallback = UNKNOWN): string {
  const clean = (value ?? "").replace(NOT_XML, "").replace(/\s+/g, " ").trim();
  return clean ? Array.from(clean).slice(0, max).join("").trimEnd() : fallback;
}

/** Text for an optional field: null (left out) when empty. */
export function optionalText(value: string | null | undefined, max: number): string | null {
  const t = text(value, max, "");
  return t === "" ? null : t;
}

export class XmlWriter {
  private readonly out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  private depth = 0;

  open(name: string, attributes: Record<string, string> = {}): this {
    const attrs = Object.entries(attributes)
      .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
      .join("");
    this.line(`<${name}${attrs}>`);
    this.depth++;
    return this;
  }

  close(name: string): this {
    this.depth--;
    this.line(`</${name}>`);
    return this;
  }

  /** <name>value</name>; left out when value is null or undefined. */
  el(name: string, value: string | number | null | undefined): this {
    if (value === null || value === undefined) return this;
    this.line(`<${name}>${escapeXml(String(value))}</${name}>`);
    return this;
  }

  toString(): string {
    return `${this.out.join("\n")}\n`;
  }

  private line(s: string) {
    this.out.push(`${"  ".repeat(this.depth)}${s}`);
  }
}

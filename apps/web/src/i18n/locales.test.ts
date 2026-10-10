import { describe, expect, it } from "vitest";
import { LANGUAGES, matchLanguage } from "./index";

/** Every translation must have exactly English's keys, placeholders and tags. */
const files = import.meta.glob<{ default: Record<string, unknown> }>("../locales/*/*.json", { eager: true });

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") Object.assign(out, flatten(value as Record<string, unknown>, path));
    else out[path] = String(value);
  }
  return out;
}

function load(lang: string) {
  const byNs: Record<string, Record<string, string>> = {};
  for (const [path, mod] of Object.entries(files)) {
    const [, l, ns] = path.match(/locales\/([^/]+)\/([^/]+)\.json$/)!;
    if (l === lang) byNs[ns] = flatten(mod.default);
  }
  return byNs;
}

/** {{name}} placeholders and <b> tags, sorted, so word order may differ. */
function markers(text: string) {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}|<\/?(\w+)>/g)].map((m) => m[0].replace(/\s/g, "")).sort();
}

const en = load("en");

describe("translations", () => {
  for (const { code } of LANGUAGES.filter((l) => l.code !== "en")) {
    const other = load(code);

    it(`${code} has the same files as English`, () => {
      expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
    });

    for (const ns of Object.keys(en)) {
      it(`${code}/${ns} has every key, no extras, and the same placeholders`, () => {
        expect(Object.keys(other[ns] ?? {}).sort()).toEqual(Object.keys(en[ns]).sort());
        for (const [key, text] of Object.entries(en[ns])) {
          expect({ key, markers: markers(other[ns][key] ?? "") }).toEqual({ key, markers: markers(text) });
          expect({ key, empty: (other[ns][key] ?? "").trim() === "" }).toEqual({ key, empty: false });
        }
      });
    }
  }
});

describe("matchLanguage", () => {
  it("maps browser languages to the ones we ship", () => {
    expect(matchLanguage("pt-BR")).toBe("pt-BR");
    expect(matchLanguage("pt-br")).toBe("pt-BR");
    expect(matchLanguage("pt-PT")).toBe("pt-PT");
    expect(matchLanguage("pt-AO")).toBe("pt-PT");
    expect(matchLanguage("pt")).toBe("pt-PT");
    expect(matchLanguage("en-GB")).toBe("en");
    expect(matchLanguage("fr-FR")).toBeNull();
  });
});

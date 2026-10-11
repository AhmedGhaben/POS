import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { TRANSLATED_MESSAGES, translateMessage } from "./messages";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".ts") && !name.endsWith(".spec.ts") ? [path] : [];
  });
}

describe("API message translations", () => {
  it("translates exact messages and leaves English alone", () => {
    expect(translateMessage("SKU already exists", "pt-PT")).toBe("Essa referência já existe");
    expect(translateMessage("SKU already exists", "pt-BR")).toBe("Esse código já existe");
    expect(translateMessage("SKU already exists", "en")).toBe("SKU already exists");
  });

  it("translates messages with a value in them", () => {
    expect(translateMessage('Insufficient stock for "Green tea"', "pt-BR")).toBe('Estoque insuficiente de "Green tea"');
    expect(translateMessage('Insufficient stock for "Tea" at the source store', "pt-PT")).toBe(
      'Stock insuficiente de "Tea" na loja de origem',
    );
  });

  it("keeps unknown messages as they are", () => {
    expect(translateMessage("email must be an email", "pt-PT")).toBe("email must be an email");
  });

  it("has a translation for every fixed message the API throws", () => {
    const thrown = new Set<string>();
    for (const file of sourceFiles(join(__dirname, "..", ".."))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/Exception\(\s*"([^"]+)"/g)) thrown.add(m[1]);
      for (const m of text.matchAll(/message: "([^"]+)"/g)) thrown.add(m[1]);
    }
    const missing = [...thrown].filter((m) => !TRANSLATED_MESSAGES.includes(m));
    expect(missing).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import postcss from "postcss";
import { expect, it } from "vitest";

const css = postcss.parse(readFileSync(new URL("../../styles/storbit-login.css", import.meta.url), "utf8"));

it("removes the inherited 44px minimum and fits both segments inside the 40px border box", () => {
  const rules: Record<string, Record<string, string>> = {};
  css.walkRules(rule => {
    rule.selector.split(",").forEach(selector => {
      const declarations = rules[selector] ??= {};
      rule.walkDecls(({ prop, value }) => { declarations[prop] = value; });
    });
  });
  const outer = rules[".storbit-login .language"];
  const buttons = rules[".storbit-login .language button"];
  const toggle = rules[".storbit-login .auth-theme-toggle"];
  expect(outer).toMatchObject({ height: "40px", "box-sizing": "border-box", padding: "3px", "align-items": "stretch" });
  expect(toggle.height).toBe(outer.height);
  expect(buttons).toMatchObject({ height: "32px", "min-height": "0", "box-sizing": "border-box", margin: "0", padding: "0 8px", "align-items": "center" });
  expect(Number.parseFloat(buttons.height) + 2 * Number.parseFloat(outer.padding) + 2).toBe(Number.parseFloat(outer.height));
  expect(buttons.transform).toBeUndefined();
  expect(rules[".storbit-login .language button:focus-visible"]).toMatchObject({ outline: "2px solid var(--focus)", "outline-offset": "0" });
});

it("does not change geometry for active segments, theme or mobile overrides", () => {
  css.walkRules(rule => {
    if (!rule.selector.includes(".language")) return;
    const conditional = rule.selector.includes("[aria-pressed") || rule.selector.includes(":root") || rule.parent?.type === "atrule";
    if (!conditional) return;
    const properties: string[] = [];
    rule.walkDecls(({ prop }) => { properties.push(prop); });
    expect(properties.filter(prop => /^(height|min-height|margin|padding|box-sizing|transform)$/.test(prop))).toEqual([]);
  });
});

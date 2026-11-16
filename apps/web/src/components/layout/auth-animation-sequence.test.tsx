import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import "@/i18n";
import { SignupLayout } from "./SignupLayout";
import { LoginLayout } from "./LoginLayout";

vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
const css = postcss.parse(readFileSync(new URL("../../styles/storbit-login.css", import.meta.url), "utf8"));

it("finishes the existing storefront groups and staggered benefits by 1200ms", () => {
  const declarations = (selector: string) => {
    const result: Record<string, string> = {};
    css.walkRules(rule => {
      if (rule.selector === selector) {
        expect(rule.parent?.type).toBe("atrule");
        rule.walkDecls(({ prop, value }) => { result[prop] = value; });
      }
    });
    return result;
  };
  const running = '.storbit-signup[data-auth-entrance="running"] ';
  expect(declarations(running + ".storefront").animation).toBe("storbit-enter 350ms ease-out both");
  expect(declarations(running + ".shop-awning").animation).toBe("storbit-awning 350ms ease-out both");
  expect(declarations(running + ".shop-box-one").animation).toBe("storbit-shop-item 200ms 350ms ease-out both");
  expect(declarations(running + ".shop-box-two").animation).toBe("storbit-shop-item 200ms 420ms ease-out both");
  for (const [item, delay] of [["one", 350], ["two", 430], ["three", 510]] as const) {
    expect(declarations(running + `.shop-check-${item}`).animation).toBe(`storbit-shop-item 140ms ${delay}ms ease-out both`);
  }
  expect(declarations(running + ".signup-benefits li").animation).toBe("storbit-enter 350ms 650ms ease-out both");
  expect(declarations(running + ".signup-benefits li:nth-child(2)")["animation-delay"]).toBe("750ms");
  expect(declarations(running + ".signup-benefits li:nth-child(3)")["animation-delay"]).toBe("850ms");
});
it("groups the existing SVG artwork without adding form controls or external assets", () => {
  const html = renderToStaticMarkup(<SignupLayout footer={null}><input name="existing-form" /></SignupLayout>);
  expect(html.match(/class="shop-awning"/g)).toHaveLength(1);
  expect(html.match(/class="shop-box shop-box-/g)).toHaveLength(2);
  expect(html.match(/class="shop-check shop-check-/g)).toHaveLength(3);
  expect(html.match(/fill="#44C898"/g)).toHaveLength(3);
  expect(html.match(/<input /g)).toHaveLength(1);
});
it("keeps final sample values accessible and badge/low-stock outside the counters", () => {
  const html = renderToStaticMarkup(<LoginLayout footer={null}>{null}</LoginLayout>);
  expect(html.match(/SAMPLE DATA/g)).toHaveLength(1);
  expect(html).toContain('<span class="sr-only">Kz 2.48M</span>');
  expect(html).toContain('<span class="sr-only">126</span>');
  expect(html).toContain('<div class="metric-value">04</div>');
  expect(html.match(/data-sample-sales/g)).toHaveLength(1);
  expect(html.match(/data-sample-transactions/g)).toHaveLength(1);
  expect(html).not.toContain("aria-live");
});

import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "@/i18n";
import { StatusDiamond } from "./status-diamond";

describe("StatusDiamond", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("pt-AO");
  });

  it("always shows a text label next to the diamond", () => {
    const html = renderToStaticMarkup(<StatusDiamond state="offline" />);
    expect(html).toContain("Sem internet · a vender");
    expect(html).toContain('fill="var(--sb-status-offline)"');
  });

  it("without a visible label, the label is its accessible name and tooltip", () => {
    const html = renderToStaticMarkup(<StatusDiamond state="online" hideLabel />);
    expect(html).toContain('aria-label="Online"');
    expect(html).toContain('title="Online"');
  });

  it("syncing is a green outline that pulses", () => {
    const html = renderToStaticMarkup(<StatusDiamond state="syncing" />);
    expect(html).toContain('fill="transparent"');
    expect(html).toContain('stroke="var(--sb-status-online)"');
    expect(html).toContain("sb-diamond-pulse");
    expect(html).toContain("A sincronizar");
  });

  it("sizes are the side of the square before rotation", () => {
    const html = renderToStaticMarkup(<StatusDiamond state="error" size={16} />);
    expect(html).toContain('width="23"'); // 16 × √2, rounded up
    expect(html).toContain("Erro de sincronização");
  });
});

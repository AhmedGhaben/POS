import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import { groupDeadlines } from "../deadline-groups";
import type { Deadline } from "../export-periods";
import { DeadlineNotice } from "./SaftDeadlines";

const d = (key: string, due: string): Deadline => ({ key, due, covers: key === "saftAccounting" ? "2025-12-31" : "2026-10", overdue: false });

function render(deadlines: Deadline[], today: string, link = true) {
  return groupDeadlines(deadlines, today).map((group) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <DeadlineNotice group={group} link={link} />
      </MemoryRouter>,
    ),
  );
}

describe("SAF-T reminders (pt-AO)", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("pt-AO");
  });

  it("two files due the same day: one notice, an action for each file", () => {
    const [html, ...rest] = render([d("saftInvoicing", "2026-11-30"), d("saftPurchases", "2026-11-30")], "2026-11-17");
    expect(rest).toHaveLength(0);
    expect(html).toContain("Entregar até 30/11/2026");
    expect(html).toContain("Faltam 13 dias");
    expect(html).toContain("Ficheiro SAF-T de facturação de");
    expect(html).toContain("Ficheiro SAF-T de aquisição de bens e serviços de");
    // Each action keeps its route and has its own accessible name.
    expect(html).toContain('href="/reports?tab=files"');
    expect(html).toContain('href="/accounting?tab=saft"');
    const labels = [...html.matchAll(/aria-label="(Gerar agora: [^"]+)"/g)].map((m) => m[1]);
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
  });

  it("more than 7 days left: the quiet neutral notice", () => {
    const [html] = render([d("saftInvoicing", "2026-11-30")], "2026-11-22");
    expect(html).toContain('data-level="later"');
    expect(html).toContain("sb-notice");
    expect(html).toContain("Faltam 8 dias");
  });

  it("7 days or fewer: a stronger notice, still neutral (amber is for offline only)", () => {
    const [html] = render([d("saftInvoicing", "2026-11-30")], "2026-11-23");
    expect(html).toContain('data-level="soon"');
    expect(html).toContain("border-foreground");
    expect(html).toContain("Faltam 7 dias");
    expect(html).not.toMatch(/sb-offline|amber/);
    const [today] = render([d("saftInvoicing", "2026-11-30")], "2026-11-30");
    expect(today).toContain("Termina hoje");
  });

  it("deadline passed: error colour, without claiming the file wasn't submitted", () => {
    const [html] = render([d("saftInvoicing", "2026-11-30")], "2026-12-02");
    expect(html).toContain('data-level="passed"');
    expect(html).toContain("sb-error");
    expect(html).toContain("Prazo terminado a 30/11/2026");
    expect(html).toContain("Se já entregou, pode ignorar este aviso.");
    expect(html).not.toMatch(/Em atraso|não entreg|not submitted|Overdue/i);
  });

  it("on the files page (link off) there are no actions", () => {
    const [html] = render([d("saftInvoicing", "2026-11-30"), d("saftPurchases", "2026-11-30")], "2026-11-17", false);
    expect(html).not.toContain("<a ");
  });

  it("English", async () => {
    await i18n.changeLanguage("en");
    const [html] = render([d("saftInvoicing", "2026-11-30")], "2026-11-29");
    expect(html).toContain("1 day left");
    expect(html).toContain("SAF-T invoicing file for");
    const [passed] = render([d("saftInvoicing", "2026-11-30")], "2026-12-01");
    expect(passed).toContain("Deadline passed on");
    expect(passed).toContain("If you&#x27;ve already submitted it, you can ignore this reminder.");
    await i18n.changeLanguage("pt-AO");
  });
});

import { ConfigService } from "@nestjs/config";
import { MAIL_TEXTS } from "./mail-texts";
import { MailService } from "./mail.service";

function shape(value: unknown): unknown {
  if (typeof value === "function") return "fn";
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  }
  return typeof value;
}

describe("email languages", () => {
  it("every language has the same emails and fields", () => {
    expect(shape(MAIL_TEXTS["pt-PT"])).toEqual(shape(MAIL_TEXTS.en));
    expect(shape(MAIL_TEXTS["pt-BR"])).toEqual(shape(MAIL_TEXTS.en));
  });

  it("an accountant invited by another company gets that company's name, who invited them, and the accept link", async () => {
    const service = new MailService(new ConfigService({ APP_URL: "https://pos.example/" }));
    const send = jest.spyOn(service as unknown as { send: () => Promise<void> }, "send").mockResolvedValue();
    await service.sendAccountantAccessEmail("carla@example.com", { firstName: "Carla", businessName: "Kianda <Lda>", inviterName: "Ana Dono", token: "tok/1" }, "pt-PT");
    const [to, subject, html] = send.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe("carla@example.com");
    expect(subject).toBe("Kianda &lt;Lda&gt; convida-o para a sua contabilidade");
    expect(html).toContain("Ana Dono, de <b>Kianda &lt;Lda&gt;</b>, deu-lhe acesso");
    expect(html).toContain('href="https://pos.example/accountant-invitation?token=tok%2F1"');
  });

  it("a receipt email in European Portuguese uses Portuguese words and number style", async () => {
    const service = new MailService(new ConfigService({}));
    const send = jest.spyOn(service as unknown as { send: () => Promise<void> }, "send").mockResolvedValue();
    await service.sendReceiptEmail(
      "client@example.com",
      {
        storeName: "Loja <Centro>",
        currency: "EUR",
        receiptNumber: "MAIN-1",
        items: [{ name: "Café", quantity: 2, unitPrice: "1.5", lineTotal: "1234.5" }],
        subtotal: "1234.5",
        taxTotal: "0",
        total: "1234.5",
      },
      "pt-PT",
    );
    const [, subject, html] = send.mock.calls[0] as unknown as [string, string, string];
    expect(subject).toBe("Talão de Loja &lt;Centro&gt; — n.º MAIN-1");
    expect(html).toContain("Obrigado pela sua compra!");
    expect(html).toContain("1234,50 €");
  });
});

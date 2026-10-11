import type { Language } from "../i18n/languages";

/**
 * Email wording per language. Values are already HTML-escaped by the
 * caller; links are built by MailService. Keep the three languages in
 * step (mail-texts.spec.ts checks they have the same keys).
 */
export interface MailTexts {
  reset: { subject: string; requested: string; link: string; expires: string; ignore: string };
  verify: { subject: string; hi: (name: string) => string; thanks: string; link: string; expires: string; ignore: string };
  invite: {
    subject: (business: string) => string;
    hi: (name: string) => string;
    given: (business: string) => string;
    link: string;
    expires: string;
    signInWith: (email: string) => string;
  };
  receipt: {
    subject: (store: string, number: string) => string;
    number: (number: string) => string;
    item: string;
    qty: string;
    price: string;
    total: string;
    subtotal: string;
    tax: string;
    thanks: string;
  };
  lowStock: {
    subject: (store: string) => string;
    heading: (store: string) => string;
    intro: string;
    product: string;
    quantity: string;
    reorderLevel: string;
  };
}

export const MAIL_TEXTS: Record<Language, MailTexts> = {
  en: {
    reset: {
      subject: "Reset your password",
      requested: "A password reset was requested for your account.",
      link: "Choose a new password",
      expires: "(link expires in 1 hour)",
      ignore: "If you didn't request this, you can ignore this email.",
    },
    verify: {
      subject: "Verify your email",
      hi: (name) => `Hi ${name},`,
      thanks: "Thanks for signing up. Please confirm your email address:",
      link: "Verify my email",
      expires: "(link expires in 24 hours)",
      ignore: "If you didn't create an account, you can ignore this email.",
    },
    invite: {
      subject: (business) => `You've been added to ${business}`,
      hi: (name) => `Hi ${name},`,
      given: (business) => `You've been given a login for <b>${business}</b>'s point of sale.`,
      link: "Set your password",
      expires: "(link expires in 72 hours)",
      signInWith: (email) => `Then sign in with this email address: ${email}`,
    },
    receipt: {
      subject: (store, number) => `Receipt from ${store} — #${number}`,
      number: (number) => `Receipt #${number}`,
      item: "Item",
      qty: "Qty",
      price: "Price",
      total: "Total",
      subtotal: "Subtotal",
      tax: "Tax",
      thanks: "Thank you for your purchase!",
    },
    lowStock: {
      subject: (store) => `Low stock alert — ${store}`,
      heading: (store) => `Low stock at ${store}`,
      intro: "The following items are at or below their reorder level:",
      product: "Product",
      quantity: "Quantity",
      reorderLevel: "Reorder level",
    },
  },
  "pt-PT": {
    reset: {
      subject: "Repor a palavra-passe",
      requested: "Foi pedida a reposição da palavra-passe da sua conta.",
      link: "Escolher uma nova palavra-passe",
      expires: "(o link é válido durante 1 hora)",
      ignore: "Se não fez este pedido, pode ignorar este email.",
    },
    verify: {
      subject: "Confirme o seu email",
      hi: (name) => `Olá ${name},`,
      thanks: "Obrigado por se registar. Confirme o seu endereço de email:",
      link: "Confirmar o meu email",
      expires: "(o link é válido durante 24 horas)",
      ignore: "Se não criou uma conta, pode ignorar este email.",
    },
    invite: {
      subject: (business) => `Foi adicionado a ${business}`,
      hi: (name) => `Olá ${name},`,
      given: (business) => `Recebeu um acesso ao ponto de venda de <b>${business}</b>.`,
      link: "Definir a palavra-passe",
      expires: "(o link é válido durante 72 horas)",
      signInWith: (email) => `Depois inicie sessão com este endereço de email: ${email}`,
    },
    receipt: {
      subject: (store, number) => `Talão de ${store} — n.º ${number}`,
      number: (number) => `Talão n.º ${number}`,
      item: "Artigo",
      qty: "Qtd.",
      price: "Preço",
      total: "Total",
      subtotal: "Subtotal",
      tax: "IVA",
      thanks: "Obrigado pela sua compra!",
    },
    lowStock: {
      subject: (store) => `Alerta de stock baixo — ${store}`,
      heading: (store) => `Stock baixo em ${store}`,
      intro: "Os seguintes artigos estão no stock mínimo ou abaixo dele:",
      product: "Produto",
      quantity: "Quantidade",
      reorderLevel: "Stock mínimo",
    },
  },
  "pt-BR": {
    reset: {
      subject: "Redefinir sua senha",
      requested: "Foi solicitada a redefinição da senha da sua conta.",
      link: "Escolher uma nova senha",
      expires: "(o link expira em 1 hora)",
      ignore: "Se você não fez essa solicitação, pode ignorar este e-mail.",
    },
    verify: {
      subject: "Confirme seu e-mail",
      hi: (name) => `Olá, ${name}!`,
      thanks: "Obrigado por se cadastrar. Confirme seu endereço de e-mail:",
      link: "Confirmar meu e-mail",
      expires: "(o link expira em 24 horas)",
      ignore: "Se você não criou uma conta, pode ignorar este e-mail.",
    },
    invite: {
      subject: (business) => `Você foi adicionado a ${business}`,
      hi: (name) => `Olá, ${name}!`,
      given: (business) => `Você recebeu um login para o PDV de <b>${business}</b>.`,
      link: "Definir sua senha",
      expires: "(o link expira em 72 horas)",
      signInWith: (email) => `Depois, entre com este endereço de e-mail: ${email}`,
    },
    receipt: {
      subject: (store, number) => `Recibo de ${store} — nº ${number}`,
      number: (number) => `Recibo nº ${number}`,
      item: "Item",
      qty: "Qtd.",
      price: "Preço",
      total: "Total",
      subtotal: "Subtotal",
      tax: "Impostos",
      thanks: "Obrigado pela sua compra!",
    },
    lowStock: {
      subject: (store) => `Alerta de estoque baixo — ${store}`,
      heading: (store) => `Estoque baixo em ${store}`,
      intro: "Os itens abaixo estão no estoque mínimo ou abaixo dele:",
      product: "Produto",
      quantity: "Quantidade",
      reorderLevel: "Estoque mínimo",
    },
  },
};

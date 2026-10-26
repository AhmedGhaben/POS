import type { Language } from "../i18n/languages";
import { aoSpelling } from "../i18n/ao-spelling";

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
  accountantAccess: {
    subject: (business: string) => string;
    hi: (name: string) => string;
    given: (business: string, inviter: string) => string;
    link: string;
    expires: string;
    orInApp: string;
  };
  receipt: {
    subject: (store: string, number: string) => string;
    number: (number: string) => string;
    item: string;
    qty: string;
    price: string;
    total: string;
    subtotal: string;
    discount: string;
    tax: string;
    taxIncluded: string;
    thanks: string;
  };
  /** A sale's fiscal document (Factura-Recibo...) sent to the customer. */
  document: {
    subject: (title: string, number: string, store: string) => string;
    intro: (title: string, number: string) => string;
    attached: string;
    date: string;
    customer: string;
    taxId: string;
    code: string;
    description: string;
    qty: string;
    unitPrice: string;
    iva: string;
    amount: string;
    net: string;
    taxTotal: string;
    gross: string;
    discount: string;
    payments: string;
    tendered: string;
    change: string;
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

const TEXTS: Record<Exclude<Language, "pt-AO">, MailTexts> = {
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
    accountantAccess: {
      subject: (business) => `${business} invites you to keep its books`,
      hi: (name) => `Hi ${name},`,
      given: (business, inviter) => `${inviter ? `${inviter} of ` : ""}<b>${business}</b> has given you access to its books as their accountant.`,
      link: "Accept the invitation",
      expires: "(link valid for 30 days)",
      orInApp: "You can also accept or decline it under Accounting → Your clients once signed in, with your usual email and password.",
    },
    receipt: {
      subject: (store, number) => `Receipt from ${store} — #${number}`,
      number: (number) => `Receipt #${number}`,
      item: "Item",
      qty: "Qty",
      price: "Price",
      total: "Total",
      subtotal: "Subtotal",
      discount: "Discount",
      tax: "Tax",
      taxIncluded: "Tax included",
      thanks: "Thank you for your purchase!",
    },
    document: {
      subject: (title, number, store) => `${title} ${number} — ${store}`,
      intro: (title, number) => `Here is your ${title} ${number}. Keep it as proof of purchase.`,
      attached: "The document is also attached, to keep or print.",
      date: "Date",
      customer: "Customer",
      taxId: "NIF",
      code: "Code",
      description: "Description",
      qty: "Qty",
      unitPrice: "Unit price",
      iva: "IVA",
      amount: "Amount",
      net: "Total without IVA",
      taxTotal: "IVA",
      gross: "Total",
      discount: "Discounts",
      payments: "Paid with",
      tendered: "Amount handed over",
      change: "Change",
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
    accountantAccess: {
      subject: (business) => `${business} convida-o para a sua contabilidade`,
      hi: (name) => `Olá ${name},`,
      given: (business, inviter) => `${inviter ? `${inviter}, de ` : ""}<b>${business}</b>, deu-lhe acesso à contabilidade da empresa como contabilista.`,
      link: "Aceitar o convite",
      expires: "(o link é válido durante 30 dias)",
      orInApp: "Também pode aceitá-lo ou recusá-lo em Contabilidade → Os seus clientes, depois de iniciar sessão com o seu email e palavra-passe de sempre.",
    },
    receipt: {
      subject: (store, number) => `Talão de ${store} — n.º ${number}`,
      number: (number) => `Talão n.º ${number}`,
      item: "Artigo",
      qty: "Qtd.",
      price: "Preço",
      total: "Total",
      subtotal: "Subtotal",
      discount: "Desconto",
      tax: "IVA",
      taxIncluded: "IVA incluído",
      thanks: "Obrigado pela sua compra!",
    },
    document: {
      subject: (title, number, store) => `${title} ${number} — ${store}`,
      intro: (title, number) => `Segue a sua ${title} ${number}. Guarde-a como comprovativo da compra.`,
      attached: "O documento segue também em anexo, para guardar ou imprimir.",
      date: "Data",
      customer: "Cliente",
      taxId: "NIF",
      code: "Código",
      description: "Descrição",
      qty: "Qtd.",
      unitPrice: "Preço unit.",
      iva: "IVA",
      amount: "Valor",
      net: "Total sem IVA",
      taxTotal: "IVA",
      gross: "Total",
      discount: "Descontos",
      payments: "Pago com",
      tendered: "Valor entregue",
      change: "Troco",
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
    accountantAccess: {
      subject: (business) => `${business} convida você para a contabilidade`,
      hi: (name) => `Olá, ${name}!`,
      given: (business, inviter) => `${inviter ? `${inviter}, da ` : ""}<b>${business}</b>, deu a você acesso à contabilidade da empresa como contador.`,
      link: "Aceitar o convite",
      expires: "(o link vale por 30 dias)",
      orInApp: "Você também pode aceitar ou recusar em Contabilidade → Seus clientes depois de entrar com seu e-mail e senha de sempre.",
    },
    receipt: {
      subject: (store, number) => `Recibo de ${store} — nº ${number}`,
      number: (number) => `Recibo nº ${number}`,
      item: "Item",
      qty: "Qtd.",
      price: "Preço",
      total: "Total",
      subtotal: "Subtotal",
      discount: "Desconto",
      tax: "Impostos",
      taxIncluded: "Impostos inclusos",
      thanks: "Obrigado pela sua compra!",
    },
    document: {
      subject: (title, number, store) => `${title} ${number} — ${store}`,
      intro: (title, number) => `Segue sua ${title} ${number}. Guarde como comprovante da compra.`,
      attached: "O documento também vai em anexo, para guardar ou imprimir.",
      date: "Data",
      customer: "Cliente",
      taxId: "NIF",
      code: "Código",
      description: "Descrição",
      qty: "Qtd.",
      unitPrice: "Preço unit.",
      iva: "IVA",
      amount: "Valor",
      net: "Total sem IVA",
      taxTotal: "IVA",
      gross: "Total",
      discount: "Descontos",
      payments: "Pago com",
      tendered: "Valor entregue",
      change: "Troco",
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

/** Every text in Angolan spelling, functions included (their result is converted). */
function inAoSpelling<T>(value: T): T {
  if (typeof value === "string") return aoSpelling(value) as T;
  if (typeof value === "function") {
    const fn = value as (...args: string[]) => string;
    return ((...args: string[]) => aoSpelling(fn(...args))) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, inAoSpelling(v)])) as T;
  }
  return value;
}

/** pt-AO is the European Portuguese wording in Angolan spelling. */
export const MAIL_TEXTS: Record<Language, MailTexts> = { ...TEXTS, "pt-AO": inAoSpelling(TEXTS["pt-PT"]) };

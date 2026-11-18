/**
 * Primary call-to-action state machine (About brief §4.5, WEBSITE_SPEC §3).
 * The label always says what actually happens; never a dead or fake link.
 *
 * | SIGNUP_OPEN | LEADS_OPEN | Primary                       | Action                  |
 * |-------------|------------|-------------------------------|-------------------------|
 * | true        | any        | Começar → / Get started →     | APP_URL/signup          |
 * | false       | true       | Pedir demonstração / Request a demo | demo page (form)  |
 * | false       | false      | Pedir demonstração / Request a demo | WhatsApp (demo msg)|
 * | no WhatsApp |            | idem                          | approved email (mailto) |
 * | nothing configured       | preview: disabled + label · public: hidden              |
 *
 * Row 3 (WhatsApp) is the default until the owner approves the state machine
 * (About brief §9.6).
 */
import { APP_URL, CONTACT_EMAIL, FLAGS, PREVIEW, WHATSAPP_NUMBER } from '../config';
import { href, type Lang } from '../i18n';

const MESSAGES = {
  demo: {
    'pt-AO':
      'Olá! Vi o site da STORBIT e gostaria de pedir uma demonstração.\n' +
      'Nome da loja:\nCidade:\nNúmero de lojas:',
    en: 'Hello! I saw the STORBIT website and would like to request a demo.\nShop name:\nCity:\nNumber of shops:',
  },
  sobre: {
    'pt-AO': 'Olá! Vi a página "Sobre" da STORBIT e tenho uma pergunta:',
    en: 'Hello! I saw the STORBIT "About" page and I have a question:',
  },
  inicio: {
    'pt-AO': 'Olá! Vi o site da STORBIT e tenho uma pergunta:',
    en: 'Hello! I saw the STORBIT website and I have a question:',
  },
  comoFunciona: {
    'pt-AO': 'Olá, vi a página Como funciona e quero ver a STORBIT a vender sem internet.',
    en: 'Hello, I saw the How it works page and I would like to see STORBIT selling without internet.',
  },
  ajuda: {
    'pt-AO': 'Olá! Estive na página de ajuda da STORBIT e tenho uma pergunta:',
    en: 'Hello! I was on the STORBIT help page and I have a question:',
  },
  planos: {
    'pt-AO': 'Olá! Gostaria de saber mais sobre os preços da STORBIT.',
    en: 'Hello! I would like to know more about STORBIT pricing.',
  },
  transferir: {
    'pt-AO': 'Olá! Gostaria de saber como instalar a STORBIT Caixa.',
    en: 'Hello! I would like to know how to install STORBIT Caixa.',
  },
  demonstracao: {
    'pt-AO': 'Olá! Gostaria de pedir uma demonstração da STORBIT.',
    en: 'Hello! I would like to request a STORBIT demo.',
  },
  naoEncontrada: {
    'pt-AO': 'Olá! Estava no site da STORBIT e não encontrei uma página.',
    en: 'Hello! I was on the STORBIT website and could not find a page.',
  },
} as const;
export type WaMessage = keyof typeof MESSAGES;
export const waMessage = (msg: WaMessage, lang: Lang) => MESSAGES[msg][lang];

export const whatsappHref = (msg: WaMessage, lang: Lang): string =>
  WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(MESSAGES[msg][lang])}`
    : '';

export const emailHref = (lang: Lang): string =>
  CONTACT_EMAIL
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(lang === 'en' ? 'STORBIT demo request' : 'Pedido de demonstração STORBIT')}`
    : '';

export type Cta = {
  label: string;
  href: string;
  kind: 'signup' | 'form' | 'whatsapp' | 'email' | 'pending';
  /** Analytics event name. */
  event: string;
  external: boolean;
};

const DEMO_LABEL = { 'pt-AO': 'Pedir demonstração', en: 'Request a demo' };

export function primaryCta(lang: Lang): Cta | null {
  if (FLAGS.SIGNUP_OPEN) {
    return { label: lang === 'en' ? 'Get started' : 'Começar', href: `${APP_URL}/signup`, kind: 'signup', event: 'signup_click', external: true };
  }
  if (FLAGS.LEADS_OPEN) {
    return { label: DEMO_LABEL[lang], href: href('demo', lang), kind: 'form', event: 'demo_click', external: false };
  }
  if (WHATSAPP_NUMBER) {
    return { label: DEMO_LABEL[lang], href: whatsappHref('demo', lang), kind: 'whatsapp', event: 'whatsapp_click', external: true };
  }
  if (CONTACT_EMAIL) {
    return { label: DEMO_LABEL[lang], href: emailHref(lang), kind: 'email', event: 'email_click', external: true };
  }
  if (PREVIEW) {
    return { label: DEMO_LABEL[lang], href: '', kind: 'pending', event: '', external: false };
  }
  return null;
}

/** Secondary WhatsApp action; null when no number is configured. */
export function whatsappCta(msg: WaMessage, lang: Lang): Cta | null {
  const h = whatsappHref(msg, lang);
  if (!h) return null;
  return { label: lang === 'en' ? 'Chat on WhatsApp' : 'Falar pelo WhatsApp', href: h, kind: 'whatsapp', event: 'whatsapp_click', external: true };
}

/** True when the primary CTA already opens WhatsApp (avoid a duplicate button). */
export const primaryIsWhatsapp = (lang: Lang) => primaryCta(lang)?.kind === 'whatsapp';

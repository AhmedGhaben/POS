/**
 * Primary call-to-action state machine (About brief §4.5, WEBSITE_SPEC §3).
 * The label always says what actually happens; never a dead or fake link.
 *
 * | SIGNUP_OPEN | LEADS_OPEN | Primary            | Action                     |
 * |-------------|------------|--------------------|----------------------------|
 * | true        | any        | Começar →          | APP_URL/signup             |
 * | false       | true       | Pedir demonstração | /demonstracao (form)       |
 * | false       | false      | Pedir demonstração | WhatsApp (demo message)    |
 * | no WhatsApp |            | Pedir demonstração | approved email (mailto)    |
 * | nothing configured       | preview: disabled + label · public: hidden    |
 *
 * Row 3 (WhatsApp) is the default until the owner approves the state machine
 * (About brief §9.6).
 */
import { APP_URL, CONTACT_EMAIL, FLAGS, PREVIEW, WHATSAPP_NUMBER } from '../config';

export const WA_MESSAGES = {
  demo:
    'Olá! Vi o site da STORBIT e gostaria de pedir uma demonstração.\n' +
    'Nome da loja:\nCidade:\nNúmero de lojas:',
  sobre: 'Olá! Vi a página "Sobre" da STORBIT e tenho uma pergunta:',
  inicio: 'Olá! Vi o site da STORBIT e tenho uma pergunta:',
  comoFunciona:
    'Olá, vi a página Como funciona e quero ver a STORBIT a vender sem internet.',
  ajuda: 'Olá! Estive na página de ajuda da STORBIT e tenho uma pergunta:',
  planos: 'Olá! Gostaria de saber mais sobre os preços da STORBIT.',
  transferir: 'Olá! Gostaria de saber como instalar a STORBIT Caixa.',
  demonstracao: 'Olá! Gostaria de pedir uma demonstração da STORBIT.',
  naoEncontrada: 'Olá! Estava no site da STORBIT e não encontrei uma página.',
} as const;
export type WaMessage = keyof typeof WA_MESSAGES;

export const whatsappHref = (msg: WaMessage = 'inicio'): string =>
  WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WA_MESSAGES[msg])}`
    : '';

export const emailHref = (subject = 'Pedido de demonstração STORBIT'): string =>
  CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}` : '';

export type Cta = {
  label: string;
  href: string;
  kind: 'signup' | 'form' | 'whatsapp' | 'email' | 'pending';
  /** Analytics event name. */
  event: string;
  external: boolean;
};

export function primaryCta(): Cta | null {
  if (FLAGS.SIGNUP_OPEN) {
    return { label: 'Começar', href: `${APP_URL}/signup`, kind: 'signup', event: 'signup_click', external: true };
  }
  if (FLAGS.LEADS_OPEN) {
    return { label: 'Pedir demonstração', href: '/demonstracao', kind: 'form', event: 'demo_click', external: false };
  }
  if (WHATSAPP_NUMBER) {
    return { label: 'Pedir demonstração', href: whatsappHref('demo'), kind: 'whatsapp', event: 'whatsapp_click', external: true };
  }
  if (CONTACT_EMAIL) {
    return { label: 'Pedir demonstração', href: emailHref(), kind: 'email', event: 'email_click', external: true };
  }
  if (PREVIEW) {
    return { label: 'Pedir demonstração', href: '', kind: 'pending', event: '', external: false };
  }
  return null;
}

/** Secondary WhatsApp action; null when no number is configured. */
export function whatsappCta(msg: WaMessage): Cta | null {
  const href = whatsappHref(msg);
  if (!href) return null;
  return { label: 'Falar pelo WhatsApp', href, kind: 'whatsapp', event: 'whatsapp_click', external: true };
}

/** True when the primary CTA already opens WhatsApp (avoid a duplicate button). */
export const primaryIsWhatsapp = () => primaryCta()?.kind === 'whatsapp';

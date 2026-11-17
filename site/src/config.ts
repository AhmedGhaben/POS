/**
 * Site configuration, read once at build time from environment variables.
 *
 * Safe defaults: everything that could make the site promise something that
 * doesn't exist yet is OFF unless it is explicitly configured. An empty or
 * bracketed value (e.g. "[a confirmar]") counts as "not configured".
 *
 * Two layers:
 *  1. SITE_PREVIEW_MODE — private review builds only. Shows clearly labelled
 *     placeholders (videos "Em produção", pricing "Por definir", legal slots…)
 *     and a black "Pré-visualização privada" bar. Never set it in production.
 *  2. Content flags (WEBSITE_SPEC pass 4 §2) — what the public site may show.
 */

const env = (name: string): string => {
  const raw = (process.env[name] ?? '').trim();
  // Placeholders never count as real values.
  if (!raw || /^\[.*\]$/.test(raw) || raw.includes('[') || raw === '—') return '';
  return raw;
};
const flag = (name: string): boolean => /^(1|true|yes)$/i.test(env(name));
const list = (name: string): string[] =>
  env(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const PREVIEW = flag('SITE_PREVIEW_MODE');

/** Search engines are kept out unless the site is explicitly approved. */
export const INDEXABLE = flag('SITE_INDEXABLE') && !PREVIEW;

export const SITE_URL = env('SITE_URL') || 'https://storbit.example';

export const APP_URL = env('APP_URL').replace(/\/$/, '');
export const WHATSAPP_NUMBER = env('WHATSAPP_NUMBER').replace(/[^\d]/g, '');
export const CONTACT_EMAIL = env('CONTACT_EMAIL');
export const SUPPORT_HOURS = env('SUPPORT_HOURS');
export const LEADS_ENDPOINT = env('LEADS_ENDPOINT');
export const DOWNLOAD_URL = env('DOWNLOAD_URL');

export const FLAGS = {
  PRICING_PUBLISHED: flag('PRICING_PUBLISHED'),
  DOWNLOAD_PUBLIC: flag('DOWNLOAD_PUBLIC') && Boolean(DOWNLOAD_URL),
  SIGNUP_OPEN: flag('SIGNUP_OPEN') && Boolean(APP_URL),
  /** Lead form needs an endpoint AND approved legal pages (spec §3 gate). */
  LEADS_OPEN: flag('LEADS_OPEN') && Boolean(LEADS_ENDPOINT) && flag('LEGAL_APPROVED'),
  /** /termos, /privacidade, /cookies reviewed by a lawyer. */
  LEGAL_APPROVED: flag('LEGAL_APPROVED'),
  /** Founder story approved by the owner for publication (About brief §9.1). */
  FOUNDER_STORY_APPROVED: flag('FOUNDER_STORY_APPROVED'),
  /** AGT commitment sentence passed legal review (About brief §9.5). */
  AGT_SENTENCE_APPROVED: flag('AGT_SENTENCE_APPROVED'),
  /** Demos are actually being given (About brief §3.5). */
  DEMOS_AVAILABLE: flag('DEMOS_AVAILABLE'),
};

/** Entrar only when the Gestão URL exists for this environment. */
export const LOGIN_URL = APP_URL ? `${APP_URL}/login` : '';

/** Legal identity: only shown when every field is configured and approved. */
export const COMPANY = {
  legalName: env('COMPANY_LEGAL_NAME'),
  nif: env('COMPANY_NIF'),
  address: env('COMPANY_ADDRESS'),
  approved: flag('COMPANY_PUBLISH_APPROVED'),
};
export const COMPANY_PUBLISHABLE = Boolean(
  COMPANY.approved && COMPANY.legalName && COMPANY.nif && COMPANY.address,
);

/**
 * Claims that need a product test before they may appear publicly
 * (About brief [VERIFY] items, handoff §7). Comma-separated ids in
 * CLAIMS_VERIFIED, e.g. "power-cut,export".
 */
export type ClaimId = 'store-status' | 'power-cut' | 'export' | 'hardware-models';
const verified = new Set(list('CLAIMS_VERIFIED'));
export const CLAIM_VERIFIED = (id: ClaimId) => verified.has(id);

/** Cookieless analytics (optional). Nothing loads unless configured. */
export const PLAUSIBLE_DOMAIN = env('PLAUSIBLE_DOMAIN');
export const PLAUSIBLE_SRC = env('PLAUSIBLE_SRC') || 'https://plausible.io/js/script.tagged-events.js';

/** Snapshot used by the preview-only status page and the build check. */
export const CONFIG_SNAPSHOT = {
  SITE_PREVIEW_MODE: PREVIEW,
  SITE_INDEXABLE: INDEXABLE,
  SITE_URL,
  APP_URL: APP_URL || '(não definido)',
  WHATSAPP_NUMBER: WHATSAPP_NUMBER ? 'definido' : '(não definido)',
  CONTACT_EMAIL: CONTACT_EMAIL ? 'definido' : '(não definido)',
  SUPPORT_HOURS: SUPPORT_HOURS || '(não definido)',
  LEADS_ENDPOINT: LEADS_ENDPOINT ? 'definido' : '(não definido)',
  DOWNLOAD_URL: DOWNLOAD_URL ? 'definido' : '(não definido)',
  ...FLAGS,
  COMPANY_PUBLISHABLE,
  CLAIMS_VERIFIED: [...verified].join(', ') || '(nenhum)',
};
